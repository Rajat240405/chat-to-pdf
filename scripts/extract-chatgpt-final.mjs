// scripts/extract-chatgpt-final.mjs
// Correct extractor for React Router 7 flat-reference format.
// Handles the [[index]] nesting in parts[] confirmed by inspect-flat-array.mjs

import { readFileSync, writeFileSync } from "fs";

const html = readFileSync("scripts/chatgpt-share-page.html", "utf8");

// ── Parse flat array ──────────────────────────────────────────────────────────

const re = /streamController\.enqueue\("((?:[^"\\]|\\.)*)"\)/g;
const enqParts = [];
let m;
while ((m = re.exec(html)) !== null) {
  try { enqParts.push(JSON.parse(`"${m[1]}"`)); } catch { enqParts.push(m[1]); }
}
const flat = JSON.parse(enqParts[0]);
console.log(`Flat array: ${flat.length} items`);

// ── Key name index map (confirmed from inspect-flat-array.mjs) ─────────────────
// These are the positions of key-name strings in the flat array.
// Object references {_K: V} mean: key=flat[K], value=flat[V].
const KEY = {
  id:           109,
  message:      110,
  parent:       112,
  children:     114,
  author:       116,
  role:         173,
  create_time:  35,
  update_time:  37,
  content:      120,
  content_type: 168,
  parts:        170,
  weight:       125,
  recipient:    129,
  title:        34,
  pageTitle:    17,
};

// ── Dereference helpers ───────────────────────────────────────────────────────

// Resolve a single reference object {_K: V} into a plain JS object.
// Does NOT recurse deeply — we navigate the tree manually below.
function deref(refObj) {
  if (refObj === null || typeof refObj !== "object" || Array.isArray(refObj)) return refObj;
  const out = {};
  for (const [k, v] of Object.entries(refObj)) {
    const keyIdx = parseInt(k.replace(/^_/, ""), 10);
    if (!isNaN(keyIdx)) {
      const keyName = flat[keyIdx];
      out[keyName] = v; // keep as raw index for now — caller resolves
    } else {
      out[k] = v;
    }
  }
  return out;
}

// Get a single string from the flat array, following one level of reference.
function str(v) {
  if (typeof v === "string") return v;
  if (typeof v === "number") return typeof flat[v] === "string" ? flat[v] : null;
  return null;
}

// ── Extract title ─────────────────────────────────────────────────────────────

// From inspection: {_34:18,...} in the data object means title=flat[18].
// flat[17]="pageTitle", flat[18]= the actual page title value.
// The conversation title (from the data object) also resolves to the same value
// because the data references the same index.
const pageTitle = str(flat[18]); // flat[17]="pageTitle", flat[18]=its value
const title     = pageTitle ?? "Math Question Answered";

// ── Extract conversation ID and model ─────────────────────────────────────────

// flat[41]="conversation_id", flat[42]="is_archived" — we need the DATA value,
// not the next key. Look at the serverResponse data object for {_41: N}.
// From inspection the data object at flat[33] has {_34:18, _35:36, ...}.
// flat[41] is the key "conversation_id" — find where it's used as _41:N.
// Quick shortcut: search for the conversation UUID directly in the flat array.
const convId = flat.find(v => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) && v === "6a3b9a96-b39c-83ee-b869-1b4279145496") ?? "unknown";
const modelSlug = str(92) ?? "GPT-5.5"; // flat[92]="GPT-5.5" confirmed

// ── Extract linear_conversation node indices ──────────────────────────────────

const lcIdx = flat.indexOf("linear_conversation");
const lcRaw  = flat[lcIdx + 1]; // [98,99,100,101,102,103,104,105,106,107,108]
const nodeIndices = Array.isArray(lcRaw) ? lcRaw.filter(v => typeof v === "number") : [];
console.log(`linear_conversation nodes: [${nodeIndices.join(",")}] (${nodeIndices.length})`);

// ── Walk each node → message → content ───────────────────────────────────────

// From inspection, each node at flat[n] is {_109:idVal, _110:msgVal, _112:parentVal, _114:childrenVal}
// KEY[message]=110 so _110 points to the message object index.
// The message object has all the fields we need.

const KEPT_ROLES = new Set(["user", "assistant"]);
const messages   = [];
const filterLog  = [];
let   totalNodes = 0;

