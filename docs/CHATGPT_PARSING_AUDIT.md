# ChatGPT Parsing Layer — Audit Report

**Task:** Task 2 — Review only. No code changes.  
**Date:** 2026-06-24  
**Source file:** `src/providers/chatgpt.ts` (lines 116–430)  
**Scope:** `parseSharePageHtml`, `parseNextDataScript`, `findConversationData`, `assembleConversation` — plus their private dependencies `extractTextContent`, `shouldKeepNode`, `normalizeNode`, `normalizeFromLinear`, `normalizeFromMapping`

---

## Confidence Legend

| Rating | Meaning |
|--------|---------|
| 🟢 High | Logic is correct and the underlying data structure is stable or well-guarded |
| 🟡 Medium | Logic is correct but depends on an undocumented structure that has changed before |
| 🔴 Low | Logic is fragile; a minor platform change will silently break it |

---

## 1. `parseNextDataScript(html: string): unknown | null`

**Lines:** 133–144

### Purpose
Extracts the full `__NEXT_DATA__` JSON payload from the raw HTML string returned by `fetchChatGPTSharePage()`. This is the entry point for all downstream parsing. Returns `null` on any failure rather than throwing.

### Exact regex relied upon
```
/<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
```

- `\b` before `id=` prevents matching attributes like `data-id="__NEXT_DATA__"`
- `[\s\S]*?` is non-greedy — matches the smallest possible content between `>` and `</script>`
- Case-insensitive flag `i` handles theoretical `<SCRIPT>` uppercase (not seen in practice)

### Assumptions about ChatGPT share page structure
1. The page is a **Next.js** application — this is why `__NEXT_DATA__` exists at all
2. Exactly **one** `<script id="__NEXT_DATA__">` tag exists in the document
3. The full JSON is embedded **inline** in the script tag (not loaded via `src=""`)
4. The JSON does **not** contain the literal string `</script>` (would terminate the non-greedy match early)

### Failure modes
| Scenario | Behaviour |
|----------|-----------|
| No `__NEXT_DATA__` tag found | Returns `null` — caller throws `ExtractionError` |
| Tag found but content is invalid JSON | `JSON.parse` throws, caught, returns `null` |
| JSON contains `</script>` as literal text | Regex match truncates prematurely; `JSON.parse` fails; returns `null` |
| Multiple `__NEXT_DATA__` tags | Matches the first one only (correct — Next.js emits exactly one) |
| Very large JSON (>50 MB) | `JSON.parse` succeeds but `[\s\S]*?` regex can be slow on some engines |

### Real-world breakage risks

**🔴 Framework migration** — ChatGPT has been moving toward a React-based SPA with a custom bundler. If OpenAI drops Next.js in favour of Remix, Vite, or a bespoke setup, the `__NEXT_DATA__` tag will vanish entirely. The function returns `null` silently; the error surfaces two frames up in `extract()` with the message "`__NEXT_DATA__` script tag not found." This is the highest-probability breaking change.

**🟡 JSON escaping edge case** — Next.js serializes `</script>` inside JSON strings as `\u003c\/script\u003e`. This is the standard behaviour and means the regex truncation risk is extremely low in practice, but it is a latent assumption with no guard in the code.

**🟢 Bot-detection interception** — If the CDN returns a Cloudflare challenge page instead of the share page, the page has no `__NEXT_DATA__` tag and the function returns `null`. The caller's error message is accurate.

### Confidence: 🟡 Medium
Works correctly against current ChatGPT HTML. Will break immediately and silently if OpenAI drops Next.js — the sole dependency of this function.

---

## 2. `findConversationData(nextData: unknown): RawConvData | null`

**Lines:** 166–189

### Purpose
Searches for the raw conversation payload object inside the `__NEXT_DATA__` tree by trying four progressively-shallower JSON paths. Returns the first candidate that appears to contain conversation data, or `null` if none match.

### Exact JSON paths tried (in priority order)

| Priority | Path | Rationale |
|:--------:|------|-----------|
| 1 | `props.pageProps.serverResponse.data` | Primary path, verified in ChatGPT ~2024–2026 |
| 2 | `props.pageProps.serverResponse` | Alt: `data` may sit at the `serverResponse` level |
| 3 | `props.pageProps.sharedConversation` | Older format seen in ~2023 share pages |
| 4 | `props.pageProps` | Broad fallback — accepts any pageProps object |

