// scripts/validate-chatgpt-mapping-safety.mjs
// Run: node scripts/validate-chatgpt-mapping-safety.mjs
//
// Validates the cycle guard in normalizeFromMapping() by exercising it with
// several crafted mapping graphs (including cyclic ones) in plain Node.js.
// No TypeScript compiler required.

// ── Inline normalizeFromMapping with cycle guard (mirrors chatgpt.ts) ──────────

// These match the shouldKeepNode / normalizeNode behaviour from chatgpt.ts.
// We care about traversal order and cycle safety here, not full normalization.

const KEPT_ROLES = new Set(["user", "assistant"]);

function shouldKeepNode(node) {
  const msg = node.message;
  if (!msg) return false;
  if (!msg.author?.role) return false;
  if (!KEPT_ROLES.has(msg.author.role)) return false;
  if (msg.weight === 0) return false;
  if (msg.recipient && msg.recipient !== "all") return false;
  return true;
}

function extractText(content) {
  if (!content) return "";
  if (content.content_type === "text" && Array.isArray(content.parts)) {
    return content.parts.filter(p => typeof p === "string" && p.trim().length > 0).join("\n");
  }
  if (typeof content.text === "string") return content.text;
  if (Array.isArray(content.parts)) {
    const s = content.parts.filter(p => typeof p === "string" && p.trim().length > 0);
    if (s.length > 0) return s.join("\n");
  }
  return "";
}

function normalizeNode(node, index) {
  const msg = node.message;
  const content = extractText(msg.content);
  return {
    id: msg.id ?? node.id ?? `chatgpt-msg-${index}`,
    role: msg.author.role,
    content,
  };
}

/**
 * The guarded version — matches src/providers/chatgpt.ts after the safety fix.
 */
function normalizeFromMapping(mapping) {
  const roots = Object.values(mapping).filter(
    node => !node.parent || !(node.parent in mapping)
  );
  if (roots.length === 0) return [];

  const ordered = [];
  const visited = new Set(); // ← cycle guard

  function walk(nodeId) {
    if (visited.has(nodeId)) return; // cycle detected — stop
    const node = mapping[nodeId];
    if (!node) return;
    visited.add(nodeId);
    ordered.push(node);
    const children = node.children ?? [];
    if (children.length > 0) {
      walk(children[children.length - 1]);
    }
  }

  walk(roots[0].id ?? Object.keys(mapping)[0]);

  return ordered
    .filter(shouldKeepNode)
    .map(normalizeNode)
    .filter(m => m.content.trim().length > 0);
}

/**
 * The UNGUARDED version — mirrors the old code before the fix.
 * Used to prove that the old code WOULD hang on cyclic input.
 * We call it with a timeout so the test suite doesn't actually hang.
 */
function normalizeFromMappingUnsafe(mapping) {
  const roots = Object.values(mapping).filter(
    node => !node.parent || !(node.parent in mapping)
  );
  if (roots.length === 0) return [];
  const ordered = [];
  function walk(nodeId) {
    const node = mapping[nodeId];
    if (!node) return;
    ordered.push(node);
    const children = node.children ?? [];
    if (children.length > 0) walk(children[children.length - 1]);
  }
  walk(roots[0].id ?? Object.keys(mapping)[0]);
  return ordered.filter(shouldKeepNode).map(normalizeNode);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMsg(id, role, text) {
  return {
    id,
    parent: null,
    children: [],
    message: {
      id,
      author: { role },
      content: { content_type: "text", parts: [text] },
      weight: 1,
    },
  };
}

// A → B → C (normal linear chain, no cycle)
const LINEAR = {
  A: { ...makeMsg("A", "user",      "Hello"),   parent: null,   children: ["B"] },
  B: { ...makeMsg("B", "assistant", "Hi there"), parent: "A",    children: ["C"] },
  C: { ...makeMsg("C", "user",      "Thanks"),  parent: "B",    children: [] },
};

// A → B → C with an edit branch at B: B also has an old child B2
// Last child of B is C, so C is the "current" response.
const BRANCHED = {
  A:  { ...makeMsg("A",  "user",      "Hello"),        parent: null, children: ["B"] },
  B:  { ...makeMsg("B",  "assistant", "Response v1"),  parent: "A",  children: ["B2", "C"] },
  B2: { ...makeMsg("B2", "assistant", "Response v2"),  parent: "A",  children: [] },
  C:  { ...makeMsg("C",  "user",      "Follow-up"),    parent: "B",  children: [] },
};

// Simple direct cycle: A.children → [B], B.children → [A]
const SIMPLE_CYCLE = {
  A: { ...makeMsg("A", "user",      "Hello"),   parent: null, children: ["B"] },
  B: { ...makeMsg("B", "assistant", "Hi"),      parent: "A",  children: ["A"] },  // ← cycle back to A
};

// Self-referential: A.children → [A]
const SELF_REF = {
  A: { ...makeMsg("A", "user", "Hello"), parent: null, children: ["A"] }, // ← A → A
};

// Longer cycle: A → B → C → D → B
const LONG_CYCLE = {
  A: { ...makeMsg("A", "user",      "Q1"),    parent: null, children: ["B"] },
  B: { ...makeMsg("B", "assistant", "A1"),    parent: "A",  children: ["C"] },
  C: { ...makeMsg("C", "user",      "Q2"),    parent: "B",  children: ["D"] },
  D: { ...makeMsg("D", "assistant", "A2"),    parent: "C",  children: ["B"] }, // ← cycle back to B
};

// Empty mapping
const EMPTY = {};

// All nodes reference each other as parent — no roots detected
const NO_ROOTS = {
  A: { ...makeMsg("A", "user",      "Hello"), parent: "B", children: ["B"] },
  B: { ...makeMsg("B", "assistant", "Hi"),    parent: "A", children: ["A"] },
};

// Node in children[] that doesn't exist in mapping (dangling ref)
const DANGLING_REF = {
  A: { ...makeMsg("A", "user",      "Hello"), parent: null, children: ["GHOST"] },
};

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

/**
 * Runs normalizeFromMapping with a hard timeout.
 * Returns { result, timedOut }.
 * A timedOut response proves the unguarded version would hang.
 */
async function runWithTimeout(fn, mapping, ms = 200) {
  return new Promise(resolve => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; resolve({ result: null, timedOut: true }); }
    }, ms);
    try {
      const result = fn(mapping);
      clearTimeout(timer);
      if (!done) { done = true; resolve({ result, timedOut: false }); }
    } catch (e) {
      clearTimeout(timer);
      if (!done) { done = true; resolve({ result: null, timedOut: false, error: String(e) }); }
    }
  });
}