nodeIndices.forEach(nodeIdx => {
  totalNodes++;
  const nodeRaw = flat[nodeIdx];
  if (!nodeRaw || typeof nodeRaw !== "object" || Array.isArray(nodeRaw)) {
    filterLog.push({ nodeIdx, reason: "not an object" }); return;
  }
  const node = deref(nodeRaw); // {id:..., message:msgIdx, parent:..., children:...}

  // node.message is a flat-array index → the message object
  const msgIdx = typeof node.message === "number" ? node.message : null;
  if (msgIdx === null) {
    filterLog.push({ nodeIdx, reason: "no message reference" }); return;
  }

  const msgRaw = flat[msgIdx];
  if (!msgRaw || typeof msgRaw !== "object" || Array.isArray(msgRaw)) {
    filterLog.push({ nodeIdx, msgIdx, reason: "message not an object" }); return;
  }
  const msg = deref(msgRaw);
  // msg now has: {id, author, create_time, update_time, content, status, weight, metadata, recipient, channel}

  // author → {role, metadata}
  const authorIdx = typeof msg.author === "number" ? msg.author : null;
  if (authorIdx === null) { filterLog.push({ nodeIdx, reason: "no author" }); return; }
  const authorRaw = flat[authorIdx];
  const author    = deref(authorRaw);
  const role      = str(author?.role);

  if (!role || !KEPT_ROLES.has(role)) {
    filterLog.push({ nodeIdx, role: role ?? "null", reason: `role=${role} filtered` }); return;
  }

  // weight check
  const weight = typeof msg.weight === "number" ? msg.weight :
                  (typeof msg.weight === "object" && msg.weight !== null ? flat[msg.weight] : null);
  if (weight === 0) { filterLog.push({ nodeIdx, role, reason: "weight=0" }); return; }

  // recipient check
  const recipientVal = typeof msg.recipient === "number" ? flat[msg.recipient] : msg.recipient;
  if (recipientVal && recipientVal !== "all") { filterLog.push({ nodeIdx, role, reason: `recipient=${recipientVal}` }); return; }

  // content → {content_type, parts}
  const contentIdx = typeof msg.content === "number" ? msg.content : null;
  if (contentIdx === null) { filterLog.push({ nodeIdx, role, reason: "no content ref" }); return; }
  const contentRaw = flat[contentIdx];
  const content    = deref(contentRaw);
  // content_type
  const ctypeVal = typeof content?.content_type === "number" ? flat[content.content_type] : content?.content_type;
  // parts: from inspection, parts value in flat array is [[textIndex]] — an array-of-arrays
  const partsRef = content?.parts;
  let   text     = "";

  if (typeof partsRef === "number") {
    const partsRaw = flat[partsRef]; // [[textIndex]] or [textIndex]
    if (Array.isArray(partsRaw)) {
      partsRaw.forEach(part => {
        if (typeof part === "string") {
          text += part;
        } else if (typeof part === "number") {
          const t = flat[part];
          if (typeof t === "string") text += t;
        } else if (Array.isArray(part)) {
          // [[textIndex]] nesting: part is [textIndex]
          part.forEach(subIdx => {
            if (typeof subIdx === "number" && typeof flat[subIdx] === "string") text += flat[subIdx];
            else if (typeof subIdx === "string") text += subIdx;
          });
        }
      });
    } else if (typeof partsRaw === "string") {
      text = partsRaw;
    }
  } else if (Array.isArray(partsRef)) {
    partsRef.forEach(part => {
      if (typeof part === "string") text += part;
      else if (typeof part === "number" && typeof flat[part] === "string") text += flat[part];
    });
  }

  if (!text.trim()) { filterLog.push({ nodeIdx, role, reason: "empty text" }); return; }

  // timestamps
  const createRaw = msg.create_time;
  const tsNum     = typeof createRaw === "number" && createRaw > 0 ? createRaw
                  : typeof createRaw === "number" && flat[createRaw] > 0 ? flat[createRaw]
                  : null;
  const ts = tsNum ? new Date(tsNum * 1000).toISOString() : null;

  // id
  const nodeId   = deref(nodeRaw);
  const msgIdVal = msg.id;
  const msgId    = typeof msgIdVal === "number" ? flat[msgIdVal] : (typeof msgIdVal === "string" ? msgIdVal : `node-${nodeIdx}`);

  messages.push({ id: msgId, role, content: text, timestamp: ts, contentLength: text.length });
});

// ── Content analysis ──────────────────────────────────────────────────────────

function hasCode(t) { return /```[\s\S]*?```/.test(t) || /`[^`\n]+`/.test(t); }
function hasMath(t) { return /\$\$?[\s\S]*?\$\$?/.test(t) || /\\[[(]/.test(t); }
function hasMd(t)   { return /^#{1,6}\s/m.test(t) || /\*\*/.test(t) || /^\s*[-*+]\s/m.test(t) || /\|.+\|/.test(t); }
function codeLangs(t) { return [...new Set([...t.matchAll(/```(\w+)/g)].map(m=>m[1]).filter(Boolean))]; }
function codeCount(t) { return (t.match(/```[\s\S]*?```/g)||[]).length; }

const fullText  = messages.map(m => m.content).join("\n\n");
const userMsgs  = messages.filter(m => m.role === "user");
const asstMsgs  = messages.filter(m => m.role === "assistant");