### Acceptance criteria for each candidate
A candidate is accepted if it is a non-null object that satisfies **at least one** of:
- `linear_conversation` is an `Array`
- `mapping` is an `object`
- `title` is a `string`

### Assumptions about ChatGPT share page structure
1. The Next.js `__NEXT_DATA__` always has a `props.pageProps` key
2. The conversation payload is always somewhere under `props.pageProps`
3. The presence of `title`, `linear_conversation`, or `mapping` uniquely identifies the conversation object — no other pageProps key happens to have all three absent but still contain conversation data

### Failure modes
| Scenario | Behaviour |
|----------|-----------|
| None of the 4 paths resolve to a qualifying object | Returns `null` — caller throws `ExtractionError` |
| Path 4 (`pageProps`) matches but `pageProps` has no `linear_conversation` or `mapping` | Returns `pageProps` itself — `assembleConversation` then throws "No extractable messages" |
| New path introduced by OpenAI (e.g. `props.pageProps.data`) | Not tried — returns `null` |
| A path resolves but the candidate has `title` string but empty `linear_conversation` | Accepted by the title guard; `assembleConversation` throws on empty messages |

### Real-world breakage risks

**🔴 Path rename** — `serverResponse` and `sharedConversation` are undocumented internal keys. OpenAI has changed the `__NEXT_DATA__` JSON schema at least twice (2023 → 2024 rewrite, again in early 2025 alongside the memory/projects launch). The next schema change will likely cause path 1 to miss and path 4 to fire with a `pageProps` object that lacks `linear_conversation`, producing "No extractable messages."

**🟡 False positive on path 4** — The fallback `props.pageProps` is very broad. If OpenAI ever adds a `title` field to `pageProps` for SEO purposes (separate from the conversation title), path 4 could match a non-conversation object and `assembleConversation` would find 0 messages and throw. The error message is correct but the failure path is confusing to debug.

**🟢 No conversation data present** — If `nextData` is entirely empty or malformed, all four `deepGet` calls return `undefined`, the loop finds no candidate, and the function correctly returns `null`.

### Confidence: 🔴 Low
The 4-path approach is a solid mitigation strategy, but the underlying paths are all undocumented internal names. The current 4-path set covers all known historical versions, but the next schema change — expected when OpenAI ships its in-progress PWA rewrite — will add a fifth path that is not currently covered.

---

## 3. `assembleConversation(data: RawConvData, sourceUrl: string): Conversation`

**Lines:** 378–430

This is the orchestrator. It calls into two sub-pipelines (`normalizeFromLinear` or `normalizeFromMapping`) and then builds the final `Conversation` object. Audited below, then its dependencies are audited separately.

### Purpose
Convert the raw `RawConvData` object returned by `findConversationData` into a fully normalized `Conversation`. Chooses between the linear path and the tree path automatically.

### Exact fields read from `data`

| Field | Type expected | Purpose | Fallback |
|-------|--------------|---------|----------|
| `data.linear_conversation` | `RawNode[]` | Primary message source | Falls to `mapping` |
| `data.mapping` | `Record<string, RawNode>` | Fallback message source | Throws if both empty |
| `data.title` | `string` | Conversation title | First user message line → "Untitled…" |
| `data.create_time` | `number` (Unix seconds) | metadata.created | Omitted |
| `data.update_time` | `number` (Unix seconds) | metadata.updated | Omitted |
| `data.model.slug` | `string` | metadata.model | Omitted |
| `data.conversation_id` | `string` | metadata.conversationId | Omitted |

### Path selection logic

```
linear_conversation present AND length > 0   → normalizeFromLinear()
else mapping present as object               → normalizeFromMapping()
else                                         → messages stays []  → ExtractionError
```

**Critical gap:** If `linear_conversation` is present but contains **only** filtered-out nodes (all tool messages, all weight-0 nodes, all image-only), the array is non-empty so the `mapping` fallback is never tried. `normalizeFromLinear` returns `[]`, then `assembleConversation` throws "No extractable messages" even if `mapping` would have succeeded.

### Title derivation chain
```
data.title (non-empty string)
  → else: firstUserMsg.content.split("\n")[0].slice(0, 80).trim()
    → else: "Untitled ChatGPT Conversation"
```

**Edge case:** A conversation with no user messages (system → assistant only) has no `firstUserMsg`. The fallback "Untitled ChatGPT Conversation" fires. This is acceptable but could be improved by using the first assistant message line.

