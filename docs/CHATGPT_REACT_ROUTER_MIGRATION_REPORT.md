# ChatGPT React Router 7 Migration Report

**Task:** Task 4 — React Router 7 Parser Migration  
**Date:** 2026-06-24  
**Status:** ✅ Complete  
**Live validation:** 16/16 passed · tsc --noEmit exit 0

---

## 1. Migration Summary

ChatGPT share pages migrated from Next.js (`__NEXT_DATA__`) to React Router 7 with a flat-reference streaming serialization. The old extraction pipeline hard-failed on any current share page. This task replaces the parser layer while leaving all downstream normalization code completely unchanged.

### What changed

| Component | Change |
|-----------|--------|
| `parseNextDataScript()` | Now a **fallback** only — not the primary path |
| `findConversationData()` | Now a **fallback** only — used after RR7 fails |
| `extractEnqueuePayload()` | **New** — extracts first enqueue payload |
| `resolveFlatRef()` | **New** — one-level `{_K: V}` dereference |
| `extractPartsText()` | **New** — handles `[[textIdx]]` nesting in parts |
| `resolveNodeFromFlat()` | **New** — converts flat-array node to `RawNode` |
| `parseReactRouterStream()` | **New** — primary parser, returns `RawConvData` |
| `assembleConversation()` | **Minimal update** — adds `options.jsonPath`, `rawCount`, two new metadata fields |
| `extract()` Steps 3-4 | **Updated** — RR7 primary → `__NEXT_DATA__` fallback |
| `normalizeFromLinear()` | ✅ **Unchanged** |
| `normalizeFromMapping()` | ✅ **Unchanged** (cycle guard from Task 2 intact) |
| `shouldKeepNode()` | ✅ **Unchanged** |
| `normalizeNode()` | ✅ **Unchanged** |
| `fetchChatGPTSharePage()` | ✅ **Unchanged** |
| `isShareableUrl()` | ✅ **Unchanged** |
| `ClaudeAdapter` | ✅ **Unchanged** |
| `GeminiAdapter` | ✅ **Unchanged** |

---

## 2. New Format: React Router 7 Flat-Reference Array

### How the data is embedded

```html
<script nonce="...">
window.__reactRouterContext.streamController.enqueue("...");
</script>
```

The value is a JSON-escaped string. Unescaping it gives a flat JSON array of ~444 items:

```
flatArray = [metadata-obj, "loaderData", {...}, "actionData", ..., "linear_conversation", [98,99,...,108], ...]
```

### The `{_K: V}` reference format

Objects within the flat array use a reference notation instead of literal key-value pairs:

```
{ "_109": 303, "_114": 310 }
  ↑              ↑
  flat[109]="id" flat[114]="children"
  value=flat[303] value=flat[310]
```

This allows the serializer to deduplicate repeated key-name strings by pointing multiple objects at the same key-name index.

### The `[[textIdx]]` parts nesting

Message text is stored one level deeper than in the old format:

| Format | `parts` value |
|--------|--------------|
| Old (`__NEXT_DATA__`) | `["message text here"]` |
| New (React Router 7) | `[[172]]` → `flat[172]` = `"message text here"` |

`extractPartsText()` handles both patterns.

### Data path (new)

```
window.__reactRouterContext.streamController.enqueue(jsonPayload)
  → JSON.parse(jsonPayload) → flat[444]
    → flat.indexOf("linear_conversation") → flat[N+1] = [98,99,...,108]
      → flat[nodeIdx] = { _109:id, _110:msg, _112:parent, _114:children }
        → flat[msgIdx] = { _116:author, _120:content, _35:create_time, _125:weight, _129:recipient }
          → flat[authorIdx] = { _173:role }    →  "user" | "assistant"
          → flat[contentIdx] = { _168:ctype, _170:parts }
            → flat[partsIdx] = [[textIdx]]
              → flat[textIdx] = "actual message text"
```

---

## 3. Automatic Fallback Architecture

The `extract()` method now tries two parsers in sequence:

```
fetchChatGPTSharePage(url)
  → html

  [1] parseReactRouterStream(html)    ← React Router 7 (current ChatGPT)
      ✅ found?  → convData + jsonPath = "react-router-7/..."
      ❌ null?   → [2]

  [2] parseNextDataScript(html)       ← Legacy Next.js (pre-2025)
        → findConversationData(nextData)
        ✅ found?  → convData + jsonPath = "__NEXT_DATA__/..."
        ❌ null?   → ExtractionError (both parsers failed)

  → assembleConversation(convData, url, { jsonPath })
      → normalizeFromLinear() / normalizeFromMapping()  (unchanged)
      → Conversation { ..., metadata: { chatgptJsonPath, filteredMessageCount } }
```

