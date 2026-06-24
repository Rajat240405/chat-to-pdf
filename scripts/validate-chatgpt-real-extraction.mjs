// scripts/validate-chatgpt-real-extraction.mjs
// Run: node scripts/validate-chatgpt-real-extraction.mjs
//
// End-to-end extraction test against a real public ChatGPT share URL.
// Mirrors the full pipeline from src/providers/chatgpt.ts in plain JS.
// Produces structured JSON output consumed by the report generator.

const TARGET_URL = "https://chatgpt.com/share/6a3b9a96-b39c-83ee-b869-1b4279145496";

// ── Browser-like headers (mirrors BROWSER_HEADERS in chatgpt.ts) ──────────────

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

// ── Inline pipeline (mirrors chatgpt.ts exactly) ───────────────────────────────

function parseNextDataScript(html) {
  const match = html.match(/<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return { data: null, error: "__NEXT_DATA__ script tag not found in HTML" };
  try {
    return { data: JSON.parse(match[1]), error: null };
  } catch (e) {
    return { data: null, error: `JSON.parse failed: ${e.message}` };
  }
}

function deepGet(obj, ...keys) {
  let cur = obj;
  for (const key of keys) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = cur[key];
  }
  return cur;
}

const CANDIDATE_PATHS = [
  ["props", "pageProps", "serverResponse", "data"],
  ["props", "pageProps", "serverResponse"],
  ["props", "pageProps", "sharedConversation"],
  ["props", "pageProps"],
];

function findConversationData(nextData) {
  for (const path of CANDIDATE_PATHS) {
    const candidate = deepGet(nextData, ...path);
    if (
      candidate !== null &&
      candidate !== undefined &&
      typeof candidate === "object" &&
      (
        Array.isArray(candidate.linear_conversation) ||
        typeof candidate.mapping === "object" ||
        typeof candidate.title === "string"
      )
    ) {
      return { data: candidate, path: path.join(".") };
    }
  }
  return { data: null, path: null };
}

const KEPT_ROLES = new Set(["user", "assistant"]);

function shouldKeepNode(node) {
  const msg = node.message;
  if (!msg) return { keep: false, reason: "no message" };
  if (!msg.author?.role) return { keep: false, reason: "no author role" };
  if (!KEPT_ROLES.has(msg.author.role)) return { keep: false, reason: `role=${msg.author.role}` };
  if (msg.weight === 0) return { keep: false, reason: "weight=0" };
  if (msg.recipient && msg.recipient !== "all") return { keep: false, reason: `recipient=${msg.recipient}` };
  return { keep: true, reason: null };
}

function extractTextContent(content) {
  if (!content) return { text: "", type: "null" };
  if (content.content_type === "text" && Array.isArray(content.parts)) {
    const text = content.parts
      .filter(p => typeof p === "string" && p.trim().length > 0)
      .join("\n");
    return { text, type: "text/parts" };
  }
  if (typeof content.text === "string") {
    return { text: content.text, type: "text/direct" };
  }
  if (Array.isArray(content.parts)) {
    const textParts = content.parts.filter(p => typeof p === "string" && p.trim().length > 0);
    if (textParts.length > 0) return { text: textParts.join("\n"), type: "parts/mixed" };
  }
  return { text: "", type: content.content_type ?? "unknown" };
}

function normalizeNode(node, index) {
  const msg = node.message;
  const { text: content, type: contentType } = extractTextContent(msg.content);
  const ts =
    typeof msg.create_time === "number" && msg.create_time > 0
      ? new Date(msg.create_time * 1000).toISOString()
      : null;
  return {
    id: msg.id ?? node.id ?? `chatgpt-msg-${index}`,
    role: msg.author.role,
    content,
    contentType,
    timestamp: ts,
    contentLength: content.length,
  };
}

