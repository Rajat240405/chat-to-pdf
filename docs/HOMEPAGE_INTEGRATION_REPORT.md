# Homepage Integration Report

**Task:** Integration Phase 2 — Homepage Wiring  
**Date:** 2026-06-24  
**Status:** ✅ Complete  
**Live validation:** 44/44 passed · tsc --noEmit exit 0 · 1,187 ms round-trip

---

## 1. Changes to `src/app/page.tsx`

### Imports added / removed

| Change | Detail |
|--------|--------|
| `+` `useCallback` | For `handleConvert` memoization |
| `+` `useRouter` | For programmatic navigation after success |
| `+` `Loader2` (lucide) | Spinner icon during extraction |
| `−` `ArrowRight` (lucide) | Was imported but never used |

`Link` import is retained (still used by the gallery section and View Documentation Gallery link).

### State added

| State | Type | Purpose |
|-------|------|---------|
| `isLoading` | `boolean` | Disables input + button; shows spinner |
| `error` | `string \| null` | Inline error message below the input row |

### `handleConvert` flow

```
Click "Convert Conversation" (or press Enter in the input)
  │
  ├─ url.trim() === "" → setError("Please paste a share link…") → return
  │
  ├─ setIsLoading(true) + setError(null)
  │
  └─ POST /api/extract { url }
       │
       ├─ !res.ok → setError(json.error ?? generic message) → return
       │
       ├─ !json.document → setError("We couldn't extract that conversation.

Please make sure it's a public ChatGPT share link.…") → return
       │
       ├─ sessionStorage.setItem("promptpress_current_doc", JSON.stringify(doc))
       │    (inner try/catch — private browsing degrades silently)
       │
       └─ router.push("/processing")
```

### UI changes

| Element | Before | After |
|---------|--------|-------|
| Hero "Convert Conversation" | `<Link href="/processing">` | `<button id="btn-start-converting">` with `onClick={handleConvert}` |
| Input | No `id`, no `disabled`, no `onKeyDown` | `id="url-input"`, `disabled={isLoading}`, Enter key triggers `handleConvert` |
| Error display | Absent | `<p id="url-error" role="alert">` below input row, shown only when `error !== null` |
| CTA "Get Started Free" | `<Link href="/processing">` | `<button id="btn-get-started">` that scrolls to top |

---

## 2. sessionStorage Contract

The key written by the homepage is read by the preview page (Phase 4):

```
Key:   "promptpress_current_doc"
Value: JSON.stringify(ConversationDocument)
Size:  2.3 KB for a 6-message conversation (well within sessionStorage limits)
```

The same `ConversationDocument` type is already used by `preview/page.tsx` and `api/export/pdf/route.ts` via `mock-data.ts` imports — no type changes are needed in those files.

---

## 3. Validation Results

**URL tested:** `https://chatgpt.com/share/6a3b9a96-b39c-83ee-b869-1b4279145496`  
**Round-trip time:** 1,187 ms  
**Serialized document size:** 2.3 KB

```
Section 1: Dev server reachability     1/1  ✅
Section 2: Empty / missing URL         4/4  ✅
Section 3: Invalid URL format          3/3  ✅
Section 4: Unsupported provider        3/3  ✅
Section 5: Successful extraction       3/3  ✅
Section 6: ConversationDocument shape 25/25 ✅
Section 7: sessionStorage round-trip   6/6  ✅

Total: 44 passed, 0 failed
```

---

## 4. Files Changed

| File | Action |
|------|--------|
| `src/app/page.tsx` | **Modified** — `handleConvert`, loading/error state, button replacement |
| `scripts/validate-homepage-flow.mjs` | **Created** — 44-assertion validation |
| `scripts/homepage-flow-results.json` | **Created** — machine-readable output |
| `docs/HOMEPAGE_INTEGRATION_REPORT.md` | **Created** — this file |

**Unchanged:** `processing/page.tsx`, `preview/page.tsx`, `api/export/pdf/route.ts`, all provider code, PDF generation, MarkdownRenderer.

---

## 5. Phase 3 & 4 Readiness

The document is now in `sessionStorage` after a successful conversion. The remaining phases can read it immediately:

### Phase 3 — Processing page

```typescript
// processing/page.tsx — read the URL being processed (optional display)
const doc = JSON.parse(sessionStorage.getItem("promptpress_current_doc") ?? "null");
// Redirect immediately if doc already exists (extraction already done)
if (doc) router.push("/preview");
```

### Phase 4 — Preview page

```typescript
// preview/page.tsx — replace mockDocuments read
useEffect(() => {
  const stored = sessionStorage.getItem("promptpress_current_doc");
  if (stored) setActiveDoc(JSON.parse(stored));
}, []);
```

The returned `ConversationDocument` shape is **type-identical** to `mock-data.ts`'s `ConversationDocument` — no type changes are needed in preview or export.
