// scripts/validate-chatgpt-real-extraction.mjs
// End-to-end validation against the real share URL using the updated pipeline.
// Mirrors src/providers/chatgpt.ts (RR7 primary, __NEXT_DATA__ fallback).
// Run: node scripts/validate-chatgpt-real-extraction.mjs

import { writeFileSync } from "fs";

const TARGET_URL =
  "https://chatgpt.com/share/6a3b9a96-b39c-83ee-b869-1b4279145496";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif," +
    "image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchPage(url) {
  const start = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: BROWSER_HEADERS,
      redirect: "follow",
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, error: `Network: ${e.message}`, elapsed: Date.now() - start };
  }
  const elapsed = Date.now() - start;
  if (!res.ok)
    return { ok: false, error: `HTTP ${res.status}`, elapsed, status: res.status };
  const html = await res.text();
  return { ok: true, html, status: res.status, elapsed, htmlLength: html.length, finalUrl: res.url };
}

// ── React Router 7 parser (mirrors chatgpt.ts) ────────────────────────────────

function extractEnqueuePayload(html) {
  const m = html.match(/streamController\.enqueue\("((?:[^"\\]|\\.)*)"\)/);
  if (!m) return null;
  try { return JSON.parse(`"${m[1]}"`); } catch { return null; }
}

function resolveFlatRef(flat, item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return {};
  const out = {};
  for (const [k, v] of Object.entries(item)) {
    const ki = parseInt(k.replace(/^_/, ""), 10);
    if (isNaN(ki)) continue;
    const keyName = flat[ki];
    if (typeof keyName !== "string") continue;
    out[keyName] = typeof v === "number" && v >= 0 && v < flat.length ? flat[v] : v;
  }
  return out;
}

function extractPartsText(flat, partsVal) {
  if (!Array.isArray(partsVal)) return "";
  const texts = [];
  for (const part of partsVal) {
    if (typeof part === "string") texts.push(part);
    else if (typeof part === "number") { const v = flat[part]; if (typeof v === "string") texts.push(v); }
    else if (Array.isArray(part)) {
      for (const sub of part) {
        if (typeof sub === "string") texts.push(sub);
        else if (typeof sub === "number") { const v = flat[sub]; if (typeof v === "string") texts.push(v); }
      }
    }
  }
  return texts.join("\n");
}

function resolveNodeFromFlat(flat, nodeIdx) {
  const nodeRaw = flat[nodeIdx];
  if (!nodeRaw || typeof nodeRaw !== "object" || Array.isArray(nodeRaw)) return null;
  const node = resolveFlatRef(flat, nodeRaw);
  const children = Array.isArray(node.children)
    ? node.children.filter(c => typeof c === "string")
    : [];
  const msgRaw = node.message;
  if (!msgRaw || typeof msgRaw !== "object" || Array.isArray(msgRaw))
    return { id: node.id, parent: node.parent ?? null, children, message: null };
  const msg = resolveFlatRef(flat, msgRaw);
  const authorRaw = msg.author;
  const author = authorRaw && typeof authorRaw === "object" && !Array.isArray(authorRaw)
    ? resolveFlatRef(flat, authorRaw) : {};
  const role = typeof author.role === "string" ? author.role : undefined;
  const contentRaw = msg.content;
  const content = contentRaw && typeof contentRaw === "object" && !Array.isArray(contentRaw)
    ? resolveFlatRef(flat, contentRaw) : {};
  const text = extractPartsText(flat, content.parts);
  const ctype = typeof content.content_type === "string" ? content.content_type : "text";
  const ct = typeof msg.create_time === "number" && msg.create_time > 0 ? msg.create_time : null;
  const ut = typeof msg.update_time === "number" && msg.update_time > 0 ? msg.update_time : null;
  const weight = typeof msg.weight === "number" ? msg.weight : 1;
  const recipient = typeof msg.recipient === "string" ? msg.recipient : "all";
  return {
    id: typeof node.id === "string" ? node.id : undefined,
    parent: typeof node.parent === "string" ? node.parent : null,
    children,
    message: {
      id: typeof msg.id === "string" ? msg.id : undefined,
      author: { role },
      content: { content_type: ctype, parts: text ? [text] : [] },
      create_time: ct, update_time: ut, weight, recipient,
    },
  };
}

