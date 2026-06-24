// scripts/inspect-chatgpt-html.mjs
// Fetches the real share page and writes HTML + a structure analysis report.
// Run: node scripts/inspect-chatgpt-html.mjs

import { writeFileSync } from "fs";

const TARGET_URL = "https://chatgpt.com/share/6a3b9a96-b39c-83ee-b869-1b4279145496";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

console.log("Fetching...");
const res = await fetch(TARGET_URL, { method: "GET", headers: HEADERS, redirect: "follow", cache: "no-store" });
const html = await res.text();
console.log(`HTTP ${res.status} — ${(html.length / 1024).toFixed(1)} KB`);

// Save full HTML
writeFileSync("scripts/chatgpt-share-page.html", html, "utf8");
console.log("Saved to scripts/chatgpt-share-page.html");

// ── Structure probes ──────────────────────────────────────────────────────────

const probes = [
  // Script data embedding patterns
  { name: "__NEXT_DATA__",            found: html.includes("__NEXT_DATA__") },
  { name: "__remixContext",           found: html.includes("__remixContext") },
  { name: "window.__INITIAL_STATE__", found: html.includes("window.__INITIAL_STATE__") },
  { name: "window.__STATE__",         found: html.includes("window.__STATE__") },
  { name: "AF_initDataCallback",      found: html.includes("AF_initDataCallback") },
  { name: "__reactRouterContext",      found: html.includes("__reactRouterContext") },
  { name: "self.__next_f",            found: html.includes("self.__next_f") },
  // ChatGPT-specific known keys
  { name: "linear_conversation",      found: html.includes("linear_conversation") },
  { name: "\"mapping\"",              found: html.includes('"mapping"') },
  { name: "conversation_id",          found: html.includes("conversation_id") },
  { name: "serverResponse",           found: html.includes("serverResponse") },
  { name: "sharedConversation",       found: html.includes("sharedConversation") },
  { name: "\"messages\"",             found: html.includes('"messages"') },
  { name: "\"title\"",                found: html.includes('"title"') },
  { name: "\"role\"",                 found: html.includes('"role"') },
  { name: "\"content\"",              found: html.includes('"content"') },
  { name: "\"author\"",               found: html.includes('"author"') },
  { name: "application/json",         found: html.includes("application/json") },
  // Framework signals
  { name: "<div id=\"__next\">",      found: html.includes('id="__next"') },
  { name: "<div id=\"root\">",        found: html.includes('id="root"') },
  { name: "data-reactroot",           found: html.includes("data-reactroot") },
  // Bot-block signals
  { name: "cf-browser-verification", found: html.includes("cf-browser-verification") },
  { name: "Ray ID",                   found: html.includes("Ray ID") },
  { name: "Cloudflare",               found: html.includes("Cloudflare") },
  { name: "Just a moment",            found: html.toLowerCase().includes("just a moment") },
];

console.log("\n── Structure probes ──");
probes.forEach(p => console.log(`  ${p.found ? "✅" : "❌"} ${p.name}`));

// Extract all <script> tags and show their key attributes and first 200 chars
const scriptMatches = [...html.matchAll(/<script([^>]*)>([\s\S]{0,500})/gi)];
console.log(`\n── <script> tags: ${scriptMatches.length} found ──`);
scriptMatches.forEach((m, i) => {
  const attrs = m[1].trim();
  const body = m[2].replace(/\s+/g, " ").trim().slice(0, 200);
  console.log(`\n  [${i}] attrs: ${attrs || "(none)"}`);
  if (body) console.log(`       body:  ${body}`);
});

// Look for inline JSON blobs (large JSON-like strings in script tags)
const jsonBlobs = [...html.matchAll(/(?:window\.[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*|self\.[A-Za-z_$][A-Za-z0-9_$]*\s*\.push\s*\()(\{|\[)[\s\S]{20,}/gi)];
console.log(`\n── Inline JSON assignments: ${jsonBlobs.length} found ──`);
jsonBlobs.slice(0, 10).forEach((m, i) => {
  console.log(`  [${i}] ${m[0].slice(0, 300)}`);
});

// Look for application/json script tags specifically
const jsonScripts = [...html.matchAll(/<script[^>]+type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi)];
console.log(`\n── application/json script tags: ${jsonScripts.length} ──`);
jsonScripts.slice(0, 5).forEach((m, i) => {
  console.log(`  [${i}] ${m[0].slice(0, 400)}`);
});

// Look for React Router / Remix context
const remixMatch = html.match(/self\.__remixContext\s*=\s*(\{[\s\S]{0,2000})/);
if (remixMatch) {
  console.log("\n── __remixContext (first 1000 chars) ──");
  console.log(remixMatch[1].slice(0, 1000));
}

// Look for React Router v7 / __reactRouterContext
const rrMatch = html.match(/__reactRouterContext\s*=\s*(\{[\s\S]{0,2000})/);
if (rrMatch) {
  console.log("\n── __reactRouterContext (first 1000 chars) ──");
  console.log(rrMatch[1].slice(0, 1000));
}

// RSC / Next.js App Router self.__next_f payloads
const nextFMatches = [...html.matchAll(/self\.__next_f\.push\((\[[\s\S]{0,500})\)/g)];
console.log(`\n── self.__next_f.push() calls: ${nextFMatches.length} ──`);
nextFMatches.slice(0, 5).forEach((m, i) => {
  console.log(`  [${i}] ${m[0].slice(0, 300)}`);
});

// Meta tags
const metaMatches = [...html.matchAll(/<meta[^>]+>/gi)];
console.log(`\n── <meta> tags (first 10) ──`);
metaMatches.slice(0, 10).forEach(m => console.log(`  ${m[0]}`));

// Title tag
const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
console.log(`\n── <title>: ${titleMatch?.[1]?.trim() ?? "not found"}`);

console.log("\nDone.");
