# Extraction Integration Audit

**Date:** 2026-06-24  
**Mode:** Read-only — no code changes made  
**Scope:** Full user-flow trace from URL input to preview

---

## 1. Current Flow Diagram

```
User enters URL in <input>
        │
        │  [page.tsx line 42-47]
        │  <Link href="/processing">  ← URL value NEVER READ, NEVER STORED
        ▼
/processing page (processing/page.tsx)
        │
        │  [processing/page.tsx line 12-17]
        │  useEffect → setTimeout 10 s → router.push("/preview")
        │  NO API CALL. NO EXTRACTION. PURE TIMER.
        ▼
/preview page (preview/page.tsx)
        │
        │  [preview/page.tsx line 8]
        │  import { mockDocuments } from "@/lib/mock-data"
        │
        │  [preview/page.tsx line 95]
        │  const activeDoc = mockDocuments[activeDocIndex]
        │  ← always the first mock document, regardless of input
        ▼
MarkdownRenderer renders mockDocuments[0].renderedMarkdown
```

**The URL the user types is captured in React state (`setUrl`) but is never read again.** The `<Link href="/processing">` is a hard-coded navigation — it carries no query parameter, no state, no context.

---

## 2. Where `mock-data.ts` Is Still Used

Every consumer in the current codebase reads mock data unconditionally:

| File | Line | What it reads | Purpose |
|------|------|--------------|---------|
| `src/app/page.tsx` | 15 | `mockGalleryDocuments` | "Recent Conversions" gallery section on the homepage |
| `src/app/preview/page.tsx` | 8 | `mockDocuments`, `ConversationDocument` | **Primary data source for the entire preview page** |
| `src/app/preview/page.tsx` | 95 | `mockDocuments[activeDocIndex]` | `activeDoc` — the document being rendered |
| `src/app/preview/page.tsx` | 197 | `mockDocuments` | Document-switcher dropdown |
| `src/components/PreviewSidebar.tsx` | 14 | `ConversationDocument` type only | Type import — not a data dependency |
| `src/components/ProcessingCard.tsx` | 6 | `mockProcessingSteps` | Animated status list on the processing page |
| `src/app/api/export/pdf/route.ts` | 3, 22–24 | `mockDocuments` | **PDF export uses mock data to find the document by ID** |

---

## 3. Whether `ChatGPTAdapter.extract()` Is Called Anywhere

**`ChatGPTAdapter.extract()` is never called in the application.**

- `src/providers/index.ts` defines `getProviderAdapter()` and exports all adapters — this file is never imported by any app page or API route.
- `src/providers/chatgpt.ts` is fully implemented and tested, but nothing in `src/app/` or `src/lib/` imports from `@/providers`.

Confirmed by grep: `getProviderAdapter` has **zero call sites** outside `src/providers/index.ts` itself. `ChatGPTAdapter` has **zero call sites** outside `src/providers/index.ts`.

---

## 4. Whether an Extraction API Route Exists and Is Wired

**No extraction API route exists.**

The only API routes in the application are:

| Route | File | Does extraction? |
|-------|------|:---------------:|
| `POST /api/export/pdf` | `src/app/api/export/pdf/route.ts` | ❌ Reads `mockDocuments` by ID |
| `GET /api/export/pdf` | `src/app/api/export/pdf/route.ts` | ❌ Uses `mockDocuments[0]` |
| `GET /api/health` | `src/app/api/health/route.ts` (presumed) | ❌ Health check only |

There is **no `/api/extract` route**. There is no route that calls `getProviderAdapter()`, `ChatGPTAdapter.extract()`, or any provider function.

---

## 5. How `preview/page.tsx` Receives Its Document Data

```
preview/page.tsx
  ├── imports mockDocuments from "@/lib/mock-data"          (line 8)
  ├── const activeDoc = mockDocuments[activeDocIndex]        (line 95)
  └── renders activeDoc.renderedMarkdown via MarkdownRenderer (line 276)
```

There is no `useEffect` that fetches from an API. There is no `searchParams` read. There is no `sessionStorage` read for conversation data. The `sessionStorage` writes at lines 101–107 only store `promptpress_active_doc_id` and `promptpress_active_doc_title` — values from the mock document — so the export page reads back mock IDs.

---

## 6. Full Gap Map

```
WHAT EXISTS                           WHAT IS MISSING
─────────────────────────────         ─────────────────────────────────────
✅ URL <input> on homepage            ❌ URL not passed anywhere on submit
✅ /processing route                  ❌ No extraction triggered on /processing
✅ ChatGPTAdapter.extract()           ❌ Never called
✅ getProviderAdapter()               ❌ Never called
✅ providers/index.ts registry        ❌ Not imported by any app file
                                      ❌ No /api/extract route
                                      ❌ /preview reads mockDocuments directly
                                      ❌ Export reads mockDocuments directly
```

---

## 7. Exact Files That Must Change

### Priority 1 — Create the extraction API route (does not exist yet)

**New file:** `src/app/api/extract/route.ts`

```
POST /api/extract
Body:  { url: string }
Returns: { id, title, provider, model, messages[], renderedMarkdown, metadata }
```

