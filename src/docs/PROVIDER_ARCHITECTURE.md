# PromptPress — Provider Adapter Architecture

**Status:** Architecture complete · Detection validated (21/21) · TypeScript ✅  
**Date:** 2026-06-24  
**Next step:** Step 2 — Implement extraction for each adapter

---

## 1. File Structure

```
src/providers/
├── types.ts       — Shared interfaces + error classes
├── chatgpt.ts     — ChatGPTAdapter
├── claude.ts      — ClaudeAdapter
├── gemini.ts      — GeminiAdapter
└── index.ts       — Registry, getProviderAdapter(), public barrel
```

All files are server-safe (no `"use client"` directive). They import only
Node.js built-ins (`URL`) and types — no network calls, no DOM, no Playwright.

---

## 2. Normalized Conversation Schema

Every provider adapter, regardless of how different its internal wire format is,
must normalize its output into these two interfaces before returning:

```typescript
interface ConversationMessage {
  id: string;                              // Stable unique ID for this turn
  role: "user" | "assistant" | "system";  // Who spoke
  content: string;                         // Raw markdown/text content
  timestamp?: string;                      // ISO-8601, if available
}

interface Conversation {
  provider: string;                        // "chatgpt" | "claude" | "gemini"
  title: string;                           // Derived from page or first message
  messages: ConversationMessage[];         // Ordered oldest→newest
  sourceUrl: string;                       // Original share URL
  metadata?: Record<string, string | number | boolean>; // Provider-specific extras
}
```

The `metadata` bag can hold provider-specific fields (model name, temperature,
token count, etc.) without polluting the core schema. Downstream code
(`MarkdownRenderer`, `pdf-generator`) only reads `messages` and `title`.

---

## 3. Adapter Contract

```typescript
interface ProviderAdapter {
  readonly name: string;           // "chatgpt" | "claude" | "gemini"
  detect(url: string): boolean;    // Pure, sync, infallible
  extract(url: string): Promise<Conversation>;
}
```

### detect() rules
- Must never throw — catch `URL` constructor errors and return `false`
- Must not make network requests — hostname matching only
- Must be conservative — prefer false negatives over false positives
- Must be fast — called for every URL before one is selected

### extract() rules (Step 2)
- May throw `ExtractionNotImplementedError` during architecture phase
- Must throw `InvalidShareUrlError` for valid-looking but non-extractable URLs
- Must throw `ExtractionError` (wrapping the cause) on any retrieval failure
- Returns `Promise<Conversation>` — always async, even for sync implementations

---

## 4. Data Flow

```
User pastes shared link
        │
        ▼
  isSupportedUrl(url)          ← Quick yes/no for UI validation
        │
  true ─┤─ false ──→ Show "Unsupported provider" error
        │
        ▼
  getProviderAdapter(url)       ← Walks REGISTRY, calls detect()
        │
        ├─ ChatGPTAdapter       hostname: chatgpt.com, chat.openai.com
        ├─ ClaudeAdapter        hostname: claude.ai
        └─ GeminiAdapter        hostname: gemini.google.com, aistudio.google.com, g.co
        │
        ▼
  adapter.isShareableUrl(url)   ← Stricter path-level check (UI use)
        │
  false ─┤─ Show "That's a ChatGPT URL, but not a share link" warning
        │
  true  ─┤
        ▼
  adapter.extract(url)          ← Step 2: async fetch + parse
        │
        ▼
  Conversation (normalized)
        │
        ├─→ MarkdownRenderer   (preview page)
        └─→ markdownToHtml()   → generatePdf()   (export)
```

---

## 5. URL Pattern Reference

### ChatGPT (`ChatGPTAdapter`)

| URL | detect() | isShareableUrl() |
|-----|:--------:|:----------------:|
| `https://chatgpt.com/share/<uuid>` | ✅ | ✅ |
| `https://chatgpt.com/c/<id>` | ✅ | ✅ |
| `https://chat.openai.com/share/<uuid>` | ✅ | ✅ |
| `https://chat.openai.com/c/<id>` | ✅ | ✅ |
| `https://chatgpt.com/` | ✅ | ❌ |
| `https://chatgpt.com/auth/login` | ✅ | ❌ |

Share ID regex: `/^\/(?:share|c)\/([a-zA-Z0-9_-]+)/`

### Claude (`ClaudeAdapter`)

| URL | detect() | isShareableUrl() |
|-----|:--------:|:----------------:|
| `https://claude.ai/chat/<id>` | ✅ | ✅ |
| `https://claude.ai/share/<id>` | ✅ | ✅ |
| `https://claude.ai/` | ✅ | ❌ |

Share ID regex: `/^\/(?:chat|share)\/([a-zA-Z0-9_-]+)/`

### Gemini (`GeminiAdapter`)

| URL | detect() | isShareableUrl() |
|-----|:--------:|:----------------:|
| `https://gemini.google.com/share/<id>` | ✅ | ✅ |
| `https://gemini.google.com/app/<id>` | ✅ | ✅ |
| `https://aistudio.google.com/app/prompts/<id>` | ✅ | ✅ |
| `https://g.co/gemini/share/<id>` | ✅ | ✅ |
| `https://gemini.google.com/` | ✅ | ❌ |

> [!NOTE]
> `g.co` short URLs redirect to `gemini.google.com` server-side. The extraction
> implementation must follow the redirect before parsing HTML. All other hostnames
> are direct targets.

---

## 6. Extension Points

### Adding a new provider (e.g. Perplexity)

