// scripts/validate-extraction-api.mjs
// Validates POST /api/extract against a real ChatGPT share URL.
// Requires the dev server to be running: npm run dev
// Run: node scripts/validate-extraction-api.mjs

import { writeFileSync } from "fs";

const BASE_URL = "http://localhost:3000";
const EXTRACT_ENDPOINT = `${BASE_URL}/api/extract`;

const REAL_SHARE_URL =
  "https://chatgpt.com/share/6a3b9a96-b39c-83ee-b869-1b4279145496";

// ── Helpers ───────────────────────────────────────────────────────────────────

let pass = 0, fail = 0;

function check(label, cond, detail = "") {
  if (cond) { console.log(`  ✅ ${label}`); pass++; }
  else       { console.log(`  ❌ ${label}${detail ? " — " + detail : ""}`); fail++; }
}

async function postExtract(body) {
  const res = await fetch(EXTRACT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("=".repeat(65));
console.log("Chat2PDF — POST /api/extract Validation");
console.log("=".repeat(65));
console.log(`Endpoint: ${EXTRACT_ENDPOINT}\n`);

// ── Section 1: Validation error cases ────────────────────────────────────────

console.log("── Section 1: Validation error cases ──");

// 1a. No body
{
  const res = await fetch(EXTRACT_ENDPOINT, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: "not-json" });
  const j = await res.json().catch(() => null);
  check("No body → 400", res.status === 400, `got ${res.status}`);
  check("Error message present", typeof j?.error === "string", JSON.stringify(j));
}

// 1b. Missing url field
{
  const { status, json } = await postExtract({ other: "field" });
  check("Missing url → 400", status === 400, `got ${status}`);
  check("Error mentions url field", json?.error?.toLowerCase().includes("url"), json?.error);
}

// 1c. Empty url
{
  const { status, json } = await postExtract({ url: "  " });
  check("Empty url → 400", status === 400, `got ${status}`);
}

// 1d. Malformed URL (not a valid URL)
{
  const { status } = await postExtract({ url: "not-a-url" });
  check("Malformed URL → 400", status === 400, `got ${status}`);
}

// 1e. Unsupported domain
{
  const { status, json } = await postExtract({ url: "https://example.com/some-page" });
  check("Unsupported domain → 422", status === 422, `got ${status}`);
  check("Hint in response", typeof json?.hint === "string" || typeof json?.error === "string");
}

// 1f. Own-conversation link (/c/<id>)
{
  const { status } = await postExtract({ url: "https://chatgpt.com/c/some-private-convo" });
  check("Own-conversation link → 422", status === 422, `got ${status}`);
}

console.log();

// ── Section 2: Real extraction ────────────────────────────────────────────────

console.log("── Section 2: Real extraction ──");
console.log(`  URL: ${REAL_SHARE_URL}`);
console.log("  Fetching (may take 2-5 s)...\n");

let doc = null;
let extractStatus = 0;

try {
  const start = Date.now();
  const { status, json } = await postExtract({ url: REAL_SHARE_URL });
  const elapsed = Date.now() - start;
  extractStatus = status;

  check("HTTP 200", status === 200, `got ${status} — ${json?.error ?? ""}`);

  if (status === 200 && json?.document) {
    doc = json.document;
    console.log(`  ✅ Responded in ${elapsed} ms\n`);
  } else {
    console.log(`  ❌ Failed in ${elapsed} ms — ${json?.error ?? "no document in response"}\n`);
  }
} catch (e) {
  console.log(`  ❌ Network error — is npm run dev running?\n  ${e.message}\n`);
  console.log("Aborting: dev server not reachable.");
  process.exit(1);
}

// ── Section 3: Document shape assertions ─────────────────────────────────────

console.log("── Section 3: Document shape ──");

check("document present in response", doc !== null);

if (doc) {
  // id
  check("id is a string",        typeof doc.id === "string");
  check("id starts with conv-",  typeof doc.id === "string" && doc.id.startsWith("conv-"));

  // title
  check("title is non-empty string", typeof doc.title === "string" && doc.title.length > 0);
  check("title meaningful",          doc.title !== "Untitled ChatGPT Conversation");

  // provider
  check("provider is chatgpt",  doc.provider === "chatgpt");

  // model
  check("model is non-empty",   typeof doc.model === "string" && doc.model.length > 0);

  // url
  check("url matches input",    doc.url === REAL_SHARE_URL);

  // messages
  check("messages is array",    Array.isArray(doc.messages));
  check("messages.length > 0",  Array.isArray(doc.messages) && doc.messages.length > 0);
  if (Array.isArray(doc.messages) && doc.messages.length > 0) {
    const roles = doc.messages.map(m => m.role);
    check("has user messages",     roles.includes("user"));
    check("has assistant messages", roles.includes("assistant"));
    check("no system messages",    !roles.includes("system"));
    check("all messages have content",
      doc.messages.every(m => typeof m.content === "string" && m.content.trim().length > 0));
  }

  // renderedMarkdown
  check("renderedMarkdown is string", typeof doc.renderedMarkdown === "string");
  check("renderedMarkdown not empty", typeof doc.renderedMarkdown === "string" && doc.renderedMarkdown.length > 50);
  check("renderedMarkdown starts with # title",
    typeof doc.renderedMarkdown === "string" && doc.renderedMarkdown.startsWith(`# ${doc.title}`));
  check("renderedMarkdown contains User turn",
    typeof doc.renderedMarkdown === "string" && doc.renderedMarkdown.includes("**User**"));
  check("renderedMarkdown contains Assistant turn",
    typeof doc.renderedMarkdown === "string" && doc.renderedMarkdown.includes("**Assistant**"));

  // wordCount
  check("wordCount is a positive number", typeof doc.wordCount === "number" && doc.wordCount > 0);

  // description
  check("description is non-empty string", typeof doc.description === "string" && doc.description.length > 0);

  // metadata
  check("metadata is object",      doc.metadata && typeof doc.metadata === "object");
  check("metadata.model set",      typeof doc.metadata?.model === "string");
  check("metadata.wordCount set",  typeof doc.metadata?.wordCount === "string");
  check("metadata.messageCount > 0", typeof doc.metadata?.messageCount === "number" && doc.metadata.messageCount > 0);
  check("metadata.provider set",   typeof doc.metadata?.provider === "string");
  check("metadata.exportFormats",  Array.isArray(doc.metadata?.exportFormats));

  // createdAt
  check("createdAt is a string",   typeof doc.createdAt === "string");
}

console.log();

// ── Section 4: Content quality ────────────────────────────────────────────────

console.log("── Section 4: Content quality ──");

if (doc?.renderedMarkdown) {
  const md = doc.renderedMarkdown;
  const hasCode = /```[\s\S]*?```/.test(md);
  const hasBold = /\*\*/.test(md);
  const hasTable = /\|.+\|/.test(md);
  const hasSeparator = /^---/m.test(md);

  check("Markdown formatting preserved (bold)",  hasBold);
  check("Code blocks preserved",                 hasCode, "expected at least one ```...``` block");
  check("Conversation separators present",       hasSeparator);
  check("Table content preserved",               hasTable);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(65)}`);
console.log(`Assertions: ${pass} passed, ${fail} failed`);

if (doc) {
  console.log(`\n── Document summary ──`);
  console.log(`Title:         ${doc.title}`);
  console.log(`Provider:      ${doc.provider}`);
  console.log(`Model:         ${doc.model}`);
  console.log(`Messages:      ${doc.messages?.length ?? 0}`);
  console.log(`Word count:    ${doc.wordCount}`);
  console.log(`Description:   ${doc.description?.slice(0, 80)}`);
  console.log(`ID:            ${doc.id}`);

  // Write results
  const results = {
    timestamp: new Date().toISOString(),
    endpoint: EXTRACT_ENDPOINT,
    url: REAL_SHARE_URL,
    http_status: extractStatus,
    document: {
      id: doc.id, title: doc.title, provider: doc.provider, model: doc.model,
      message_count: doc.messages?.length ?? 0,
      word_count: doc.wordCount,
      rendered_markdown_length: doc.renderedMarkdown?.length ?? 0,
      description_length: doc.description?.length ?? 0,
      metadata: doc.metadata,
    },
    assertions: { passed: pass, failed: fail },
  };
  writeFileSync("scripts/extraction-api-results.json", JSON.stringify(results, null, 2), "utf8");
  console.log("\n✅ Results → scripts/extraction-api-results.json");
}

if (fail === 0) { console.log("🎉 All assertions passed.\n"); process.exit(0); }
else            { console.log("⚠  Failures — review above.\n"); process.exit(1); }