This route must:
1. Call `getProviderAdapter(url)` from `@/providers`
2. Call `adapter.extract(url)` → `Conversation`
3. Call `markdownToHtml()` or build `renderedMarkdown` from messages
4. Store the result (sessionStorage via client, or server-side cache/DB)
5. Return the normalized document as JSON

### Priority 2 — Wire the homepage submit

**File:** `src/app/page.tsx`

- Change `<Link href="/processing">` to a `<button>` that:
  1. Calls `POST /api/extract` with the current `url` state
  2. On success, stores the returned document in `sessionStorage`
  3. Navigates to `/processing?url=<encoded>` (or `/preview` directly)

### Priority 3 — Wire the processing page to the extraction

**File:** `src/app/processing/page.tsx`

- The current page is a pure 10-second timer → redirect.
- It must read the URL from `searchParams` or `sessionStorage`.
- Poll or await the extraction API (if async) and redirect to `/preview` when complete.
- Pass the result ID or the full document via `sessionStorage`.

### Priority 4 — Wire the preview page to real data

**File:** `src/app/preview/page.tsx`

Replace:
```typescript
import { mockDocuments } from "@/lib/mock-data";
const activeDoc = mockDocuments[activeDocIndex];
```

With:
```typescript
// Read document from sessionStorage (written after extraction)
const [doc, setDoc] = useState<ConversationDocument | null>(null);
useEffect(() => {
  const stored = sessionStorage.getItem("promptpress_current_doc");
  if (stored) setDoc(JSON.parse(stored));
}, []);
```

The `ConversationDocument` shape in `mock-data.ts` is already compatible with `Conversation` from `@/providers/types.ts` — the field names align closely (`title`, `messages`, `provider`, `model`). A thin adapter function is needed to convert `Conversation → ConversationDocument` (add `renderedMarkdown`, `description`, `metadata.wordCount` etc.).

### Priority 5 — Wire the export route to real data

**File:** `src/app/api/export/pdf/route.ts`

Replace `mockDocuments.find(d => d.id === documentId)` with a lookup against the stored extracted document (from the same `sessionStorage` key or a server-side document store).

---

## 8. Recommended Implementation Order

```
Step 1  src/app/api/extract/route.ts          CREATE
        ↳ getProviderAdapter(url).extract(url)
        ↳ Convert Conversation → ConversationDocument shape
        ↳ Return JSON

Step 2  src/app/page.tsx                       MODIFY
        ↳ Replace <Link> with button + fetch("/api/extract")
        ↳ Write result to sessionStorage("promptpress_current_doc")
        ↳ Navigate to /processing

Step 3  src/app/processing/page.tsx            MODIFY
        ↳ Replace pure timer with extraction-complete check
        ↳ Redirect to /preview when sessionStorage doc is ready

Step 4  src/app/preview/page.tsx               MODIFY
        ↳ Read from sessionStorage instead of mockDocuments
        ↳ Keep all filter/export logic intact (it already works)

Step 5  src/app/api/export/pdf/route.ts        MODIFY
        ↳ Accept full content in request body (already supported via body.content)
        ↳ Remove mockDocuments lookup (or keep as development fallback)
```

> [!NOTE]
> Steps 4 and 5 have the smallest diff. The export route already handles `body.content` overrides (line 36–39) — the preview page already sends `filteredContent` when filters are active. If the preview page sends the full content for all exports (not just filtered ones), the export route needs almost no change.

> [!IMPORTANT]
> The `ConversationDocument` type in `mock-data.ts` includes fields (`description`, `metadata.revision`, `metadata.wordCount`, `renderedMarkdown`) that `Conversation` from `@/providers/types.ts` does not have. An adapter/conversion function is required between Step 1 and Step 4. This is the only non-trivial shape mismatch.

---

## 9. Type Mismatch: `Conversation` vs `ConversationDocument`

| Field | `Conversation` (providers/types.ts) | `ConversationDocument` (mock-data.ts) | Notes |
|-------|-------------------------------------|---------------------------------------|-------|
| `id` | ❌ absent | ✅ `id: string` | Must be generated (e.g. UUID or URL hash) |
| `title` | ✅ `title: string` | ✅ `title: string` | Direct match |
| `provider` | ✅ `provider: string` | ✅ `provider: "chatgpt"\|"claude"\|"gemini"` | Compatible |
| `messages` | ✅ `ConversationMessage[]` | ✅ `Message[]` | Field names match; type names differ |
| `sourceUrl` | ✅ `sourceUrl: string` | ✅ `url: string` | Name mismatch — rename needed |
| `metadata` | ✅ `metadata?: Record<string, ...>` | ✅ `metadata: DocumentMetadata` | Structure differs — adapter needed |
| `renderedMarkdown` | ❌ absent | ✅ `renderedMarkdown: string` | Must be generated by `markdownToHtml()` |
| `description` | ❌ absent | ✅ `description: string` | Can be derived from first user message |
| `model` | ✅ in `metadata.model` | ✅ `model: string` (top-level) | Different location — adapter needed |
| `wordCount` | ❌ absent | ✅ `wordCount: number` | Can be computed from `renderedMarkdown` |
| `createdAt` | ❌ absent | ✅ `createdAt: string` | Use `metadata.created` or current time |
