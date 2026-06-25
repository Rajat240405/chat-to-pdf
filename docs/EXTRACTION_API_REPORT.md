# Extraction API Report

**Task:** Integration Phase 1 — POST /api/extract  
**Date:** 2026-06-24  
**Status:** ✅ Complete  
**Live validation:** 42/42 passed · tsc --noEmit exit 0 · 1,906 ms round-trip

---

## 1. Route Overview

**File:** `src/app/api/extract/route.ts`  
**Method:** `POST`  
**Endpoint:** `/api/extract`

### Request

```json
{ "url": "https://chatgpt.com/share/<uuid>" }
```

### Success Response (200)

```json
{ "document": ConversationDocument }
```

### Error Responses

| HTTP | `code` | Trigger |
|------|--------|---------|
| 400 | — | Missing/empty `url`, malformed JSON, invalid URL format |
| 422 | `INVALID_SHARE_URL` | Valid URL but not a share link (e.g. `/c/<id>`) |
| 422 | — | Unsupported provider domain |
| 501 | `NOT_IMPLEMENTED` | Provider detected but `extract()` not yet implemented |
| 502 | `EXTRACTION_FAILED` | Network error, parse failure, rate limit |
| 500 | `INTERNAL_ERROR` | Unexpected server exception |

---

## 2. Conversation → ConversationDocument Adapter

### Field mapping

| `ConversationDocument` field | Source | Logic |
|------------------------------|--------|-------|
| `id` | Generated | `urlToDocId(url)` — stable 32-bit FNV-like hash → `conv-<hex>` |
| `title` | `conv.title` | Direct |
| `description` | `conv.messages[firstUser].content` | First user message, first line, max 200 chars |
| `provider` | `conv.provider` | Narrowed to `"chatgpt" \| "claude" \| "gemini"` |
| `model` | `conv.metadata.model` | Falls back to `conv.provider` if absent |
| `url` | `sourceUrl` | The original share URL |
| `createdAt` | `conv.metadata.created` | Falls back to `new Date().toISOString()` |
| `wordCount` | Computed | `countWords(renderedMarkdown)` |
| `messages` | `conv.messages` | Filtered to `user\|assistant` only; `ConversationMessage → Message` |
| `renderedMarkdown` | Generated | `buildRenderedMarkdown(conv)` |
| `metadata.model` | `conv.metadata.model` | Same as `model` field |
| `metadata.wordCount` | Computed | `"N words"` (formatted) |
| `metadata.messageCount` | `messages.length` | After system-message filter |
| `metadata.provider` | `conv.provider` | Direct |
| `metadata.created` | `conv.metadata.created` | Same as `createdAt` |
| `metadata.revision` | Hardcoded | `"1"` (no versioning yet) |
| `metadata.verified` | Hardcoded | `true` |
| `metadata.exportFormats` | Hardcoded | `["PDF", "Markdown"]` |

### `buildRenderedMarkdown()` output format

```markdown
# {title}

**User** _(Jun 24, 2026, 1:42 PM)_

{user message content, verbatim markdown preserved}

---

**Assistant** _(Jun 24, 2026, 1:42 PM)_

{assistant message content, verbatim markdown preserved}

---
```

Markdown formatting (`**bold**`, ` ```code``` `, tables) from the original assistant messages is preserved verbatim — `buildRenderedMarkdown` does not escape or transform content.

### `urlToDocId()` — stable ID generation

```
url = "https://chatgpt.com/share/6a3b9a96-..."
→ FNV-like 32-bit hash → unsigned → hex → "conv-1db333df"
```

Same URL always returns the same ID. This is safe to use as a `sessionStorage` cache key and as the `documentId` in the export API.

---

## 3. Live Validation Results

**URL tested:** `https://chatgpt.com/share/6a3b9a96-b39c-83ee-b869-1b4279145496`  
**Round-trip time:** 1,906 ms  
**HTTP status:** 200

### Document returned

| Field | Value |
|-------|-------|
| `id` | `conv-1db333df` |
| `title` | Math Question Answered |
| `provider` | chatgpt |
| `model` | gpt-5-5 |
| `messages` | 6 (3 user, 3 assistant) |
| `wordCount` | 154 |
| `description` | `What is 2+2?` |

### Assertions (42 / 42)

```
── Section 1: Validation error cases (9 assertions) ──
  ✅ No body → 400
  ✅ Error message present
  ✅ Missing url → 400
  ✅ Error mentions url field
  ✅ Empty url → 400
  ✅ Malformed URL → 400
  ✅ Unsupported domain → 422
  ✅ Hint in response
  ✅ Own-conversation link → 422

── Section 2: Real extraction (2 assertions) ──
  ✅ HTTP 200
  ✅ Responded in 1,906 ms

── Section 3: Document shape (28 assertions) ──
  ✅ document present in response
  ✅ id is a string
  ✅ id starts with conv-
  ✅ title is non-empty string
  ✅ title meaningful
  ✅ provider is chatgpt
  ✅ model is non-empty
  ✅ url matches input
  ✅ messages is array
  ✅ messages.length > 0
  ✅ has user messages
  ✅ has assistant messages
  ✅ no system messages
  ✅ all messages have content
  ✅ renderedMarkdown is string
  ✅ renderedMarkdown not empty
  ✅ renderedMarkdown starts with # title
  ✅ renderedMarkdown contains User turn
  ✅ renderedMarkdown contains Assistant turn
  ✅ wordCount is a positive number
  ✅ description is non-empty string
  ✅ metadata is object
  ✅ metadata.model set
  ✅ metadata.wordCount set
  ✅ metadata.messageCount > 0
  ✅ metadata.provider set
  ✅ metadata.exportFormats
  ✅ createdAt is a string

── Section 4: Content quality (4 assertions) ──
  ✅ Markdown formatting preserved (bold)
  ✅ Code blocks preserved
  ✅ Conversation separators present
  ✅ Table content preserved
```

---

## 4. Files Created / Changed

| File | Action | Notes |
|------|--------|-------|
| `src/app/api/extract/route.ts` | **Created** | The extraction API route |
| `scripts/validate-extraction-api.mjs` | **Created** | 42-assertion validation script |
| `scripts/extraction-api-results.json` | **Created** | Machine-readable validation output |
| `docs/EXTRACTION_API_REPORT.md` | **Created** | This file |

**Unchanged:** All page files, processing page, preview page, export route, PDF generation, MarkdownRenderer.

---

## 5. Integration Readiness

Phase 1 is complete. The `/api/extract` route is ready to be consumed by the UI.

### What Phase 2 must do (homepage wiring)

```typescript
// src/app/page.tsx — replace <Link href="/processing"> with:
const handleSubmit = async () => {
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const { document } = await res.json();
  sessionStorage.setItem("chat2pdf_current_doc", JSON.stringify(document));
  router.push("/processing");
};
```

### What Phase 4 must do (preview wiring)

```typescript
// src/app/preview/page.tsx — replace mockDocuments read with:
const [activeDoc, setActiveDoc] = useState<ConversationDocument | null>(null);
useEffect(() => {
  const stored = sessionStorage.getItem("chat2pdf_current_doc");
  if (stored) setActiveDoc(JSON.parse(stored));
}, []);
```

The `ConversationDocument` shape returned by `/api/extract` is **identical** to the `ConversationDocument` type imported from `mock-data.ts` — zero type changes are needed in the preview or export pages.
