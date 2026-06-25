// scripts/validate-homepage-flow.mjs
// Validates the Phase 2 homepage wiring end-to-end.
// Tests the /api/extract endpoint as consumed by the homepage button.
// Requires: npm run dev
// Run:      node scripts/validate-homepage-flow.mjs

import { writeFileSync } from "fs";

const BASE = "http://localhost:3000";
const EXTRACT_URL = `${BASE}/api/extract`;
const REAL_URL =
  "https://chatgpt.com/share/6a3b9a96-b39c-83ee-b869-1b4279145496";

let pass = 0, fail = 0;
function check(label, cond, detail = "") {
  if (cond) { console.log(`  ✅ ${label}`); pass++; }
  else       { console.log(`  ❌ ${label}${detail ? " — " + detail : ""}`); fail++; }
}

async function post(body) {
  const r = await fetch(EXTRACT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => null);
  return { status: r.status, json: j };
}

console.log("=".repeat(65));
console.log("Chat2PDF — Phase 2 Homepage Flow Validation");
console.log("=".repeat(65));
console.log(`API endpoint: ${EXTRACT_URL}\n`);

// ── Section 1: Dev server reachability ───────────────────────────────────────
console.log("── Section 1: Dev server reachability ──");
try {
  const r = await fetch(BASE, { signal: AbortSignal.timeout(5000) });
  check("Dev server responds", r.status < 500, `HTTP ${r.status}`);
} catch (e) {
  console.log(`  ❌ Dev server not reachable — ${e.message}`);
  console.log("  Start the server with: npm run dev\n");
  process.exit(1);
}

// ── Section 2: Empty / missing URL (simulates clicking Convert with empty box) ─
console.log("\n── Section 2: Empty / missing URL handling ──");

{
  const { status, json } = await post({ url: "" });
  check("Empty string → 400", status === 400, `got ${status}`);
  check("Error field present", typeof json?.error === "string", JSON.stringify(json));
}

{
  const { status } = await post({ url: "   " });
  check("Whitespace-only → 400", status === 400, `got ${status}`);
}

{
  const { status } = await post({});
  check("Missing url field → 400", status === 400, `got ${status}`);
}

// ── Section 3: Invalid URL format ────────────────────────────────────────────
console.log("\n── Section 3: Invalid URL format ──");

{
  const { status, json } = await post({ url: "not-a-url" });
  check("Non-URL string → 400", status === 400, `got ${status}`);
  check("Error message user-friendly", typeof json?.error === "string" && json.error.length > 0);
}

{
  const { status } = await post({ url: "http://" });
  check("Bare protocol → 400", status === 400, `got ${status}`);
}

// ── Section 4: Unsupported provider ──────────────────────────────────────────
console.log("\n── Section 4: Unsupported provider ──");

{
  const { status, json } = await post({ url: "https://example.com/page" });
  check("Unknown domain → 422", status === 422, `got ${status}`);
  check("Hint present in response", typeof json?.hint === "string" || typeof json?.error === "string");
}

{
  const { status } = await post({ url: "https://chatgpt.com/c/personal-conv-123" });
  check("Own-conversation /c/<id> → 422", status === 422, `got ${status}`);
}

// ── Section 5: Successful extraction (the actual homepage flow) ───────────────
console.log("\n── Section 5: Successful extraction ──");
console.log(`  Calling POST /api/extract with real URL...`);

let doc = null;
const start = Date.now();
const { status, json } = await post({ url: REAL_URL });
const elapsed = Date.now() - start;

check("HTTP 200", status === 200, `got ${status} — ${json?.error ?? ""}`);
check("Response has document key", !!json?.document, JSON.stringify(json));

if (json?.document) {
  doc = json.document;
  console.log(`  ✅ Received in ${elapsed} ms`);
}

// ── Section 6: ConversationDocument shape (what homepage stores in sessionStorage)
console.log("\n── Section 6: ConversationDocument shape ──");