function normalizeFromLinear(nodes) {
  const filtered = [];
  const filterLog = [];

  nodes.forEach((node, i) => {
    const { keep, reason } = shouldKeepNode(node);
    if (!keep) {
      filterLog.push({
        index: i,
        id: node.message?.id ?? node.id ?? `node-${i}`,
        role: node.message?.author?.role ?? "unknown",
        reason,
      });
      return;
    }
    const normalized = normalizeNode(node, i);
    if (normalized.content.trim().length === 0) {
      filterLog.push({ index: i, id: normalized.id, role: normalized.role, reason: "empty content" });
      return;
    }
    filtered.push(normalized);
  });

  return { messages: filtered, filterLog, strategy: "linear_conversation" };
}

function normalizeFromMapping(mapping) {
  const roots = Object.values(mapping).filter(
    node => !node.parent || !(node.parent in mapping)
  );
  if (roots.length === 0) return { messages: [], filterLog: [], strategy: "mapping/no-roots" };

  const ordered = [];
  const visited = new Set(); // cycle guard

  function walk(nodeId) {
    if (visited.has(nodeId)) return;
    const node = mapping[nodeId];
    if (!node) return;
    visited.add(nodeId);
    ordered.push(node);
    const children = node.children ?? [];
    if (children.length > 0) walk(children[children.length - 1]);
  }

  walk(roots[0].id ?? Object.keys(mapping)[0]);

  const filtered = [];
  const filterLog = [];

  ordered.forEach((node, i) => {
    const { keep, reason } = shouldKeepNode(node);
    if (!keep) {
      filterLog.push({ index: i, id: node.message?.id ?? node.id, role: node.message?.author?.role, reason });
      return;
    }
    const normalized = normalizeNode(node, i);
    if (normalized.content.trim().length === 0) {
      filterLog.push({ index: i, id: normalized.id, role: normalized.role, reason: "empty content" });
      return;
    }
    filtered.push(normalized);
  });

  return { messages: filtered, filterLog, strategy: "mapping" };
}

function assembleConversation(data, sourceUrl) {
  let result;

  if (Array.isArray(data.linear_conversation) && data.linear_conversation.length > 0) {
    result = normalizeFromLinear(data.linear_conversation);
    result.rawCount = data.linear_conversation.length;
  } else if (data.mapping && typeof data.mapping === "object") {
    result = normalizeFromMapping(data.mapping);
    result.rawCount = Object.keys(data.mapping).length;
  } else {
    return { ok: false, error: "No linear_conversation or mapping found" };
  }

  const { messages, filterLog, strategy, rawCount } = result;

  if (messages.length === 0) {
    return { ok: false, error: "No extractable messages after filtering", filterLog, strategy };
  }

  const firstUserMsg = messages.find(m => m.role === "user");
  const title =
    typeof data.title === "string" && data.title.trim().length > 0
      ? data.title.trim()
      : firstUserMsg
      ? firstUserMsg.content.split("\n")[0].slice(0, 80).trim()
      : "Untitled ChatGPT Conversation";

  const metadata = {};
  if (typeof data.create_time === "number" && data.create_time > 0) {
    metadata.created = new Date(data.create_time * 1000).toISOString();
  }
  if (typeof data.update_time === "number" && data.update_time > 0) {
    metadata.updated = new Date(data.update_time * 1000).toISOString();
  }
  if (data.model && typeof data.model === "object" && data.model.slug) {
    metadata.model = String(data.model.slug);
  }
  if (data.conversation_id) {
    metadata.conversationId = String(data.conversation_id);
  }

  return {
    ok: true,
    provider: "chatgpt",
    title,
    messages,
    sourceUrl,
    metadata,
    strategy,
    rawCount,
    filterLog,
  };
}

// ── Fetch layer ────────────────────────────────────────────────────────────────

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
    return { ok: false, error: `Network error: ${e.message}`, elapsed: Date.now() - start };
  }

  const elapsed = Date.now() - start;

  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status} ${res.statusText}`, elapsed, status: res.status };
  }

  const html = await res.text();
  return {
    ok: true,
    html,
    status: res.status,
    elapsed,
    htmlLength: html.length,
    hasNextData: html.includes("__NEXT_DATA__"),
    finalUrl: res.url,
  };
}

// ── Content analysis helpers ──────────────────────────────────────────────────

function hasCodeBlocks(text) {
  return /```[\s\S]*?```/.test(text) || /`[^`\n]+`/.test(text);
}

