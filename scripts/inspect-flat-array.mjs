// scripts/inspect-flat-array.mjs
// Deep-inspects the React Router 7 flat array to find the message structure.

import { readFileSync, writeFileSync } from "fs";

const html = readFileSync("scripts/chatgpt-share-page.html", "utf8");

const re = /streamController\.enqueue\("((?:[^"\\]|\\.)*)"\)/g;
const enqParts = [];
let m;
while ((m = re.exec(html)) !== null) {
  try { enqParts.push(JSON.parse(`"${m[1]}"`)); }
  catch { enqParts.push(m[1]); }
}

const flatArray = JSON.parse(enqParts[0]);
console.log(`Flat array length: ${flatArray.length}`);

// ── Dump positions 98-120 raw ──────────────────────────────────────────────────
console.log("\n── Raw flat array items at positions 90-130 ──");
for (let i = 90; i <= 130; i++) {
  const item = flatArray[i];
  const repr = typeof item === "string" ? `"${item}"` :
               typeof item === "number" ? String(item) :
               Array.isArray(item) ? `[${item.slice(0,5).join(",")}${item.length>5?"...":""}]` :
               item === null ? "null" :
               typeof item === "object" ? JSON.stringify(item).slice(0,200) : String(item);
  console.log(`  [${i}] ${repr}`);
}

// ── Find all string indices that could be key names ───────────────────────────
console.log("\n── Key name strings in flat array (strings only) ──");
const stringIndices = [];
flatArray.forEach((item, i) => {
  if (typeof item === "string" && item.length < 50 && /^[a-z_][a-z0-9_]*$/i.test(item)) {
    stringIndices.push({ i, val: item });
  }
});
// Print unique key names around positions 100-150
stringIndices.filter(({i}) => i < 200).forEach(({i, val}) => console.log(`  [${i}] "${val}"`));

// ── Find "role", "content", "author" in the flat array ────────────────────────
console.log("\n── Specific key positions ──");
["role","content","author","message","parts","content_type","create_time","id","parent","children"].forEach(key => {
  const positions = [];
  flatArray.forEach((item, i) => { if (item === key) positions.push(i); });
  console.log(`  "${key}" at positions: [${positions.join(", ")}]`);
});

// ── Look for "user" and "assistant" in the flat array ─────────────────────────
console.log("\n── Role values ──");
["user","assistant","system","tool"].forEach(role => {
  const positions = [];
  flatArray.forEach((item, i) => { if (item === role) positions.push(i); });
  console.log(`  "${role}" at positions: [${positions.join(", ")}]`);
});

// ── Dump context around where "user" appears ──────────────────────────────────
const userIdx = flatArray.indexOf("user");
if (userIdx > -1) {
  console.log(`\n── Context around "user" at index ${userIdx} (±15 positions) ──`);
  for (let i = Math.max(0, userIdx - 15); i <= Math.min(flatArray.length-1, userIdx + 15); i++) {
    const item = flatArray[i];
    const repr = typeof item === "string" ? `"${item}"` :
                 typeof item === "number" ? String(item) :
                 Array.isArray(item) ? `[${item.slice(0,5).join(",")}${item.length>5?"...":""}]` :
                 item === null ? "null" :
                 typeof item === "object" ? JSON.stringify(item).slice(0,150) : String(item);
    console.log(`  [${i}]${i === userIdx ? " *" : "  "} ${repr}`);
  }
}

// ── Find all positions of "assistant" ─────────────────────────────────────────
const assistantPositions = [];
flatArray.forEach((item, i) => { if (item === "assistant") assistantPositions.push(i); });
console.log(`\n"assistant" appears at: [${assistantPositions.join(", ")}]`);

// Context around FIRST assistant
if (assistantPositions.length > 0) {
  const aIdx = assistantPositions[0];
  console.log(`\n── Context around FIRST "assistant" at index ${aIdx} (±20 positions) ──`);
  for (let i = Math.max(0, aIdx - 20); i <= Math.min(flatArray.length-1, aIdx + 20); i++) {
    const item = flatArray[i];
    const repr = typeof item === "string" ? `"${item}"` :
                 typeof item === "number" ? String(item) :
                 Array.isArray(item) ? `[${JSON.stringify(item).slice(0,100)}]` :
                 item === null ? "null" :
                 typeof item === "object" ? JSON.stringify(item).slice(0,200) : String(item);
    console.log(`  [${i}]${i === aIdx ? " *" : "  "} ${repr}`);
  }
}

// ── Find all positions of "parts" and dump adjacent content ──────────────────
const partsPositions = [];
flatArray.forEach((item, i) => { if (item === "parts") partsPositions.push(i); });
console.log(`\n"parts" at positions: [${partsPositions.join(", ")}]`);
partsPositions.slice(0, 3).forEach(pIdx => {
  const nextItem = flatArray[pIdx + 1];
  console.log(`  parts[${pIdx}+1] → ${JSON.stringify(nextItem)?.slice(0, 300)}`);
  if (typeof nextItem === "number" && flatArray[nextItem]) {
    console.log(`    (ref: flatArray[${nextItem}] = ${JSON.stringify(flatArray[nextItem])?.slice(0, 300)})`);
  }
});

// ── Find "content_type" → "text" patterns and dump whole content objects ───────
const ctPositions = [];
flatArray.forEach((item, i) => { if (item === "content_type") ctPositions.push(i); });
console.log(`\n"content_type" at positions: [${ctPositions.join(", ")}]`);

ctPositions.slice(0, 4).forEach(ctIdx => {
  const typeVal = flatArray[ctIdx + 1];
  const resolvedType = typeof typeVal === "number" ? flatArray[typeVal] : typeVal;
  console.log(`\n  content_type[${ctIdx}] → ${JSON.stringify(typeVal)} (resolved: "${resolvedType}")`);
  // Look for "parts" nearby
  for (let offset = -10; offset <= 20; offset++) {
    const j = ctIdx + offset;
    if (j >= 0 && j < flatArray.length && flatArray[j] === "parts") {
      const partsRef = flatArray[j + 1];
      const partsVal = typeof partsRef === "number" ? flatArray[partsRef] : partsRef;
      console.log(`    parts at [${j}] → ref=${partsRef} → ${JSON.stringify(partsVal)?.slice(0, 300)}`);
      break;
    }
  }
});