1. Create `src/providers/perplexity.ts`:
```typescript
import type { ProviderAdapter, Conversation } from "./types";
import { ExtractionNotImplementedError } from "./types";

export class PerplexityAdapter implements ProviderAdapter {
  readonly name = "perplexity" as const;

  detect(url: string): boolean {
    try {
      return new URL(url).hostname === "www.perplexity.ai";
    } catch { return false; }
  }

  isShareableUrl(url: string): boolean {
    try {
      const { hostname, pathname } = new URL(url);
      return hostname === "www.perplexity.ai" && pathname.startsWith("/search/");
    } catch { return false; }
  }

  async extract(url: string): Promise<Conversation> {
    throw new ExtractionNotImplementedError(this.name, url);
  }
}
```

2. Add to `src/providers/index.ts`:
```typescript
import { PerplexityAdapter } from "./perplexity";

const REGISTRY: readonly ProviderAdapter[] = [
  new ChatGPTAdapter(),
  new ClaudeAdapter(),
  new GeminiAdapter(),
  new PerplexityAdapter(), // ← add here
];
```

3. Export from the barrel:
```typescript
export { PerplexityAdapter } from "./perplexity";
```

**No other files change.**

---

## 7. Extraction Roadmap (Step 2)

Implementation priority is based on share-page accessibility and user base size:

| Priority | Provider | Method | Auth Required | Difficulty |
|:--------:|----------|--------|:-------------:|:----------:|
| 1 | **ChatGPT** | Fetch `chatgpt.com/share/<id>` → parse `__NEXT_DATA__` JSON | No (public links) | Medium |
| 2 | **Claude** | Fetch `claude.ai/share/<id>` → parse embedded JSON | No (public links) | Medium |
| 3 | **Gemini** | Fetch `gemini.google.com/share/<id>` → parse `AF_initDataCallback` | No (public links) | Medium-Hard |
| 4 | **ChatGPT (auth)** | OpenAI API `/v1/chat/completions` | Yes (API key) | Easy |
| 5 | **Claude (auth)** | Anthropic Messages API | Yes (API key) | Easy |
| 6 | **Gemini (auth)** | Google Generative Language API | Yes (API key) | Easy |

### ChatGPT extraction sketch (Step 2)

```typescript
async extract(url: string): Promise<Conversation> {
  // 1. Fetch the share page
  const html = await fetch(url).then(r => r.text());

  // 2. Parse __NEXT_DATA__ from <script id="__NEXT_DATA__" type="application/json">
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  const nextData = JSON.parse(match![1]);

  // 3. Walk the conversation tree
  const linear = nextData.props.pageProps.serverResponse.data.linear_conversation;

  // 4. Normalize
  const messages: ConversationMessage[] = linear
    .filter((node: any) => node.message?.author?.role !== "tool")
    .map((node: any) => ({
      id: node.id,
      role: node.message.author.role,
      content: node.message.content.parts.join("\n"),
      timestamp: new Date(node.message.create_time * 1000).toISOString(),
    }));

  return {
    provider: this.name,
    title: nextData.props.pageProps.title ?? messages[0]?.content.slice(0, 60),
    messages,
    sourceUrl: url,
  };
}
```

### Error handling pattern (Step 2)

```typescript
async extract(url: string): Promise<Conversation> {
  if (!this.isShareableUrl(url)) throw new InvalidShareUrlError(this.name, url);
  try {
    // ... fetch + parse ...
  } catch (err) {
    if (err instanceof InvalidShareUrlError) throw err;
    throw new ExtractionError(this.name, url, "Parse failed", err);
  }
}
```

---

## 8. Integration with Existing Pipeline

Once `extract()` is implemented, the full pipeline from URL to PDF is:

```typescript
// In a Next.js API route: POST /api/extract
import { getProviderAdapter } from "@/providers";
import { markdownToHtml } from "@/lib/markdown-to-html";
import { generatePdf } from "@/lib/pdf-generator";

const adapter = getProviderAdapter(url);
const conversation = await adapter.extract(url);

// Convert messages to markdown
const markdown = conversation.messages
  .filter(m => m.role === "assistant")
  .map(m => m.content)
  .join("\n\n---\n\n");

// (existing pipeline — no changes needed)
const html = await markdownToHtml(markdown);
const pdf = await generatePdf({ title: conversation.title, content: markdown });
```

The provider layer plugs in cleanly above the existing unified pipeline.
`markdownToHtml()` and `generatePdf()` require zero changes.

---

## 9. Validation Results

**Script:** `scripts/validate-provider-detection.mjs`

```
✅ ChatGPT share link (current domain)
✅ ChatGPT /c/ conversation link
✅ ChatGPT legacy domain share link
✅ ChatGPT legacy domain /c/ link
✅ ChatGPT homepage (detected, not shareable)
✅ ChatGPT login page (detected, not shareable)
✅ Claude /chat/ link
✅ Claude /share/ link
✅ Claude homepage (detected, not shareable)
✅ Gemini share link
✅ Gemini /app/ link
✅ AI Studio prompts link
✅ Gemini short URL (g.co)
✅ Gemini homepage (detected, not shareable)
✅ Google homepage — unsupported
✅ Perplexity — unsupported
✅ Malformed URL — does not throw
✅ Empty string — does not throw
✅ Claude URL does NOT match ChatGPT adapter
✅ ChatGPT URL does NOT match Claude adapter
✅ Unsupported URL handled gracefully

Results: 21/21 passed · tsc --noEmit exit code 0
```
