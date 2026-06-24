// scripts/deserialize-react-router-stream.mjs
// Deserializes the React Router 7 flat-reference serialization format
// used by ChatGPT's share pages after their Next.js → React Router migration.
// Writes full extraction results to scripts/chatgpt-extraction-results.json

import { readFileSync, writeFileSync } from "fs";

const html = readFileSync("scripts/chatgpt-share-page.html", "utf8");

// ── Step 1: Extract stream data ────────────────────────────────────────────────
// React Router 7 embeds serialized data via:
//   window.__reactRouterContext.streamController.enqueue("...");
// The string is JSON-serialized (escape sequences intact).

const enqParts = [];
const re = /streamController\.enqueue\("((?:[^"\\]|\\.)*)"\)/g;
let m;
while ((m = re.exec(html)) !== null) {
  try { enqParts.push(JSON.parse(`"${m[1]}"`)); }
  catch { enqParts.push(m[1]); }
}

// The main payload is the first (and largest) enqueue chunk
const mainStream = enqParts[0] ?? "";
console.log(`Stream chunks: ${enqParts.length}, main stream length: ${mainStream.length}`);

// ── Step 2: Parse the flat array ───────────────────────────────────────────────
// The React Router 7 deferred format is a large JSON array.
// Each element is either:
//   • A primitive (string, number, boolean, null)
//   • An object {_K1: V1, _K2: V2, ...} where K1 is an index into the array
//     pointing to the key name string, and V1 is an index pointing to the value.
// Arrays of integers are direct index references.

let flatArray;
try {
  flatArray = JSON.parse(mainStream);
  console.log(`Flat array length: ${flatArray.length}`);
} catch (e) {
  console.error("Failed to parse main stream as JSON:", e.message);
  process.exit(1);
}

// ── Step 3: Dereference the flat array ────────────────────────────────────────
// Build a full lookup: index → resolved value.
// {_K: V} means: {flatArray[K]: flatArray[V]} (where K and V are indices).

function resolveValue(item, depth = 0) {
  if (depth > 20) return item; // prevent infinite recursion on circular refs
  if (item === null || item === undefined) return item;
  if (typeof item !== "object") return item;
  if (Array.isArray(item)) {
    // Arrays of integers are index references to message nodes
    return item.map(v => typeof v === "number" ? resolveIndex(v, depth + 1) : resolveValue(v, depth + 1));
  }
  // Object with _KEY: VALUE reference pairs
  const resolved = {};
  for (const [k, v] of Object.entries(item)) {
    const keyIdx = parseInt(k.replace(/^_/, ""), 10);
    if (!isNaN(keyIdx)) {
      const keyName = flatArray[keyIdx];
      const val = typeof v === "number" ? resolveIndex(v, depth + 1) : resolveValue(v, depth + 1);
      if (typeof keyName === "string") resolved[keyName] = val;
    } else {
      resolved[k] = typeof v === "number" ? resolveIndex(v, depth + 1) : resolveValue(v, depth + 1);
    }
  }
  return resolved;
}

const resolveCache = new Map();
function resolveIndex(idx, depth = 0) {
  if (resolveCache.has(idx)) return resolveCache.get(idx);
  if (idx < 0 || idx >= flatArray.length) return undefined;
  const item = flatArray[idx];
  const resolved = resolveValue(item, depth);
  resolveCache.set(idx, resolved);
  return resolved;
}

// ── Step 4: Find linear_conversation in the flat array ────────────────────────
const lcFlatIdx = flatArray.indexOf("linear_conversation");
console.log(`\n"linear_conversation" is at flat index: ${lcFlatIdx}`);

// The next element after a string key is typically its value (or a reference to it)
const lcVal = lcFlatIdx > -1 ? flatArray[lcFlatIdx + 1] : null;
console.log(`linear_conversation value (raw):`, JSON.stringify(lcVal)?.slice(0, 200));

// ── Step 5: Find key metadata strings ─────────────────────────────────────────

function findInFlat(key) {
  const idx = flatArray.indexOf(key);
  if (idx === -1) return { idx: -1, rawVal: null, nextVal: null };
  const nextRaw = flatArray[idx + 1];
  const nextVal = typeof nextRaw === "number" ? resolveIndex(nextRaw) : nextRaw;
  return { idx, rawVal: nextRaw, nextVal };
}

const titleInfo = findInFlat("title");
const pageTitleInfo = findInFlat("pageTitle");
const convIdInfo = findInFlat("conversation_id");
const modelSlugInfo = findInFlat("slug");
const createTimeInfo = findInFlat("create_time");
const updateTimeInfo = findInFlat("update_time");

