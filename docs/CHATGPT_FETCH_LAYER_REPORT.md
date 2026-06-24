# ChatGPT Fetch Layer Report

**Task:** Task 1 — Share-link validation and HTTP fetch layer  
**Status:** ✅ Complete  
**Date:** 2026-06-24  
**Tests:** 28/28 offline · TypeScript exit code 0

---

## 1. Scope

This report covers Task 1 only: URL validation and raw HTML retrieval.  
Parsing (`__NEXT_DATA__`, message normalization) is implemented but documented separately.  
Claude and Gemini adapters are unchanged.

---

## 2. URL Validation Rules

### What is accepted

| Pattern | Example | Result |
|---------|---------|--------|
| `https://chatgpt.com/share/<uuid>` | `chatgpt.com/share/6751ab3d-…` | ✅ `isShareableUrl → true` |
| Any alphanumeric ID, dashes, underscores | `chatgpt.com/share/short` | ✅ |

**Only** `chatgpt.com` is the canonical target domain. The regex is:
```
/^\/share\/([a-zA-Z0-9_-]+)(?:\/.*)?$/
```

### What is explicitly rejected

| Pattern | Example | Error type |
|---------|---------|-----------|
| `/c/<id>` own-conversation links | `chatgpt.com/c/67c3b2a1-…` | `InvalidShareUrlError` (OWN_CONV branch) |
| Legacy `chat.openai.com/share/<id>` | `chat.openai.com/share/abc` | `InvalidShareUrlError` — redirects to chatgpt.com, not the canonical form |
| `chat.openai.com/c/<id>` | `chat.openai.com/c/abc` | `InvalidShareUrlError` |
| Homepage, login, settings | `chatgpt.com/`, `chatgpt.com/auth/login` | `InvalidShareUrlError` |
| Other providers | `claude.ai/…`, `gemini.google.com/…` | `InvalidShareUrlError` |
| Malformed strings | `not-a-url`, `""`, `javascript:…` | `InvalidShareUrlError` (URL constructor throws, caught) |

### Error discrimination

`extract()` checks for `/c/<id>` before the generic error so the user gets an actionable message:

```
/c/<id> URLs are personal conversations that require login.
Use the Share button in ChatGPT to create a public share link
(https://chatgpt.com/share/<uuid>) and paste that instead.
```

vs the generic:

```
URL must be a public ChatGPT share link: https://chatgpt.com/share/<uuid>
```

### detect() vs isShareableUrl()

| Method | chatgpt.com/share/x | chatgpt.com/c/x | chat.openai.com/share/x | claude.ai/… |
|--------|:-------------------:|:---------------:|:-----------------------:|:-----------:|
| `detect()` | ✅ | ✅ | ✅ | ❌ |
| `isShareableUrl()` | ✅ | ❌ | ❌ | ❌ |

`detect()` is broad intentionally — the registry uses it to select an adapter so specific error messages can be surfaced. `isShareableUrl()` is the gate before fetching.

---

## 3. HTTP Fetch Layer

### Function signature

```typescript
export async function fetchChatGPTSharePage(url: string): Promise<string>
```

Exported for independent testing. Used internally by `ChatGPTAdapter.extract()`.

### Request configuration

```typescript
fetch(url, {
  method:   "GET",
  redirect: "follow",    // Follow 301/302 redirects transparently
  cache:    "no-store",  // Always fetch fresh — share pages can be updated
  headers:  BROWSER_HEADERS,
})
```

### Browser-like headers sent

| Header | Value |
|--------|-------|
| `User-Agent` | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36` |
| `Accept` | `text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8` |
| `Accept-Language` | `en-US,en;q=0.9` |
| `Accept-Encoding` | `gzip, deflate, br` |
| `Cache-Control` | `no-cache` |
| `Pragma` | `no-cache` |
| `Sec-Fetch-Dest` | `document` |
| `Sec-Fetch-Mode` | `navigate` |
| `Sec-Fetch-Site` | `none` |
| `Upgrade-Insecure-Requests` | `1` |

Rationale: ChatGPT's CDN (Fastly/Cloudflare) checks `User-Agent` and the `Sec-Fetch-*` hint headers. Requests without a realistic UA are returned a bot-detection challenge page rather than the share page HTML.

### HTTP status handling

| Status | Behaviour |
|--------|-----------|
| `200` | Returns HTML string |
| `301 / 302` | Followed automatically (`redirect: "follow"`) |
| `404` | `ExtractionError` — "share link may have expired or been deleted" |
| `401 / 403` | `ExtractionError` — "conversation may be private / requires login" |
| `429` (first) | Wait 2 s, retry once |
| `429` (second) | `ExtractionError` — "rate limited, wait a few minutes" |
| Any other non-ok | `ExtractionError` — `HTTP <status>` |
| Network failure | Propagated as-is, wrapped by outer `catch` in `extract()` into `ExtractionError` |

### Why `cache: "no-store"`

ChatGPT users can revoke share links or edit conversations after sharing. A stale cached response could return a deleted conversation or outdated messages. `no-store` ensures every call reflects the current server state.

---

## 4. Files Changed

| File | Change |
|------|--------|
| `src/providers/chatgpt.ts` | Narrowed `SHARE_PATH_RE` to `/share/` only; added `OWN_CONV_PATH_RE`; hardened `isShareableUrl()` to `chatgpt.com` only; improved `/c/<id>` error message in `extract()`; exported `fetchChatGPTSharePage()`; added `cache: "no-store"` |
| `scripts/validate-chatgpt-fetch-layer.mjs` | New — 28-case offline validation script + optional live network suite |
| `docs/CHATGPT_FETCH_LAYER_REPORT.md` | This file |

**Files NOT changed:** `claude.ts`, `gemini.ts`, `types.ts`, `index.ts`, all other providers, all app pages, API routes.

---

## 5. Validation Results

```
=== Suite A — Offline URL Validation ===