function parseReactRouterStream(html) {
  const payload = extractEnqueuePayload(html);
  if (!payload) return null;
  let flat;
  try { flat = JSON.parse(payload); } catch { return null; }
  if (!Array.isArray(flat) || flat.length === 0) return null;
  const lcIdx = flat.indexOf("linear_conversation");
  if (lcIdx === -1) return null;
  const lcRaw = flat[lcIdx + 1];
  if (!Array.isArray(lcRaw)) return null;
  const nodeIndices = lcRaw.filter(v => typeof v === "number");
  const linearConversation = nodeIndices
    .map(i => resolveNodeFromFlat(flat, i))
    .filter(n => n !== null);
  const ptIdx = flat.indexOf("pageTitle");
  const title = ptIdx > -1 && typeof flat[ptIdx + 1] === "string" ? flat[ptIdx + 1] : undefined;
  const conversationId = flat.find(
    v => typeof v === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
  const modelName = flat.find(
    v => typeof v === "string" && /^(GPT|gpt-|o[0-9]|claude|gemini)/i.test(v)
  );
  const tss = flat.filter(v => typeof v === "number" && v > 1e9 && v < 1e10).sort((a, b) => a - b);
  return { title, conversation_id: conversationId, linear_conversation: linearConversation,
    create_time: tss[0], update_time: tss[tss.length - 1],
    ...(modelName ? { model: { slug: modelName } } : {}) };
}

// ── Legacy __NEXT_DATA__ fallback ─────────────────────────────────────────────

function parseNextDataScript(html) {
  const m = html.match(/<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function deepGet(obj, ...keys) {
  let cur = obj;
  for (const key of keys) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = cur[key];
  }
  return cur;
}

function findConversationData(nextData) {
  const candidates = [
    deepGet(nextData, "props", "pageProps", "serverResponse", "data"),
    deepGet(nextData, "props", "pageProps", "serverResponse"),
    deepGet(nextData, "props", "pageProps", "sharedConversation"),
    deepGet(nextData, "props", "pageProps"),
  ];
  for (const c of candidates) {
    if (c && typeof c === "object" &&
        (Array.isArray(c.linear_conversation) || typeof c.mapping === "object" || typeof c.title === "string"))
      return c;
  }
  return null;
}

// ── Normalization (mirrors chatgpt.ts) ────────────────────────────────────────

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

function extractTextContent(content) {
  if (!content) return "";
  if (content.content_type === "text" && Array.isArray(content.parts))
    return content.parts.filter(p => typeof p === "string" && p.trim()).join("\n");
  if (typeof content.text === "string") return content.text;
  if (Array.isArray(content.parts)) {
    const t = content.parts.filter(p => typeof p === "string" && p.trim());
    if (t.length) return t.join("\n");
  }
  return "";
}

function normalizeNode(node, index) {
  const msg = node.message;
  const content = extractTextContent(msg.content);
  const ts = typeof msg.create_time === "number" && msg.create_time > 0
    ? new Date(msg.create_time * 1000).toISOString() : null;
  return { id: msg.id ?? node.id ?? `msg-${index}`, role: msg.author.role,
    content, timestamp: ts, contentLength: content.length };
}

function normalizeFromLinear(nodes) {
  const filterLog = [];
  const messages = [];
  nodes.forEach((node, i) => {
    if (!shouldKeepNode(node)) { filterLog.push({ i, role: node.message?.author?.role, reason: "filtered" }); return; }
    const m = normalizeNode(node, i);
    if (!m.content.trim()) { filterLog.push({ i, role: m.role, reason: "empty" }); return; }
    messages.push(m);
  });
  return { messages, filterLog };
}

function assembleConversation(data, sourceUrl, jsonPath = "") {
  let rawCount = 0;
  let result;
  if (Array.isArray(data.linear_conversation) && data.linear_conversation.length > 0) {
    rawCount = data.linear_conversation.length;
    result = normalizeFromLinear(data.linear_conversation);
  } else { return { ok: false, error: "No linear_conversation or mapping" }; }
  const { messages, filterLog } = result;
  if (!messages.length) return { ok: false, error: "No extractable messages after filtering", filterLog };
  const firstUser = messages.find(m => m.role === "user");
  const title = typeof data.title === "string" && data.title.trim()
    ? data.title.trim()
    : firstUser ? firstUser.content.split("\n")[0].slice(0, 80) : "Untitled ChatGPT Conversation";
  const metadata = {};
  if (typeof data.create_time === "number" && data.create_time > 0)
    metadata.created = new Date(data.create_time * 1000).toISOString();
  if (data.model?.slug) metadata.model = String(data.model.slug);
  if (data.conversation_id) metadata.conversationId = String(data.conversation_id);
  if (jsonPath) metadata.chatgptJsonPath = jsonPath;
  metadata.filteredMessageCount = rawCount - messages.length;
  return { ok: true, title, messages, metadata, filterLog, rawCount };
}

// ── Content helpers ───────────────────────────────────────────────────────────

function hasCode(t) { return /```[\s\S]*?```/.test(t); }
function hasMd(t) { return /^#{1,6}\s/m.test(t) || /\*\*/.test(t) || /\|.+\|/.test(t); }
function codeCount(t) { return (t.match(/```[\s\S]*?```/g) || []).length; }
function codeLangs(t) { return [...new Set([...t.matchAll(/```(\w+)/g)].map(m => m[1]).filter(Boolean))]; }

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("=".repeat(65));
console.log("Chat2PDF — ChatGPT Real Extraction (React Router 7 Migration)");
console.log("=".repeat(65));
console.log(`URL: ${TARGET_URL}\n`);

// Step 1: Fetch
console.log("Step 1: Fetching...");
const fetchResult = await fetchPage(TARGET_URL);
if (!fetchResult.ok) { console.error(`❌ FETCH FAILED: ${fetchResult.error}`); process.exit(1); }
console.log(`  ✅ HTTP ${fetchResult.status} (${fetchResult.elapsed} ms, ${(fetchResult.htmlLength/1024).toFixed(1)} KB)`);
console.log(`  ✅ Final URL: ${fetchResult.finalUrl}`);

// Step 2: Parse (RR7 first)
console.log("\nStep 2: Parsing...");
let convData = null;
let jsonPath = "";
let parserUsed = "";

convData = parseReactRouterStream(fetchResult.html);
if (convData) {
  jsonPath = "react-router-7/streamController.enqueue/linear_conversation";
  parserUsed = "React Router 7";
  console.log(`  ✅ Parsed via React Router 7 stream format`);
} else {
  const nextData = parseNextDataScript(fetchResult.html);
  if (nextData) {
    const found = findConversationData(nextData);
    if (found) { convData = found; jsonPath = "__NEXT_DATA__/props.pageProps"; parserUsed = "__NEXT_DATA__"; }
  }
  if (convData) console.log(`  ⚠  Parsed via legacy __NEXT_DATA__ format`);
  else { console.error("  ❌ PARSE FAILED: No known format found"); process.exit(1); }
}

console.log(`  ✅ linear_conversation nodes: ${convData.linear_conversation?.length ?? 0}`);
console.log(`  ✅ title: "${convData.title ?? "(from message)"}"`);
console.log(`  ✅ model: ${convData.model?.slug ?? "(unknown)"}`);
console.log(`  ✅ conversation_id: ${convData.conversation_id ?? "(none)"}`);

// Step 3: Assemble
console.log("\nStep 3: Normalizing...");
const conv = assembleConversation(convData, TARGET_URL, jsonPath);
if (!conv.ok) { console.error(`❌ ASSEMBLY FAILED: ${conv.error}`); process.exit(1); }

const userMsgs = conv.messages.filter(m => m.role === "user");
const asstMsgs = conv.messages.filter(m => m.role === "assistant");
const fullText = conv.messages.map(m => m.content).join("\n\n");

console.log(`  ✅ Kept: ${conv.messages.length} messages (${userMsgs.length} user, ${asstMsgs.length} assistant)`);
console.log(`  ✅ Filtered: ${conv.metadata.filteredMessageCount} nodes removed`);
console.log(`  ✅ chatgptJsonPath: ${conv.metadata.chatgptJsonPath}`);

// Results
console.log("\n" + "=".repeat(65));
console.log("RESULTS");
console.log("=".repeat(65));
console.log(`Title:              ${conv.title}`);
console.log(`Parser used:        ${parserUsed}`);
console.log(`JSON path:          ${jsonPath}`);
console.log(`Raw nodes:          ${conv.rawCount}`);
console.log(`Kept messages:      ${conv.messages.length}`);
console.log(`Filtered out:       ${conv.metadata.filteredMessageCount}`);
console.log(`User messages:      ${userMsgs.length}`);
console.log(`Assistant messages: ${asstMsgs.length}`);
console.log(`Code blocks:        ${codeCount(fullText)}`);
console.log(`Code languages:     ${codeLangs(fullText).join(", ") || "none"}`);
console.log(`Markdown detected:  ${hasMd(fullText)}`);
console.log(`Model:              ${conv.metadata.model ?? "(unknown)"}`);
console.log(`Conversation ID:    ${conv.metadata.conversationId ?? "(none)"}`);

console.log("\n── Message summary ──");
conv.messages.forEach((msg, i) => {
  const flags = [hasCode(msg.content) && "code", hasMd(msg.content) && "md"].filter(Boolean).join("+") || "-";
  console.log(`  [${String(i+1).padStart(2)}] ${msg.role.padEnd(9)} ${String(msg.contentLength).padStart(6)} chars  ${flags.padEnd(8)} "${msg.content.replace(/\n/g," ").slice(0,70)}"`);
});

if (asstMsgs.length > 0) {
  console.log("\n── First assistant message (markdown/code verification) ──");
  console.log(asstMsgs[0].content.slice(0, 800));
}

if (conv.filterLog?.length > 0) {
  console.log(`\n── Filter log ──`);
  conv.filterLog.forEach(f => console.log(`  [${f.i}] role=${f.role ?? "?"} → ${f.reason}`));
}

// Assertions
console.log("\n── Assertions ──");
let pass = 0, fail = 0;
function check(label, cond, detail = "") {
  if (cond) { console.log(`  ✅ ${label}`); pass++; }
  else       { console.log(`  ❌ ${label}${detail ? " — " + detail : ""}`); fail++; }
}

check("Parser: React Router 7 used",   parserUsed === "React Router 7");
check("No __NEXT_DATA__ required",      parserUsed !== "__NEXT_DATA__");
check("Title extracted",               typeof conv.title === "string" && conv.title.length > 0);
check("Title meaningful",              conv.title !== "Untitled ChatGPT Conversation");
check("Message count > 0",            conv.messages.length > 0);
check("Has user messages",             userMsgs.length > 0);
check("Has assistant messages",        asstMsgs.length > 0);
check("No tool messages",              conv.messages.every(m => m.role === "user" || m.role === "assistant"));
check("No system messages in output",  conv.messages.every(m => m.role !== "system"));
check("All messages have content",     conv.messages.every(m => m.content.trim().length > 0));
check("Markdown preserved",            hasMd(fullText));
check("Code blocks preserved",         codeCount(fullText) > 0);
check("chatgptJsonPath set",           !!conv.metadata.chatgptJsonPath);
check("filteredMessageCount set",      typeof conv.metadata.filteredMessageCount === "number");
check("Conversation ID extracted",     !!conv.metadata.conversationId);
check("Model extracted",               !!conv.metadata.model);

console.log(`\n${"─".repeat(60)}`);
console.log(`Assertions: ${pass} passed, ${fail} failed`);

// Write JSON results
const results = {
  timestamp: new Date().toISOString(), url: TARGET_URL,
  fetch: { status: fetchResult.status, html_bytes: fetchResult.htmlLength, elapsed_ms: fetchResult.elapsed },
  parser_used: parserUsed, json_path: jsonPath,
  conversation: { title: conv.title, model: conv.metadata.model, conversation_id: conv.metadata.conversationId },
  counts: { raw_nodes: conv.rawCount, kept: conv.messages.length, filtered: conv.metadata.filteredMessageCount,
    user: userMsgs.length, assistant: asstMsgs.length },
  content: { code_blocks: codeCount(fullText), code_languages: codeLangs(fullText), markdown: hasMd(fullText) },
  metadata: conv.metadata,
  messages: conv.messages.map((m, i) => ({
    index: i+1, role: m.role, chars: m.contentLength,
    has_code: hasCode(m.content), has_md: hasMd(m.content),
    preview: m.content.replace(/\n/g," ").slice(0, 100),
  })),
  assertions: { passed: pass, failed: fail },
};
writeFileSync("scripts/chatgpt-extraction-results.json", JSON.stringify(results, null, 2), "utf8");
console.log("\n✅ Results → scripts/chatgpt-extraction-results.json");

if (fail === 0) { console.log("🎉 All assertions passed.\n"); process.exit(0); }
else { console.log("⚠  Failures — review above.\n"); process.exit(1); }