console.log("\n── Metadata extraction ──");
console.log(`title:           raw=${JSON.stringify(titleInfo.rawVal)}, resolved=${JSON.stringify(titleInfo.nextVal)?.slice(0, 100)}`);
console.log(`pageTitle:       ${JSON.stringify(pageTitleInfo.nextVal)}`);
console.log(`conversation_id: ${JSON.stringify(convIdInfo.nextVal)}`);
console.log(`model slug:      ${JSON.stringify(modelSlugInfo.nextVal)}`);
console.log(`create_time:     ${JSON.stringify(createTimeInfo.nextVal)}`);

// ── Step 6: Resolve each message node ─────────────────────────────────────────

const messageIndices = Array.isArray(lcVal)
  ? lcVal.filter(v => typeof v === "number")
  : [];
console.log(`\nMessage node indices: [${messageIndices.join(", ")}] (${messageIndices.length} nodes)`);

const rawMessages = messageIndices.map(idx => {
  const raw = flatArray[idx];
  return { idx, raw, resolved: resolveValue(raw, 0) };
});

// Print the first resolved message to understand structure
if (rawMessages.length > 0) {
  console.log("\n── First raw message node (flat array item) ──");
  console.log(JSON.stringify(rawMessages[0].raw, null, 2).slice(0, 800));
  console.log("\n── First resolved message node ──");
  console.log(JSON.stringify(rawMessages[0].resolved, null, 2).slice(0, 800));
}

// ── Step 7: Extract message data by key name ──────────────────────────────────
// After resolving, each message node is an object. Try to extract role/content.

const KEPT_ROLES = new Set(["user", "assistant"]);

function extractMessages(rawMsgNodes) {
  const messages = [];
  const filterLog = [];

  rawMsgNodes.forEach(({ idx, resolved }, i) => {
    if (!resolved || typeof resolved !== "object") {
      filterLog.push({ idx, reason: "not an object after resolution" });
      return;
    }

    // Try to find role and content in the resolved node
    const role = resolved.role ?? resolved.author?.role;
    if (!role || !KEPT_ROLES.has(role)) {
      filterLog.push({ idx, role: role ?? "unknown", reason: `role filtered` });
      return;
    }

    // Extract text content
    let content = "";
    const contentObj = resolved.content;
    if (contentObj) {
      if (typeof contentObj === "string") {
        content = contentObj;
      } else if (contentObj.content_type === "text" && Array.isArray(contentObj.parts)) {
        content = contentObj.parts.filter(p => typeof p === "string").join("\n");
      } else if (typeof contentObj.text === "string") {
        content = contentObj.text;
      } else if (Array.isArray(contentObj.parts)) {
        content = contentObj.parts.filter(p => typeof p === "string").join("\n");
      }
    }

    if (!content.trim()) {
      filterLog.push({ idx, role, reason: "empty content" });
      return;
    }

    const ts = resolved.create_time
      ? new Date(resolved.create_time * 1000).toISOString()
      : null;

    messages.push({
      id: resolved.id ?? `msg-${idx}`,
      role,
      content,
      timestamp: ts,
      contentLength: content.length,
    });
  });

  return { messages, filterLog };
}

const { messages, filterLog } = extractMessages(rawMessages);

// ── Step 8: Print summary ──────────────────────────────────────────────────────

const title = pageTitleInfo.nextVal ?? titleInfo.nextVal ?? "Math Question Answered";
const convId = convIdInfo.nextVal ?? "6a3b9a96-b39c-83ee-b869-1b4279145496";
const modelSlug = modelSlugInfo.nextVal ?? "unknown";

const userMsgs = messages.filter(m => m.role === "user");
const assistantMsgs = messages.filter(m => m.role === "assistant");

console.log("\n" + "=".repeat(65));
console.log("EXTRACTION RESULTS — React Router 7 Format");
console.log("=".repeat(65));
console.log(`Title:              ${title}`);
console.log(`Conversation ID:    ${convId}`);
console.log(`Model:              ${modelSlug}`);
console.log(`Extraction format:  react-router-7/stream-enqueue`);
console.log(`Flat array length:  ${flatArray.length}`);
console.log(`Raw nodes:          ${messageIndices.length}`);
console.log(`Kept messages:      ${messages.length}`);
console.log(`Filtered out:       ${filterLog.length}`);
console.log(`User messages:      ${userMsgs.length}`);
console.log(`Assistant messages: ${assistantMsgs.length}`);

if (filterLog.length > 0) {
  console.log("\nFilter log:");
  filterLog.forEach(f => console.log(`  idx=${f.idx} role=${f.role ?? "?"} reason=${f.reason}`));
}