// ── Suite 1: Correct traversal on normal graphs ───────────────────────────────

console.log("\n=== Suite 1 — Correct traversal (no cycles) ===\n");

{
  const msgs = normalizeFromMapping(LINEAR);
  assert("Linear A→B→C: 3 messages returned",  msgs.length === 3, `got ${msgs.length}`);
  assert("Linear A→B→C: order is A,B,C",       msgs.map(m => m.id).join(",") === "A,B,C");
  assert("Linear A→B→C: roles correct",         msgs[0].role === "user" && msgs[1].role === "assistant" && msgs[2].role === "user");
  assert("Linear A→B→C: content correct",       msgs[0].content === "Hello" && msgs[1].content === "Hi there");
}

{
  const msgs = normalizeFromMapping(BRANCHED);
  // B has children [B2, C] — last child is C (current branch), B2 is discarded
  assert("Branched: 3 messages returned (last-child wins)",    msgs.length === 3, `got ${msgs.length}`);
  assert("Branched: order is A,B,C (not B2)",                  msgs.map(m => m.id).join(",") === "A,B,C");
  assert("Branched: B2 (older branch) not present",            !msgs.find(m => m.id === "B2"));
}

// ── Suite 2: Cycle safety (guarded version) ───────────────────────────────────

console.log("\n=== Suite 2 — Cycle safety (guarded normalizeFromMapping) ===\n");

{
  // Simple cycle: A → B → A
  const { result, timedOut, error } = await runWithTimeout(normalizeFromMapping, SIMPLE_CYCLE, 500);
  assert("Simple cycle: does NOT time out",         timedOut === false && !error, error ?? "");
  assert("Simple cycle: returns Array",             Array.isArray(result));
  assert("Simple cycle: A and B both present",      result && result.length === 2, `got ${result?.length}`);
  assert("Simple cycle: order is A then B",         result && result.map(m => m.id).join(",") === "A,B");
}

{
  // Self-referential: A → A
  const { result, timedOut, error } = await runWithTimeout(normalizeFromMapping, SELF_REF, 500);
  assert("Self-ref cycle: does NOT time out",       timedOut === false && !error, error ?? "");
  assert("Self-ref cycle: returns exactly 1 msg",   result && result.length === 1, `got ${result?.length}`);
  assert("Self-ref cycle: message is A",            result && result[0]?.id === "A");
}

{
  // Longer cycle: A → B → C → D → B
  const { result, timedOut, error } = await runWithTimeout(normalizeFromMapping, LONG_CYCLE, 500);
  assert("Long cycle A→B→C→D→B: does NOT time out",  timedOut === false && !error, error ?? "");
  assert("Long cycle: 4 messages (A,B,C,D)",          result && result.length === 4, `got ${result?.length}`);
  assert("Long cycle: correct order A,B,C,D",         result && result.map(m => m.id).join(",") === "A,B,C,D");
}

// ── Suite 3: Prove unguarded version hangs (regression proof) ─────────────────

console.log("\n=== Suite 3 — Regression proof: unguarded version hangs on cycles ===\n");
console.log("  (Timeout = 200 ms — a real hang would be permanent)");

{
  const { result, timedOut } = await runWithTimeout(normalizeFromMappingUnsafe, SIMPLE_CYCLE, 200);
  assert(
    "Unguarded version times out or stack-overflows on simple cycle",
    timedOut === true || result === null,
    timedOut ? "timed out as expected" : "returned (may have hit call-stack limit)"
  );
}

// ── Suite 4: Edge cases ────────────────────────────────────────────────────────

console.log("\n=== Suite 4 — Edge cases ===\n");

{
  const result = normalizeFromMapping(EMPTY);
  assert("Empty mapping: returns []",    Array.isArray(result) && result.length === 0);
}

{
  const result = normalizeFromMapping(NO_ROOTS);
  assert("No-roots mapping: returns []", Array.isArray(result) && result.length === 0);
}

{
  // Dangling child ref: A.children → ["GHOST"] where "GHOST" not in mapping
  const { result, timedOut, error } = await runWithTimeout(normalizeFromMapping, DANGLING_REF, 500);
  assert("Dangling child ref: does NOT throw or hang", timedOut === false && !error, error ?? "");
  // A is the root and has a keepable message; GHOST is skipped silently
  assert("Dangling child ref: A is returned",          result && result.length === 1 && result[0].id === "A", `got ${JSON.stringify(result?.map(m=>m.id))}`);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log("\n🎉 All mapping safety checks passed.\n");
  process.exit(0);
} else {
  console.log("\n⚠  Failures — review output above.\n");
  process.exit(1);
}