---

## 4. New Metadata Fields

Both are now present on every `Conversation.metadata` returned by `ChatGPTAdapter.extract()`:

| Field | Type | Example |
|-------|------|---------|
| `chatgptJsonPath` | `string` | `"react-router-7/streamController.enqueue/linear_conversation"` |
| `filteredMessageCount` | `number` | `5` (nodes that were dropped by `shouldKeepNode` or empty-content filter) |

---

## 5. Live Validation Results

**URL tested:** `https://chatgpt.com/share/6a3b9a96-b39c-83ee-b869-1b4279145496`

```
Step 1: HTTP 200 (1,772 ms, 451.9 KB)
Step 2: Parsed via React Router 7 stream format
        linear_conversation nodes: 11
        title: "Math Question Answered"
        model: gpt-5-5
        conversation_id: 6a3b9a96-b39c-83ee-b869-1b4279145496
Step 3: Kept 6 messages (3 user, 3 assistant)
        Filtered: 5 nodes removed
        chatgptJsonPath: react-router-7/streamController.enqueue/linear_conversation
```

### Message summary

| # | Role | Chars | Features | Content |
|:--:|------|------:|----------|---------|
| 1 | user | 12 | — | `What is 2+2?` |
| 2 | assistant | 14 | **markdown** | `2 + 2 = **4**.` |
| 3 | user | 28 | — | `Write a Python hello world.` |
| 4 | assistant | 150 | **code** | ` ```python print("Hello, World!") ``` ` |
| 5 | user | 25 | — | `Give me a markdown table.` |
| 6 | assistant | 318 | **code + markdown** | Markdown table + ` ```markdown ``` ` source |

### Filter log (5 nodes removed)

| Node | Role | Reason |
|:----:|------|--------|
| 0 | — | No message reference (root/padding node) |
| 1 | system | Role filtered |
| 2 | system | Role filtered |
| 6 | assistant | Empty text (internal assistant node) |
| 7 | system | Role filtered |

### Assertions

```
✅ Parser: React Router 7 used
✅ No __NEXT_DATA__ required
✅ Title extracted
✅ Title meaningful
✅ Message count > 0
✅ Has user messages
✅ Has assistant messages
✅ No tool messages
✅ No system messages in output
✅ All messages have content
✅ Markdown preserved
✅ Code blocks preserved
✅ chatgptJsonPath set
✅ filteredMessageCount set
✅ Conversation ID extracted
✅ Model extracted

16 passed, 0 failed
```

---

## 6. Files Changed

| File | Type | Change |
|------|------|--------|
| `src/providers/chatgpt.ts` | Modified | +5 new parsing functions; `assembleConversation` updated; `extract()` updated |
| `scripts/validate-chatgpt-real-extraction.mjs` | Replaced | Full rewrite mirroring the new dual-parser pipeline; 16 assertions |
| `docs/CHATGPT_REACT_ROUTER_MIGRATION_REPORT.md` | New | This file |

**Unchanged:** `claude.ts`, `gemini.ts`, `types.ts`, `index.ts`, all app pages, PDF generation, markdown rendering, routing, user flow.

---

## 7. Backward Compatibility

The `__NEXT_DATA__` parser (`parseNextDataScript` + `findConversationData`) is retained as a silent fallback. No behavior change for any URL that still serves the old format. The fallback will activate automatically without any code change.

---

## 8. Remaining Risks (from Audit)

| Risk | Status |
|------|--------|
| Key-name indices could shift if OpenAI adds/removes flat-array items | 🟡 Mitigated — `resolveFlatRef` discovers indices dynamically at runtime, not hardcoded |
| `pageTitle` used as conversation title (not the internal `data.title`) | 🟡 Acceptable — pageTitle is the human-readable title; `data.title` path changes frequently |
| Model slug extracted via pattern match (`/^GPT\|gpt-\|o[0-9]/`) | 🟡 Will need updating if OpenAI introduces a model name outside this pattern |
| No `mapping` fallback inside the RR7 path | 🟢 Not needed — `linear_conversation` is always present in current share pages |
| Future migration away from React Router 7 | 🔴 Will require adding a third parser — same pattern as this migration |