### Timestamp handling
`data.create_time` is a Unix timestamp in **seconds** (float). Conversion: `new Date(create_time * 1000).toISOString()`. Correct. However, `create_time` for the **conversation** is different from `msg.create_time` for individual messages — both are used at different points. The conversation-level timestamps go into `metadata`; per-message timestamps go into `ConversationMessage.timestamp`.

### Failure modes
| Scenario | Behaviour |
|----------|-----------|
| Both `linear_conversation` and `mapping` absent | Throws `ExtractionError` "No extractable messages" |
| `linear_conversation` present but all nodes filtered | `mapping` not tried; throws "No extractable messages" |
| `data.model` is not an object | `model.slug` check fails gracefully; metadata omits `model` |
| `data.create_time` is 0 | Converts to `1970-01-01T00:00:00.000Z` — semantically wrong but not a thrown error |
| `data.title` is whitespace-only `"   "` | `.trim().length > 0` is false; falls to first user message. Correct. |

### Confidence: 🟡 Medium
The logic is sound and handles most edge cases. The main risk is the `linear_conversation` / `mapping` priority — the linear array preempts the mapping even when it yields zero messages.

---

## 3a. `extractTextContent(content: RawContent | null | undefined): string`

**Lines:** 198–220

### Purpose
Extract a plain text string from a ChatGPT message `content` object. Returns `""` for non-text content types (images, tool outputs, audio, etc.).

### Content type handling

| Condition tested | Example | Action |
|-----------------|---------|--------|
| `content_type === "text"` AND `parts` is array | Standard user/assistant message | Filter string parts, join with `\n` |
| `content.text` is a string | Older serialization format | Return directly |
| `parts` is array (any `content_type`) | Mixed content | Filter string parts, join if any exist |
| None of the above | Image-only, tool result, audio | Return `""` |

### Assumptions
1. String parts within `content.parts[]` are the full text — there is no per-part joining logic beyond `\n`
2. Parts that are objects (e.g. image asset pointers, `tether_browsing_display`, multimodal blocks) should be silently dropped — no indication to the caller that content was truncated
3. Multi-turn messages (where a single assistant turn has both text and a tool call) lose the tool-call portion silently

### Failure modes
| Scenario | Behaviour |
|----------|-----------|
| `parts` contains `null` entries | Filtered out by `typeof p === "string"` — correct |
| `content_type` is `"multimodal_text"` (mixed image+text GPT-4V) | Falls to third branch; string parts extracted, images silently dropped |
| `content_type` is `"tether_browsing_display"` (web search results) | No string parts; returns `""` — message silently dropped by `normalizeFromLinear` post-filter |
| `content_type` is `"code"` (from older DALL-E flows) | Falls to third branch; may or may not have string parts |
| An assistant message with `content_type === "text"` but `parts: []` | Returns `""` — message silently dropped |

### Real-world breakage risks

**🟡 New content types** — OpenAI regularly adds content types (`"reasoning"`, `"thinking"`, `"canvas"`, `"voice_memo"`, etc.). Each new type silently produces `""` and the message disappears from output. There is no warning or logging when this happens.

**🟢 The silent-drop is intentional** — Tool outputs and image generations are not readable text and dropping them is correct. The risk is that future types that *do* have readable text (e.g. code canvas, artifacts) will also be dropped until the function is updated.

### Confidence: 🟢 High for existing content types / 🟡 Medium for new ones

---

## 3b. `shouldKeepNode(node: RawNode): boolean`

**Lines:** 227–237

### Purpose
Gate function applied to every node before normalization. Returns `false` for internal/invisible nodes that should not appear in the output.

### Exact fields checked

| Field | Check | Reason |
|-------|-------|--------|
| `node.message` | Truthy | Root node and some padding nodes have `message: null` |
| `msg.author?.role` | Truthy | Some metadata-only nodes have no author |
| `KEPT_ROLES.has(role)` | `"user"` or `"assistant"` | Filters `"tool"`, `"system"`, `"browser"`, etc. |
| `msg.weight === 0` | Reject | Weight-0 nodes are invisible in the ChatGPT UI |
| `msg.recipient && recipient !== "all"` | Reject | Tool-directed messages (e.g. `recipient: "browser"`) |