function hasMarkdown(text) {
  return /^#{1,6}\s/m.test(text) ||
         /\*\*[^*]+\*\*/.test(text) ||
         /\*[^*\n]+\*/.test(text) ||
         /^\s*[-*+]\s/m.test(text) ||
         /^\s*\d+\.\s/m.test(text) ||
         /\[.+\]\(.+\)/.test(text);
}

function countCodeBlocks(text) {
  const matches = text.match(/```[\s\S]*?```/g);
  return matches ? matches.length : 0;
}

function extractCodeLanguages(text) {
  const matches = [...text.matchAll(/```(\w+)/g)];
  return [...new Set(matches.map(m => m[1]).filter(Boolean))];
}

// ── Main ───────────────────────────────────────────────────────────────────────

console.log("=".repeat(65));
console.log("Chat2PDF — ChatGPT Real Extraction Test");
console.log("=".repeat(65));
console.log(`URL: ${TARGET_URL}\n`);

// Step 1: Fetch
console.log("Step 1: Fetching share page...");
const fetchResult = await fetchPage(TARGET_URL);

if (!fetchResult.ok) {
  console.error(`\n❌ FETCH FAILED: ${fetchResult.error}`);
  console.error(`   Status: ${fetchResult.status ?? "N/A"}`);
  process.exit(1);
}

console.log(`  ✅ HTTP ${fetchResult.status}  (${fetchResult.elapsed} ms)`);
console.log(`  ✅ HTML length: ${(fetchResult.htmlLength / 1024).toFixed(1)} KB`);
console.log(`  ✅ Final URL: ${fetchResult.finalUrl}`);
console.log(`  ${fetchResult.hasNextData ? "✅" : "❌"} __NEXT_DATA__ tag present`);

if (!fetchResult.hasNextData) {
  console.error("\n❌ PARSE FAILED: __NEXT_DATA__ not found in HTML.");
  console.error("   Possible causes: bot-block page, login redirect, page structure changed.");
  process.exit(1);
}

// Step 2: Parse __NEXT_DATA__
console.log("\nStep 2: Parsing __NEXT_DATA__...");
const { data: nextData, error: parseError } = parseNextDataScript(fetchResult.html);

if (!nextData) {
  console.error(`\n❌ PARSE FAILED: ${parseError}`);
  process.exit(1);
}

console.log(`  ✅ __NEXT_DATA__ parsed successfully`);
console.log(`  ✅ Top-level keys: ${Object.keys(nextData).join(", ")}`);

// Step 3: Find conversation payload
console.log("\nStep 3: Locating conversation data...");
const { data: convData, path: matchedPath } = findConversationData(nextData);

if (!convData) {
  console.error("\n❌ LOCATE FAILED: None of the 4 known paths matched.");
  console.error("   Paths tried:", CANDIDATE_PATHS.map(p => p.join(".")).join(", "));
  process.exit(1);
}

console.log(`  ✅ Matched path: ${matchedPath}`);
console.log(`  ✅ Has linear_conversation: ${Array.isArray(convData.linear_conversation)} (${convData.linear_conversation?.length ?? 0} nodes)`);
console.log(`  ✅ Has mapping: ${typeof convData.mapping === "object" && !!convData.mapping} (${convData.mapping ? Object.keys(convData.mapping).length : 0} entries)`);
console.log(`  ✅ Has title: ${typeof convData.title === "string"} ("${convData.title ?? ""}")`);

// Step 4: Assemble conversation
console.log("\nStep 4: Normalizing messages...");
const conv = assembleConversation(convData, TARGET_URL);

if (!conv.ok) {
  console.error(`\n❌ ASSEMBLY FAILED: ${conv.error}`);
  if (conv.filterLog?.length) {
    console.error("   Filter log:");
    conv.filterLog.forEach(f => console.error(`     [${f.role}] ${f.id}: ${f.reason}`));
  }
  process.exit(1);
}

// ── Results summary ───────────────────────────────────────────────────────────

const userMsgs      = conv.messages.filter(m => m.role === "user");
const assistantMsgs = conv.messages.filter(m => m.role === "assistant");
const totalRaw      = conv.rawCount;
const totalKept     = conv.messages.length;
const totalFiltered = conv.filterLog.length;

// Aggregate content analysis across all messages
const fullText         = conv.messages.map(m => m.content).join("\n\n");
const codeBlockCount   = countCodeBlocks(fullText);
const codeLanguages    = extractCodeLanguages(fullText);
const markdownDetected = hasMarkdown(fullText);

// Per-message content summary (role + first 80 chars)
const messageSummary = conv.messages.map((m, i) => ({
  index: i + 1,
  role: m.role,
  id: m.id.slice(0, 8) + "...",
  chars: m.contentLength,
  hasCode: hasCodeBlocks(m.content),
  hasMarkdown: hasMarkdown(m.content),
  preview: m.content.replace(/\n/g, " ").slice(0, 80),
  timestamp: m.timestamp,
}));

console.log("\n" + "=".repeat(65));
console.log("EXTRACTION RESULTS");
console.log("=".repeat(65));
console.log(`Title:              ${conv.title}`);
console.log(`Strategy:           ${conv.strategy}`);
console.log(`Matched path:       ${matchedPath}`);
console.log(`Raw nodes:          ${totalRaw}`);
console.log(`Kept messages:      ${totalKept}`);
console.log(`Filtered out:       ${totalFiltered}`);
console.log(`User messages:      ${userMsgs.length}`);
console.log(`Assistant messages: ${assistantMsgs.length}`);
console.log(`Code blocks found:  ${codeBlockCount}`);
console.log(`Code languages:     ${codeLanguages.length > 0 ? codeLanguages.join(", ") : "none"}`);
console.log(`Markdown detected:  ${markdownDetected}`);
console.log(`\nMetadata:`);
Object.entries(conv.metadata).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

if (totalFiltered > 0) {
  console.log(`\nFilter log (${totalFiltered} nodes removed):`);
  conv.filterLog.forEach(f =>
    console.log(`  [${String(f.role).padEnd(9)}] ${f.id?.slice(0, 8)}... → ${f.reason}`)
  );
}

console.log(`\nMessage summary:`);
messageSummary.forEach(m => {
  const flags = [m.hasCode && "code", m.hasMarkdown && "md"].filter(Boolean).join("+");
  console.log(`  [${m.index.toString().padStart(2)}] ${m.role.padEnd(9)} ${m.chars.toString().padStart(6)} chars  ${flags.padEnd(7)}  "${m.preview}..."`);
});

// ── JSON output for report generation ────────────────────────────────────────

const jsonReport = {
  timestamp: new Date().toISOString(),
  url: TARGET_URL,
  fetch: {
    status: fetchResult.status,
    elapsed_ms: fetchResult.elapsed,
    html_bytes: fetchResult.htmlLength,
    final_url: fetchResult.finalUrl,
    has_next_data: fetchResult.hasNextData,
  },
  extraction: {
    strategy: conv.strategy,
    matched_path: matchedPath,
    raw_node_count: totalRaw,
    kept_count: totalKept,
    filtered_count: totalFiltered,
    user_count: userMsgs.length,
    assistant_count: assistantMsgs.length,
  },
  conversation: {
    title: conv.title,
    metadata: conv.metadata,
  },
  content_analysis: {
    code_block_count: codeBlockCount,
    code_languages: codeLanguages,
    markdown_detected: markdownDetected,
    total_chars: fullText.length,
  },
  filter_log: conv.filterLog,
  message_summary: messageSummary,
  failures: [],
};

// Write JSON sidecar for the report
import { writeFileSync } from "fs";
writeFileSync(
  "scripts/chatgpt-extraction-results.json",
  JSON.stringify(jsonReport, null, 2),
  "utf8"
);

console.log("\n✅ JSON results written to scripts/chatgpt-extraction-results.json");

console.log("\n" + "=".repeat(65));
if (totalKept > 0 && conv.title) {
  console.log("🎉 Extraction PASSED — all validation criteria met.");
} else {
  console.log("⚠  Extraction COMPLETED with warnings — check results above.");
}
console.log("=".repeat(65) + "\n");