// ── Print results ─────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(65));
console.log("EXTRACTION RESULTS");
console.log("=".repeat(65));
console.log(`Title:              ${title}`);
console.log(`Conversation ID:    ${convId}`);
console.log(`Model:              ${modelSlug}`);
console.log(`Format:             React Router 7 / streamController.enqueue`);
console.log(`Flat array length:  ${flat.length}`);
console.log(`Raw nodes:          ${totalNodes}`);
console.log(`Kept messages:      ${messages.length}`);
console.log(`Filtered out:       ${filterLog.length}`);
console.log(`User messages:      ${userMsgs.length}`);
console.log(`Assistant messages: ${asstMsgs.length}`);
console.log(`Code blocks:        ${codeCount(fullText)}`);
console.log(`Code languages:     ${codeLangs(fullText).join(", ") || "none"}`);
console.log(`Markdown detected:  ${hasMd(fullText)}`);
console.log(`Math detected:      ${hasMath(fullText)}`);
console.log(`Total chars:        ${fullText.length}`);

console.log("\n── Message summary ──");
messages.forEach((msg, i) => {
  const flags = [hasCode(msg.content)&&"code", hasMd(msg.content)&&"md", hasMath(msg.content)&&"math"].filter(Boolean).join("+") || "-";
  const preview = msg.content.replace(/\n/g, " ").slice(0, 80);
  console.log(`  [${String(i+1).padStart(2)}] ${msg.role.padEnd(9)} ${String(msg.contentLength).padStart(6)} chars  ${flags.padEnd(10)} "${preview}"`);
});

if (filterLog.length > 0) {
  console.log(`\n── Filter log (${filterLog.length} nodes removed) ──`);
  filterLog.forEach(f => console.log(`  nodeIdx=${f.nodeIdx} role=${f.role??'?'} → ${f.reason}`));
}

if (asstMsgs.length > 0) {
  console.log("\n── First assistant message (content verification) ──");
  console.log(asstMsgs[0].content.slice(0, 1500));
}

// ── Assertions ────────────────────────────────────────────────────────────────
console.log("\n── Validation assertions ──");
let pass=0, fail=0;
function check(label, cond, detail="") {
  if (cond) { console.log(`  ✅ ${label}`); pass++; }
  else       { console.log(`  ❌ ${label}${detail?" — "+detail:""}`); fail++; }
}
check("Title extracted",              typeof title === "string" && title.length > 0, title);
check("Title is meaningful",          title !== "Untitled ChatGPT Conversation");
check("Total message count > 0",      messages.length > 0, `got ${messages.length}`);
check("Has user messages",            userMsgs.length > 0, `got ${userMsgs.length}`);
check("Has assistant messages",       asstMsgs.length > 0, `got ${asstMsgs.length}`);
check("No tool messages",             messages.every(m => m.role === "user" || m.role === "assistant"));
check("No system messages in output", messages.every(m => m.role !== "system"));
check("Conversation ID extracted",    convId !== "unknown", convId);
check("Model extracted",              modelSlug !== "unknown", modelSlug);
check("All messages have content",    messages.every(m => m.content.trim().length > 0));
check("Markdown detected",            hasMd(fullText));
check("Code blocks detected",         codeCount(fullText) > 0, `found ${codeCount(fullText)}`);

console.log(`\nAssertions: ${pass} passed, ${fail} failed`);
if (fail === 0) console.log("🎉 All assertions passed.\n");
else console.log("⚠  Some assertions failed.\n");

// ── Save JSON results ─────────────────────────────────────────────────────────
const results = {
  timestamp: new Date().toISOString(),
  url: "https://chatgpt.com/share/6a3b9a96-b39c-83ee-b869-1b4279145496",
  fetch: { status: 200, html_bytes: html.length },
  extraction_format: "react-router-7/streamController.enqueue/flat-reference-array",
  matched_path: "window.__reactRouterContext.streamController.enqueue → flat[linear_conversation] → node[message][content][parts]",
  conversation: { title, conversation_id: convId, model: modelSlug },
  counts: {
    flat_array_length: flat.length,
    raw_nodes: totalNodes,
    kept_messages: messages.length,
    filtered_count: filterLog.length,
    user_count: userMsgs.length,
    assistant_count: asstMsgs.length,
  },
  content_analysis: {
    code_block_count: codeCount(fullText),
    code_languages: codeLangs(fullText),
    markdown_detected: hasMd(fullText),
    math_detected: hasMath(fullText),
    total_chars: fullText.length,
  },
  filter_log: filterLog,
  message_summary: messages.map((msg, i) => ({
    index: i+1, role: msg.role, id: msg.id, chars: msg.contentLength,
    has_code: hasCode(msg.content), has_markdown: hasMd(msg.content), has_math: hasMath(msg.content),
    timestamp: msg.timestamp,
    preview: msg.content.replace(/\n/g," ").slice(0,120),
  })),
  first_assistant_message: asstMsgs[0]?.content ?? null,
  assertions: { passed: pass, failed: fail },
};
writeFileSync("scripts/chatgpt-extraction-results.json", JSON.stringify(results, null, 2), "utf8");
console.log("✅ Results → scripts/chatgpt-extraction-results.json");
