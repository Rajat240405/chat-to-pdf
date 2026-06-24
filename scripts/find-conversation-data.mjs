// scripts/find-conversation-data.mjs
import { readFileSync, writeFileSync } from "fs";

const html = readFileSync("scripts/chatgpt-share-page.html", "utf8");

// ── 1. Find all streamController.enqueue calls ────────────────────────────────
const enqueueParts = [];
const enqRe = /streamController\.enqueue\("((?:[^"\\]|\\.)*)"\)/g;
let m;
while ((m = enqRe.exec(html)) !== null) {
  try {
    enqueueParts.push(JSON.parse(`"${m[1]}"`)); // unescape the JS string
  } catch {
    enqueueParts.push(m[1]);
  }
}
console.log(`enqueue parts found: ${enqueueParts.length}`);
const fullStream = enqueueParts.join("");
console.log(`total stream length: ${fullStream.length} chars`);

// ── 2. Check for key fields in stream ─────────────────────────────────────────
const keys = ["linear_conversation","serverResponse","sharedConversation","conversation_id","loaderData","\"title\"","\"role\"","\"content\"","\"author\""];
console.log("\n── Key presence in stream ──");
keys.forEach(k => console.log(`  ${fullStream.includes(k) ? "✅" : "❌"} ${k}`));

// ── 3. Find linear_conversation in stream ─────────────────────────────────────
const lcIdx = fullStream.indexOf("linear_conversation");
console.log(`\nlinear_conversation at stream position: ${lcIdx}`);
if (lcIdx > -1) {
  console.log("\n── Context (500 chars around linear_conversation) ──");
  console.log(fullStream.slice(Math.max(0, lcIdx - 100), lcIdx + 500));
}

// ── 4. Try to find serverResponse data in stream ──────────────────────────────
const srIdx = fullStream.indexOf("serverResponse");
console.log(`\nserverResponse at stream position: ${srIdx}`);
if (srIdx > -1) {
  console.log("\n── Context (800 chars around serverResponse) ──");
  console.log(fullStream.slice(Math.max(0, srIdx - 50), srIdx + 800));
}

// ── 5. Try to parse the React Router serialized loader data ──────────────────
// The stream format is: [index, key, value] lines separated by \n
// Each line is a chunk of the deferred serialization
const streamLines = fullStream.split("\n").filter(l => l.trim());
console.log(`\nStream lines: ${streamLines.length}`);
console.log("\n── First 10 stream lines ──");
streamLines.slice(0, 10).forEach((l, i) => console.log(`  [${i}] ${l.slice(0, 200)}`));

// ── 6. Look for JSON objects containing conversation data ─────────────────────
// Try to find large JSON blobs that contain role/content/author
const jsonRe = /\{[^{}]{100,}\}/g;
let jsonBlobs = 0;
let conversationBlob = null;
let convBlobStr = null;
while ((m = jsonRe.exec(fullStream)) !== null) {
  jsonBlobs++;
  const blob = m[0];
  if (blob.includes("linear_conversation") || blob.includes("serverResponse")) {
    conversationBlob = blob;
    convBlobStr = blob;
    break;
  }
}
console.log(`\nJSON blobs scanned: ${jsonBlobs}`);
if (conversationBlob) {
  console.log("\n── Found conversation blob (first 1000 chars) ──");
  console.log(conversationBlob.slice(0, 1000));
}

// ── 7. Write full stream to file for offline inspection ───────────────────────
writeFileSync("scripts/chatgpt-stream-data.txt", fullStream, "utf8");
console.log("\nFull stream written to scripts/chatgpt-stream-data.txt");

// ── 8. Also look in the raw HTML for linear_conversation outside stream ────────
const rawLcIdx = html.indexOf("linear_conversation");
console.log(`\nlinear_conversation in RAW HTML at byte: ${rawLcIdx}`);
if (rawLcIdx > -1) {
  const ctx = html.slice(Math.max(0, rawLcIdx - 200), rawLcIdx + 1000);
  console.log("\n── Context in raw HTML (1200 chars) ──");
  console.log(ctx);
}