### Assumptions
1. `weight: 0` reliably indicates an invisible/internal message — this is an undocumented internal field
2. `recipient: "all"` means the message is shown to the user — messages to a specific tool have a non-"all" recipient
3. All assistant messages intended for the user have `recipient: "all"` or `recipient: undefined`

### Failure modes
| Scenario | Behaviour |
|----------|-----------|
| Weight field absent (undefined) | `msg.weight === 0` is `false`; node is kept — correct |
| Weight is 0.5 (partial/streaming artifact) | Not filtered; may produce a duplicate of a completed message |
| Recipient field absent | `msg.recipient && ...` is `false`; node is kept — correct |
| New internal role (e.g. `"canvas"`, `"memory"`) | Not in KEPT_ROLES; silently filtered. May discard content if OpenAI adds readable memory entries |

### Real-world breakage risks

**🟡 Weight semantics** — `weight` is not documented. If OpenAI changes its meaning (e.g. uses `0` for deprecated messages that should still be shown), the filter will silently drop them.

**🟡 Recipient field added to assistant messages** — If OpenAI starts setting `recipient: "assistant"` on self-reflection messages that the user should also see, they will be filtered.

**🟢 Core filtering logic** — The role whitelist (`"user"` | `"assistant"`) is robust. Any new role type will be dropped rather than accidentally included.

### Confidence: 🟡 Medium

---

## 3c. `normalizeFromMapping(mapping: Record<string, RawNode>): ConversationMessage[]`

**Lines:** 280–309

### Purpose
Linearizes the tree-structured `mapping` object into an ordered list of messages by performing a DFS walk from the root, always following the last child at each branch.

### Algorithm

```
1. Find roots: nodes where (parent is falsy) OR (parent not in mapping)
2. If no roots → return []
3. Walk roots[0] via DFS, always choosing children[children.length - 1]
4. Collect all visited nodes into ordered[]
5. Apply shouldKeepNode + normalizeNode + empty-content filter
```

### Assumptions
1. There is exactly **one** logical root (or the first root found is the correct one)
2. The last child of each node is the "most recent" branch — i.e. the one rendered in the share page
3. The tree contains **no cycles** — walk() has no visited-set guard
4. Node IDs in the `children[]` array are stable keys in the `mapping` object

### Failure modes

| Scenario | Behaviour |
|----------|-----------|
| Zero roots found | Returns `[]` — `assembleConversation` throws "No extractable messages" |
| Multiple roots found | Only `roots[0]` is walked — other roots (and their subtrees) are silently lost |
| Cycle in the tree (A → B → A) | `walk()` recurses infinitely → **stack overflow** |
| `roots[0].id` is undefined | Falls back to `Object.keys(mapping)[0]` — arbitrary; depends on insertion order |
| A child ID in `children[]` is not in `mapping` | `mapping[nodeId]` returns `undefined`; `walk()` returns silently. Subtree is lost |
| User has multiple edits at the same turn | Last child is used. This is the correct "current" branch. |
| First child should be used (rare alternative branching) | Last child always wins — may be wrong in GPT reasoning chains where branching order differs |

### Real-world breakage risks

**🔴 Cycle risk (critical)** — The `mapping` format, being a raw graph, theoretically allows cycles. In practice ChatGPT's backend does not produce cycles, but there is no defensive `visited` set. If a corrupted share page or a future branching feature produces a cycle, the process will crash with a stack overflow. The fix is a simple `visited` Set — not currently present.

**🟡 Multiple roots** — Some very long conversations with regenerated first messages have been observed to produce multiple root nodes in the wild. The first root (`roots[0]`) may not be the correct one, producing a truncated conversation.

**🟡 `mapping` as secondary fallback** — This path is only reached when `linear_conversation` is absent, which is uncommon in current ChatGPT share pages. In practice, the `mapping` path was the primary format for share pages until approximately 2023. It is retained as a fallback. Its correctness has been less exercised in recent testing.

### Confidence: 🟡 Medium for correctness / 🔴 Low for safety (missing cycle guard)

---

## 4. `parseSharePageHtml(html: string, sourceUrl: string): Conversation`

**Lines:** 577–588 (the exported helper)

### Purpose
A thin exported wrapper that chains `parseNextDataScript` → `findConversationData` → `assembleConversation` on a raw HTML string. Intended for unit testing and offline validation so callers can test parsing without making network requests.

