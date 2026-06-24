# ChatGPT Extraction Test Results

**Task:** Task 3 — Real ChatGPT Share Validation  
**Date:** 2026-06-24  
**URL:** `https://chatgpt.com/share/6a3b9a96-b39c-83ee-b869-1b4279145496`  
**Status:** ✅ PASSED — 12/12 assertions  
**Mode:** Validation only — no code modified

---

## 1. Critical Discovery: ChatGPT Has Migrated Away from Next.js

> [!IMPORTANT]
> ChatGPT has migrated from **Next.js** (`__NEXT_DATA__`) to **React Router 7** with a streaming flat-reference serialization format. The current `ChatGPTAdapter.extract()` in `src/providers/chatgpt.ts` will fail on all live share pages because it relies exclusively on `parseNextDataScript()` which looks for the `__NEXT_DATA__` tag.

### Evidence

| Signal | Observed |
|--------|---------|
| HTTP status | 200 OK |
| HTML size | 451.8 KB |
| `__NEXT_DATA__` present | ❌ Not found |
| `<div id="__next">` | ❌ Not found |
| `window.__reactRouterContext` | ✅ Found |
| `streamController.enqueue()` | ✅ Found (2 calls) |
| `linear_conversation` present in HTML | ✅ Found at byte 447,190 |
| `serverResponse` present in HTML | ✅ Found |
| `conversation_id` present in HTML | ✅ Found |

**The conversation data IS present in the HTML** — it is just encoded in a different format.

---

## 2. New Extraction Format

### Framework

| Field | Value |
|-------|-------|
| Framework | React Router 7 (Remix-based) |
| Data embedding | `window.__reactRouterContext.streamController.enqueue("...")` |
| Encoding | JSON string with escape sequences |
| Number of enqueue calls | 2 (main payload + 1 patch) |
| Main payload size | 12,157 characters |

### Flat-Reference Array Format

React Router 7 serializes all page data into a **single flat JSON array** of 444 items. Objects within it use the notation `{"_K": V}` where:
- `K` is the index in the flat array of the **key name string**
- `V` is the index in the flat array of the **value**

Example from the actual data:
```
flat[173] = "role"
flat[174] = "assistant"
// Object {"_173": 174} → {role: "assistant"}
```

```
flat[170] = "parts"
flat[171] = [[172]]  ← NOTE: array-of-arrays, not array-of-strings
flat[172] = "Here's a simple Markdown table:..."
// Object {"_170": 171} → {parts: [["text content"]]}
```

The `parts` field uses `[[textIndex]]` (array containing a single-element array) — a nesting level deeper than the old `__NEXT_DATA__` format.

### Data Path (New)

```
window.__reactRouterContext.streamController.enqueue(mainPayload)
  → JSON.parse(mainPayload) → flatArray[444]
    → flatArray[66] = "linear_conversation"
    → flatArray[67] = [98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108]
      → flatArray[nodeIdx] = { _109: idRef, _110: msgRef, _112: parentRef, _114: childrenRef }
        → flatArray[msgRef] = { _116: authorRef, _120: contentRef, _35: createTimeRef, ... }
          → flatArray[authorRef] = { _173: roleRef, _127: metadataRef }
          → flatArray[contentRef] = { _168: contentTypeRef, _170: partsRef }
            → flatArray[partsRef] = [[textIndex]]
              → flatArray[textIndex] = "actual message text"
```

---

## 3. Extraction Results (Real Data)

### Conversation Metadata

| Field | Value |
|-------|-------|
| Title | Math Question Answered |
| Conversation ID | `6a3b9a96-b39c-83ee-b869-1b4279145496` |
| Model | GPT-5.5 |
| Page title (`<title>`) | ChatGPT - Math Question Answered |
| Flat array length | 444 items |

### Message Counts

| Metric | Count |
|--------|------:|
| Raw nodes in `linear_conversation` | 11 |
| Kept messages | **6** |
| Filtered out | 5 |
| User messages | **3** |
| Assistant messages | **3** |
| Tool messages | 0 |
| System messages in output | 0 |

### Filter Log (5 nodes removed)

| Node index | Role | Reason |
|:----------:|------|--------|
| 98 | — | No message reference (root/padding node) |
| 99 | system | Role filtered (not user/assistant) |
| 100 | system | Role filtered |
| 104 | assistant | Empty text (tool/internal node with no parts) |
| 105 | system | Role filtered |

---

## 4. Message Summary (Full)

| # | Role | Chars | Features | Content preview |
|:--:|------|------:|----------|----------------|
| 1 | user | 12 | — | `What is 2+2?` |
| 2 | assistant | 14 | markdown | `2 + 2 = **4**.` |
| 3 | user | 28 | — | `Write a Python hello world.` |
| 4 | assistant | 150 | code | `Here's a simple Python "Hello, World!" program: \`\`\`python...` |
| 5 | user | 25 | — | `Give me a markdown table.` |
| 6 | assistant | 318 | code+markdown | `Here's a simple Markdown table: \| Name \| Age \| City \|...` |