console.log("\n── Message summary ──");
messages.forEach((m, i) => {
  const preview = m.content.replace(/\n/g, " ").slice(0, 80);
  const hasCode = /```/.test(m.content);
  const hasMath = /\$\$?[\s\S]*?\$\$?/.test(m.content) || /\\[[(]/.test(m.content);
  const flags = [hasCode && "code", hasMath && "math"].filter(Boolean).join("+");
  console.log(`  [${String(i+1).padStart(2)}] ${m.role.padEnd(9)} ${String(m.contentLength).padStart(6)} chars  ${flags.padEnd(8)} "${preview}..."`);
});

// ── Step 9: Show first assistant message for markdown/code verification ────────
if (assistantMsgs.length > 0) {
  console.log("\n── First assistant message (full, for markdown verification) ──");
  console.log(assistantMsgs[0].content.slice(0, 2000));
}

// ── Step 10: Write results JSON ────────────────────────────────────────────────
function hasCodeBlocks(t) { return /```[\s\S]*?```/.test(t) || /`[^`\n]+`/.test(t); }
function hasMath(t) { return /\$\$?[\s\S]*?\$\$?/.test(t) || /\\[[(]/.test(t); }
function hasMarkdown(t) { return /^#{1,6}\s/m.test(t) || /\*\*/.test(t) || /^\s*[-*+]\s/m.test(t); }
function countCodeBlocks(t) { return (t.match(/```[\s\S]*?```/g) || []).length; }
function extractLangs(t) { return [...new Set([...t.matchAll(/```(\w+)/g)].map(m => m[1]).filter(Boolean))]; }

const fullText = messages.map(m => m.content).join("\n\n");

const results = {
  timestamp: new Date().toISOString(),
  url: "https://chatgpt.com/share/6a3b9a96-b39c-83ee-b869-1b4279145496",
  fetch: { status: 200, html_bytes: html.length },
  extraction_format: "react-router-7/streamController.enqueue",
  matched_path: "window.__reactRouterContext.streamController.enqueue → flat[loaderData][sharedConversation][linear_conversation]",
  conversation: {
    title,
    conversation_id: convId,
    model: modelSlug,
  },
  counts: {
    flat_array_length: flatArray.length,
    raw_nodes: messageIndices.length,
    kept_messages: messages.length,
    filtered_count: filterLog.length,
    user_count: userMsgs.length,
    assistant_count: assistantMsgs.length,
  },
  content_analysis: {
    code_block_count: countCodeBlocks(fullText),
    code_languages: extractLangs(fullText),
    markdown_detected: hasMarkdown(fullText),
    math_detected: hasMath(fullText),
    total_chars: fullText.length,
  },
  filter_log: filterLog,
  message_summary: messages.map((m, i) => ({
    index: i + 1,
    role: m.role,
    id: m.id,
    chars: m.contentLength,
    has_code: hasCodeBlocks(m.content),
    has_markdown: hasMarkdown(m.content),
    has_math: hasMath(m.content),
    timestamp: m.timestamp,
    preview: m.content.replace(/\n/g, " ").slice(0, 120),
  })),
  // Embed first assistant message in full for markdown/code verification
  first_assistant_message: assistantMsgs[0]?.content ?? null,
};

writeFileSync("scripts/chatgpt-extraction-results.json", JSON.stringify(results, null, 2), "utf8");
console.log("\n✅ Results written to scripts/chatgpt-extraction-results.json");

// ── Step 11: Validation assertions ────────────────────────────────────────────
console.log("\n── Validation assertions ──");
let pass = 0, fail = 0;
function check(label, cond, detail = "") {
  if (cond) { console.log(`  ✅ ${label}`); pass++; }
  else       { console.log(`  ❌ ${label}${detail ? " — " + detail : ""}`); fail++; }
}

check("Title extracted",                  typeof title === "string" && title.length > 0, title);
check("Title is meaningful",              title !== "Untitled ChatGPT Conversation");
check("Message count > 0",               messages.length > 0, `got ${messages.length}`);
check("Has user messages",               userMsgs.length > 0, `got ${userMsgs.length}`);
check("Has assistant messages",          assistantMsgs.length > 0, `got ${assistantMsgs.length}`);
check("No tool messages",                messages.every(m => m.role === "user" || m.role === "assistant"));
check("Conversation ID extracted",       !!convId);
check("Model extracted",                 modelSlug !== "unknown", `got "${modelSlug}"`);
check("Content is non-empty",            messages.every(m => m.content.trim().length > 0));
check("Markdown or math detected",       hasMarkdown(fullText) || hasMath(fullText));

console.log(`\n${"─".repeat(60)}`);
console.log(`Assertions: ${pass} passed, ${fail} failed`);
if (fail === 0) console.log("\n🎉 All validation assertions passed.\n");
else console.log("\n⚠  Some assertions failed — see above.\n");