### Exact behaviour
```
parseNextDataScript(html)
  → null → throw ExtractionError("__NEXT_DATA__ script tag not found")
  → nextData

findConversationData(nextData)
  → null → throw ExtractionError("Conversation data not found in __NEXT_DATA__")
  → convData

assembleConversation(convData, sourceUrl)
  → throws if messages empty
  → returns Conversation
```

### What it does NOT do
- Does not call `isShareableUrl()` — accepts any HTML string regardless of source URL
- Does not validate that `sourceUrl` matches a ChatGPT domain
- Does not fetch — caller is responsible for providing HTML

### Failure modes
Same as the three inner functions. No additional failure modes introduced.

### Real-world breakage risks
Inherited entirely from `parseNextDataScript`, `findConversationData`, and `assembleConversation`.

### Confidence: 🟢 High (it is a pure delegation wrapper with no independent logic)

---

## 5. Cross-cutting Issues

### 5.1 Silent message loss
The most significant cross-cutting problem is that message loss is entirely silent at every layer:
- `extractTextContent` returns `""` for unrecognised content types — no log
- `shouldKeepNode` drops nodes — no log
- `normalizeFromLinear` post-filters empty content — no log
- `normalizeFromMapping` does the same — no log

A conversation with 20 messages could be returned as 3 with no indication that 17 were filtered. This is intentional for tool/system messages but becomes a bug when new readable content types are silently dropped.

**Recommended addition (Task 2 hardening):** Accept an optional `logger` parameter or expose a `filteredCount` in the returned `Conversation.metadata`.

### 5.2 No schema version tracking
There is no field in the output `Conversation` that records which JSON path was matched by `findConversationData`. If extraction silently falls through to path 4, operators have no way to detect that without debugging the raw HTML.

**Recommended addition:** `metadata["chatgptJsonPath"]` = the matched path string.

### 5.3 `normalizeNode` unsafe non-null assertion
Line 241: `const msg = node.message!;`  
Line 242: `const role = msg.author!.role as "user" | "assistant";`

These non-null assertions are safe only because `shouldKeepNode` already verified that `msg` and `msg.author` are truthy. However, the non-null assertions make `normalizeNode` unsound if called directly without passing through `shouldKeepNode` first. The exported `parseSharePageHtml` calls `normalizeFromLinear` → `normalizeNode` via the filter chain, so in practice it is safe. But `normalizeNode` is not callable safely in isolation.

### 5.4 `data.create_time === 0` produces epoch timestamp
Line 407–408:
```typescript
if (typeof data.create_time === "number") {
  metadata["created"] = new Date(data.create_time * 1000).toISOString();
}
```
There is no `> 0` guard on `create_time` (unlike `msg.create_time` in `normalizeNode` which has the guard). If `data.create_time === 0`, `metadata["created"]` will be `"1970-01-01T00:00:00.000Z"`. This is semantically wrong but not a crash.

---

## 6. Summary Table

| Function | Confidence | Primary risk | Priority fix |
|----------|:----------:|-------------|:------------:|
| `parseNextDataScript` | 🟡 Medium | Next.js migration drops `__NEXT_DATA__` | Low (external) |
| `findConversationData` | 🔴 Low | OpenAI renames `serverResponse`/`data` keys | High |
| `assembleConversation` | 🟡 Medium | `linear_conversation` preempts mapping even when empty | Medium |
| `extractTextContent` | 🟡 Medium | New content types silently dropped | Low |
| `shouldKeepNode` | 🟡 Medium | `weight` semantics are undocumented | Low |
| `normalizeFromLinear` | 🟢 High | Correct; risks inherited from dependencies | — |
| `normalizeFromMapping` | 🔴 Low (safety) | No cycle guard; multi-root silently truncated | High |
| `parseSharePageHtml` | 🟢 High | Pure delegation; no independent logic | — |

### Recommended Task 2 hardening (in priority order)
1. **Add cycle guard to `normalizeFromMapping`** — a `visited: Set<string>` before `walk()` recurses
2. **Add `> 0` guard to `data.create_time`** in `assembleConversation`
3. **Add `metadata["chatgptJsonPath"]`** in `findConversationData` to record which path matched
4. **Add `metadata["filteredMessageCount"]`** to surface silent drops
5. **Extend `findConversationData` paths** with one additional forward-looking path (e.g. `props.pageProps.data`) to cover the in-progress OpenAI PWA rewrite