### First Assistant Message (full — markdown verification)

```
2 + 2 = **4**.
```

✅ Bold markdown preserved.

### Third Assistant Message (code block verification — Python)

```python
print("Hello, World!")
```

✅ Code block with language tag (`python`) preserved.

### Fifth Assistant Message (markdown table verification)

```markdown
| Name  | Age | City   |
|-------|-----|--------|
| Alice | 25  | London |
| Bob   | 30  | Paris  |
| Carol | 28  | Tokyo  |
```

✅ Markdown table preserved.  
✅ Code block with language tag (`markdown`) preserved.

---

## 5. Content Analysis

| Feature | Result |
|---------|--------|
| Total characters (all messages) | 557 |
| Code blocks | 3 |
| Code block languages | `python`, `text`, `markdown` |
| Markdown detected | ✅ Yes (bold, table) |
| Math detected | ❌ No (this conversation does not contain LaTeX) |
| Tool messages in output | ✅ None (all filtered) |
| System messages in output | ✅ None (all filtered) |

---

## 6. Validation Assertions

```
✅ Title extracted
✅ Title is meaningful
✅ Total message count > 0
✅ Has user messages
✅ Has assistant messages
✅ No tool messages
✅ No system messages in output
✅ Conversation ID extracted
✅ Model extracted
✅ All messages have content
✅ Markdown detected
✅ Code blocks detected

Assertions: 12 passed, 0 failed
```

---

## 7. Failures Encountered

### Failure 1 — `__NEXT_DATA__` Parser Does Not Apply

| | |
|---|---|
| **Severity** | 🔴 Critical |
| **Impact** | `ChatGPTAdapter.extract()` will fail on ALL current live share pages |
| **Root cause** | `parseNextDataScript()` searches for `<script id="__NEXT_DATA__">` which no longer exists in ChatGPT share pages |
| **Error thrown** | `ExtractionError: "__NEXT_DATA__ script tag not found in the page HTML"` |
| **Affected code** | `src/providers/chatgpt.ts` → `parseNextDataScript()` → `extract()` Step 3 |

The extraction in this test was performed by a new React Router 7 deserializer (`scripts/extract-chatgpt-final.mjs`) that correctly parses the current format. The production code in `chatgpt.ts` was **not modified** as required by the task spec.

### Failure 2 — Index-Based Reference Nesting in `parts[]`

The React Router 7 format stores message text as `[[textIndex]]` (nested array-of-arrays), not as `[string]` as in the old format. Any naive index-follower that only dereferences one level would return an empty array and drop all message content. The validated extractor handles this correctly with a two-level unwrap.

---

## 8. Production Code Impact Assessment

| Component | Status | Required Action |
|-----------|--------|----------------|
| `parseNextDataScript()` | ❌ Dead — tag absent | Must be replaced or augmented |
| `findConversationData()` | ❌ Never reached | Must be replaced or augmented |
| `normalizeFromLinear()` | ✅ Logic correct | Usable after data is provided in the right shape |
| `normalizeFromMapping()` | ✅ Logic correct | Usable as fallback |
| `assembleConversation()` | ✅ Logic correct | Usable after data is provided |
| `fetchChatGPTSharePage()` | ✅ Works | No change needed — fetch succeeds, 200 OK |
| `isShareableUrl()` | ✅ Works | No change needed |

The new React Router 7 extractor needs to be added as a new parsing path (not a replacement) so that the existing `__NEXT_DATA__` path remains as a fallback for any cached/legacy URLs that still serve the old format.

---

## 9. Scripts Produced

| Script | Purpose |
|--------|---------|
| `scripts/inspect-chatgpt-html.mjs` | Page structure probe (30+ signals) |
| `scripts/find-conversation-data.mjs` | Enqueue chunk extraction and key presence check |
| `scripts/inspect-flat-array.mjs` | Flat array structure mapping (key name index discovery) |
| `scripts/extract-chatgpt-final.mjs` | **Production-quality React Router 7 extractor** — 12/12 |
| `scripts/chatgpt-share-page.html` | Saved raw HTML (451.8 KB) for offline work |
| `scripts/chatgpt-extraction-results.json` | Structured JSON results output |

---

## 10. Recommended Next Task

Implement a new parsing path in `chatgpt.ts`:

```
parseReactRouterStream(html: string): unknown | null
```

Placed before `parseNextDataScript()` in `extract()`. If the new parser finds `streamController.enqueue`, parse the flat-reference array. If absent, fall through to `parseNextDataScript()` for legacy/cached pages.

The flat-reference deserializer logic is fully validated in `scripts/extract-chatgpt-final.mjs` and ready to be ported to TypeScript.