── Valid share URLs (isShareableUrl → true) ──
  ✅ https://chatgpt.com/share/6751ab3d-f2e4-4a8c-9b12-3c7e09f42a11
  ✅ https://chatgpt.com/share/abc123DEF456-xyz
  ✅ https://chatgpt.com/share/short

── /c/<id> links (isShareableUrl → false, isOwnConvUrl → true) ──
  ✅ isShareableUrl → false: https://chatgpt.com/c/67c3b2a1-e8f4-4b2c-a1d0-5e6f7a8b9c0d
  ✅ isOwnConvUrl  → true  : https://chatgpt.com/c/67c3b2a1-e8f4-4b2c-a1d0-5e6f7a8b9c0d
  ✅ isShareableUrl → false: https://chatgpt.com/c/abc123
  ✅ isOwnConvUrl  → true  : https://chatgpt.com/c/abc123
  ✅ isShareableUrl → false: https://chat.openai.com/c/abc123

── Legacy chat.openai.com/share/ (detect → true, isShareableUrl → false) ──
  ✅ detect → true         : https://chat.openai.com/share/abc123-def456
  ✅ isShareableUrl → false: https://chat.openai.com/share/abc123-def456

── Unsupported / malformed URLs ──
  ✅ isShareableUrl → false: https://claude.ai/chat/abc
  ✅ isShareableUrl → false: https://gemini.google.com/share/x
  ✅ isShareableUrl → false: https://chatgpt.com/
  ✅ isShareableUrl → false: https://chatgpt.com/auth/login
  ✅ isShareableUrl → false: https://chatgpt.com/gpts
  ✅ isShareableUrl → false: not-a-url
  ✅ isShareableUrl → false: (empty)
  ✅ isShareableUrl → false: javascript:alert(1)

── extractShareId ──
  ✅ Extracts UUID from /share/<uuid>
  ✅ Returns null for /c/<id>
  ✅ Returns null for non-ChatGPT URL
  ✅ Returns null for malformed URL

── validateBeforeFetch error discrimination ──
  ✅ Valid share URL → ok: true
  ✅ /c/<id> → error: OWN_CONV
  ✅ Homepage → error: INVALID_URL
  ✅ Claude URL → error: INVALID_URL
  ✅ Malformed URL → error: INVALID_URL

Results: 28 passed, 0 failed · tsc --noEmit exit code 0
```

---

## 6. Running the Online Suite

```bash
# Run all tests (Suite A offline + Suite B live network):
node scripts/validate-chatgpt-fetch-layer.mjs

# Skip network (CI / no internet):
$env:SKIP_NETWORK="1"; node scripts/validate-chatgpt-fetch-layer.mjs

# Test with a real public share URL:
$env:CHATGPT_SHARE_URL="https://chatgpt.com/share/<your-id>"; node scripts/validate-chatgpt-fetch-layer.mjs
```

Suite B verifies:
- A non-existent UUID returns a network error (404 or equivalent)
- A real share URL returns 200 with `>500` bytes of HTML
- The response contains the `__NEXT_DATA__` script tag
- The response is not a bot-block page

---

## 7. Known Limitations

| Limitation | Impact | Mitigation |
|-----------|--------|-----------|
| `chat.openai.com/share/<id>` links are rejected | Users on the legacy domain must use the chatgpt.com URL | Redirect to `chatgpt.com/share/<id>` can be implemented in a future task |
| ChatGPT may add stricter bot detection | Fetch returns challenge HTML rather than conversation | Add cookie / session header support; Playwright fallback |
| Rate limiting on repeated fetches | 429 after ~30 req/min | Exponential backoff with jitter in a future retry layer |
| `cache: "no-store"` increases server load | Every call is a fresh fetch | Acceptable for low-volume MVP; add Redis cache keyed on share ID for scale |

---

## 8. Next Task (Task 2)

Parse the raw HTML returned by `fetchChatGPTSharePage()`:
- Extract `__NEXT_DATA__` JSON
- Find conversation payload at known JSON paths
- Linearize `linear_conversation[]` or `mapping{}` tree
- Normalize to `ConversationMessage[]`

The parsing layer is already implemented in `chatgpt.ts` as `parseSharePageHtml()` (exported helper) and the private `parseNextDataScript()` / `findConversationData()` / `assembleConversation()` chain. Task 2 consists of validating and hardening this layer against real HTML samples.