if (doc) {
  check("id present and string",         typeof doc.id === "string" && doc.id.length > 0);
  check("id is stable conv-<hex>",       /^conv-[0-9a-f]+$/.test(doc.id));
  check("title is non-empty string",     typeof doc.title === "string" && doc.title.length > 0);
  check("provider is chatgpt",           doc.provider === "chatgpt");
  check("model is non-empty string",     typeof doc.model === "string" && doc.model.length > 0);
  check("url matches input URL",         doc.url === REAL_URL);
  check("createdAt is string",           typeof doc.createdAt === "string");
  check("wordCount is positive number",  typeof doc.wordCount === "number" && doc.wordCount > 0);
  check("description is string",         typeof doc.description === "string" && doc.description.length > 0);

  check("messages is array",             Array.isArray(doc.messages));
  check("messages not empty",            Array.isArray(doc.messages) && doc.messages.length > 0);
  if (Array.isArray(doc.messages)) {
    const roles = doc.messages.map(m => m.role);
    check("has user messages",           roles.includes("user"));
    check("has assistant messages",      roles.includes("assistant"));
    check("no system messages",          !roles.includes("system"));
    check("all messages have content",
      doc.messages.every(m => typeof m.content === "string" && m.content.trim().length > 0));
  }

  check("renderedMarkdown is string",    typeof doc.renderedMarkdown === "string");
  check("renderedMarkdown not empty",    typeof doc.renderedMarkdown === "string" && doc.renderedMarkdown.length > 50);
  check("renderedMarkdown has code",     typeof doc.renderedMarkdown === "string" && doc.renderedMarkdown.includes("```"));
  check("renderedMarkdown has User",     typeof doc.renderedMarkdown === "string" && doc.renderedMarkdown.includes("**User**"));
  check("renderedMarkdown has Assistant",typeof doc.renderedMarkdown === "string" && doc.renderedMarkdown.includes("**Assistant**"));

  check("metadata object present",       !!doc.metadata && typeof doc.metadata === "object");
  check("metadata.model set",            typeof doc.metadata?.model === "string");
  check("metadata.wordCount set",        typeof doc.metadata?.wordCount === "string");
  check("metadata.messageCount > 0",     typeof doc.metadata?.messageCount === "number" && doc.metadata.messageCount > 0);
  check("metadata.exportFormats array",  Array.isArray(doc.metadata?.exportFormats));
}

// ── Section 7: sessionStorage round-trip simulation ───────────────────────────
console.log("\n── Section 7: sessionStorage round-trip simulation ──");

if (doc) {
  let roundTripped = null;
  try {
    const serialized = JSON.stringify(doc);
    roundTripped = JSON.parse(serialized);
    check("JSON.stringify succeeds",     serialized.length > 100);
    check("JSON.parse round-trip ok",    roundTripped !== null);
    check("id survives round-trip",      roundTripped.id === doc.id);
    check("title survives round-trip",   roundTripped.title === doc.title);
    check("messages survive round-trip", Array.isArray(roundTripped.messages) &&
      roundTripped.messages.length === doc.messages.length);
    check("renderedMarkdown survives",   roundTripped.renderedMarkdown === doc.renderedMarkdown);
    console.log(`  ℹ  Serialized size: ${(JSON.stringify(doc).length / 1024).toFixed(1)} KB`);
  } catch (e) {
    check("Serialization error", false, e.message);
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(65)}`);
console.log(`Assertions: ${pass} passed, ${fail} failed`);

if (doc) {
  console.log(`\n── Extracted document ──`);
  console.log(`Title:       ${doc.title}`);
  console.log(`ID:          ${doc.id}`);
  console.log(`Provider:    ${doc.provider}`);
  console.log(`Model:       ${doc.model}`);
  console.log(`Messages:    ${doc.messages?.length ?? 0}`);
  console.log(`Word count:  ${doc.wordCount}`);
  console.log(`Description: ${doc.description?.slice(0, 80)}`);

  const results = {
    timestamp: new Date().toISOString(),
    phase: "Phase 2 — Homepage Wiring",
    endpoint: EXTRACT_URL,
    real_url: REAL_URL,
    elapsed_ms: elapsed,
    document_summary: {
      id: doc.id, title: doc.title, provider: doc.provider, model: doc.model,
      message_count: doc.messages?.length ?? 0, word_count: doc.wordCount,
      rendered_markdown_chars: doc.renderedMarkdown?.length ?? 0,
    },
    assertions: { passed: pass, failed: fail },
  };
  writeFileSync(
    "scripts/homepage-flow-results.json",
    JSON.stringify(results, null, 2),
    "utf8"
  );
  console.log("\n✅ Results → scripts/homepage-flow-results.json");
}

if (fail === 0) { console.log("🎉 All assertions passed.\n"); process.exit(0); }
else            { console.log("⚠  Failures — review above.\n"); process.exit(1); }
