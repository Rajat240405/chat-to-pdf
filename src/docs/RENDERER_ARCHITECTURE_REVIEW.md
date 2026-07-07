# PromptPress — Renderer Architecture Review

**Date:** 2026-06-24  
**Scope:** `src/components/MarkdownRenderer.tsx` vs `src/lib/pdf-generator.ts → customRenderMarkdown()`  
**Verdict:** → See Section 7

---

## 1. Current Preview Rendering Flow

**File:** `src/components/MarkdownRenderer.tsx` (175 lines)  
**Runtime:** Client-side (browser) — `"use client"` directive

```
content: string (raw markdown)
    │
    ▼
<ReactMarkdown remarkPlugins={[remarkGfm]}>
    │
    ├─ remark-parse         → Markdown AST (mdast)
    ├─ remark-gfm           → Extends AST: tables, strikethrough, autolinks, task lists, footnotes
    ├─ remark-rehype        → Converts mdast → HTML AST (hast)
    └─ rehype-react         → Converts hast → React elements
         │
         └─ Custom component overrides (JSX):
              ├─ code       → Dark pre block + copy button (NO syntax highlighting)
              ├─ table      → overflow-x scroll wrapper
              ├─ blockquote → blue left border + tinted bg
              ├─ h1         → 3xl bold, border-bottom
              ├─ h2         → xl semibold, hover anchor (#)
              ├─ h3         → base semibold
              ├─ ul         → disc list, blue markers
              ├─ ol         → decimal list, blue markers
              ├─ li         → sm text, relaxed leading
              ├─ p          → 15px, relaxed leading
              ├─ a          → blue underline, external → new tab
              └─ hr         → dashed border

    ▼
React DOM (rendered to screen)
```

**Key facts:**
- Uses the `unified` ecosystem internally (react-markdown is a thin wrapper)
- AST-based: handles all edge cases remark can handle
- H4, H5, H6 fall through to react-markdown's default `<h4>/<h5>/<h6>` with no custom styling
- No `rehype-highlight` — code blocks render as unstyled plain text in a dark `<pre>`
- Language display names are hardcoded to document-specific filenames (e.g., `typescript → "merge.ts"`)

---

## 2. Current PDF Rendering Flow

**File:** `src/lib/pdf-generator.ts → customRenderMarkdown()` (lines 253–371, ~120 lines)  
**Runtime:** Server-side (Node.js API route)

```
content: string (raw markdown)
    │
    ▼
customRenderMarkdown(md)
    │
    ├─ md.split("\n")             → array of raw lines
    │
    ├─ Line-by-line while loop:
    │    ├─ Code block detection  → trimmedLine.startsWith("```")
    │    │    └─ Accumulate codeLines[] until closing ```
    │    │         └─ highlightCode(codeLines, lang) via highlight.js
    │    │              └─ emit <div.code-block-wrapper><pre><code.hljs>...</code></pre></div>
    │    │
    │    ├─ Table detection       → trimmedLine starts AND ends with "|"
    │    │    └─ Separator row regex: /^\|[\s\-:|]+\|$/
    │    │         └─ emit <div.table-wrapper><table><thead>/<tbody></table></div>
    │    │
    │    ├─ H1–H4 detection       → startsWith("# "/"## "/"### "/"#### ")
    │    │    └─ emit <h1>–<h4> with processInline()
    │    │
    │    ├─ HR detection          → /^(-{3,}|\*{3,}|_{3,})$/
    │    │    └─ emit <hr />
    │    │
    │    ├─ Blockquote detection  → trimmedLine.startsWith("> ")
    │    │    └─ Loop while next line also starts with "> "
    │    │         └─ emit <blockquote><p>...</p></blockquote>
    │    │
    │    ├─ Unordered list        → trimmedLine.match(/^[\s]*[-*] /)
    │    │    └─ Loop accumulating <li> items
    │    │         └─ emit <ul>...</ul>
    │    │
    │    ├─ Ordered list          → trimmedLine.match(/^\d+\.\s/)
    │    │    └─ Loop accumulating <li> items
    │    │         └─ emit <ol>...</ol>
    │    │
    │    ├─ Empty line            → skipped (no <br>)
    │    │
    │    └─ Paragraph fallback    → accumulate lines until blank/heading/code
    │         └─ emit <p>line1<br />line2</p>
    │
    ├─ processInline(lineText):
    │    ├─ escapeHtml()          → &amp; &lt; &gt; &quot; &#039;
    │    ├─ **(bold)**            → <strong>
    │    ├─ *(italic)*            → <em>
    │    ├─ `inline code`         → <code class="inline-code">
    │    └─ [text](url)           → <a href>
    │
    ▼
HTML string
    │
    ▼
buildPdfTemplate() → Full HTML5 document with embedded PDF_CSS
    │
    ▼
Puppeteer → A4 PDF binary
```

---

## 3. Feature Differences (Side-by-Side)

| Markdown Feature | Preview Renderer | PDF Renderer | Notes |
|-----------------|-----------------|--------------|-------|
| **H1** | ✅ Custom JSX | ✅ Custom HTML | Different visual sizes |
| **H2** | ✅ Custom JSX + hover anchor | ✅ Custom HTML | Anchor hover not in PDF (irrelevant for print) |
| **H3** | ✅ Custom JSX | ✅ Custom HTML | — |
| **H4** | ⚠️ react-markdown default (unstyled) | ✅ Custom HTML | PDF styled, preview unstyled |
| **H5 / H6** | ⚠️ react-markdown default | ❌ Falls to `<p>` | Both unstyled; PDF wrong element |
| **Code blocks** | ✅ Dark pre + copy button | ✅ Dark pre + filename | — |
| **Syntax highlighting** | ❌ None | ✅ highlight.js | **Biggest visual gap** |
| **Code copy button** | ✅ Interactive clipboard | ❌ N/A (print) | Expected difference |
| **Tables** | ✅ GFM via remark-gfm | ✅ Custom pipe parser | Different parsers, divergence risk |
| **Blockquotes** | ✅ AST-aware, multi-line | ⚠️ Line-by-line, `"> "` only | See bug §4.3 |
| **Unordered lists** | ✅ Full nesting support | ⚠️ Flat only | See bug §4.4 |
| **Ordered lists** | ✅ Full nesting support | ⚠️ Flat only | See bug §4.4 |
| **Bold / Italic** | ✅ AST-parsed | ⚠️ Regex-based | See overlap bug §4.1 |
| **Strikethrough (~~)** | ✅ remark-gfm | ❌ Missing entirely | Silently renders as `~~text~~` |
| **Inline code** | ✅ | ✅ via processInline() | — |
| **Links** | ✅ External → new tab | ✅ Shows URL in parens (print) | Expected difference |
| **Autolinks** | ✅ remark-gfm | ❌ Not handled | Raw URL in PDF |
| **Images (![alt](url))** | ✅ Default `<img>` | ❌ Falls to `<p>` | Images silently disappear in PDF |
| **Task lists (- [x])** | ✅ remark-gfm | ❌ Rendered as `[ ]`/`[x]` text | Checkbox notation shown raw |
| **Horizontal rules** | ✅ Dashed style | ✅ `<hr />` | Slightly different visual |
| **Footnotes** | ❌ Not enabled | ❌ Not handled | Neither supports |
| **Definition lists** | ❌ Not enabled | ❌ Not handled | Neither supports |
| **HTML passthrough** | ❌ Sanitized (react-markdown default) | ❌ Escaped via escapeHtml() | Consistent: both safe |

---

## 4. Rendering Inconsistencies & Active Bugs

### 4.1 — Bold/Italic Regex Collision in PDF

**Severity: High**

`processInline()` applies bold before italic:
```javascript
t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
t = t.replace(/\*(.+?)\*/g, "<em>$1</em>");
```

After the bold pass, the `**` delimiters are replaced with HTML tags. But if a line contains `***bold italic***`, the bold regex partially matches, leaving a dangling `*` that the italic regex then wraps incorrectly.

**Input:** `***critical warning***`  
**PDF output:** `<em><strong>critical warning</strong></em>` (accidental — depends on regex engine greed)  
**Preview output:** `<strong><em>critical warning</em></strong>` (correct, AST-based)

The two renderers may produce different nesting for combined bold+italic.

### 4.2 — Strikethrough Silently Missing in PDF

**Severity: High**

`processInline()` has zero handling for `~~text~~`. The mock data in `doc1Markdown` doesn't use strikethrough, so this hasn't been caught — but any real conversation using `~~deprecated~~` will render the literal `~~deprecated~~` text in the PDF.

**Preview:** `<del>deprecated</del>` ✅  
**PDF:** `~~deprecated~~` (raw text) ❌

### 4.3 — Blockquote Requires Space After `>`

**Severity: Medium**

PDF detection: `trimmedLine.startsWith("> ")` — note the required space.

```
> This works      → ✅ detected as blockquote
>This breaks      → ❌ falls through to paragraph
```

react-markdown/remark correctly handles both `>text` and `> text` per CommonMark spec.

Also, if a blockquote contains a blank line (multi-paragraph blockquote), the PDF renderer terminates the blockquote at the blank line. Preview handles this correctly.

### 4.4 — Nested Lists Flattened in PDF

**Severity: High**

The PDF list accumulator strips all leading whitespace:
```javascript
const l = lines[i].trim();  // ← loses indentation
items.push(`<li>${processInline(l.replace(/^[\s]*[-*] /, ""))}</li>`);
```

**Input:**
```
- Item A
  - Nested B
    - Deep C
- Item D
```

**Preview output:** Proper `<ul><li>Item A<ul><li>Nested B<ul><li>Deep C</li></ul></li></ul></li><li>Item D</li></ul>` ✅  
**PDF output:** Flat `<ul><li>Item A</li><li>Nested B</li><li>Deep C</li><li>Item D</li></ul>` — all nesting lost ❌

This is particularly bad for the mock data's **numbered step lists** which use nested sub-points.

### 4.5 — Table Column Alignment Ignored in PDF

**Severity: Low**

GFM table alignment syntax (`:---`, `:---:`, `---:`) is correctly interpreted by remark-gfm and renders as `text-align` attributes. The PDF parser's separator row regex `/^\|[\s\-:|]+\|$/` detects and skips the separator line but **never reads the alignment direction**. All columns render left-aligned in PDF regardless of markdown specification.

### 4.6 — Paragraph Line-Break Behaviour Differs

**Severity: Medium**

PDF paragraph fallback joins continuation lines with `<br />`:
```javascript
html += `<p>${para.map(processInline).join("<br />")}</p>\n`;
```

react-markdown treats a single newline as a soft break (space) by default. So a paragraph that wraps across two source lines renders differently:

**Input:**
```
This is line one
and this continues.
```
**Preview:** `<p>This is line one and this continues.</p>` (single space join)  
**PDF:** `<p>This is line one<br />and this continues.</p>` (explicit break)

---

## 5. Markdown Features: Support Matrix

### Supported by Preview Only (❌ in PDF)

1. Strikethrough `~~text~~`
2. Autolinks `https://example.com` (bare URLs)
3. GFM task list checkboxes `- [x] done`
4. Images `![alt](url)` → rendered as `<img>`
5. Multi-paragraph blockquotes (blank line inside `>`)
6. Nested lists (2+ levels deep)
7. Table column alignment (`:---`, `---:`)
8. H5, H6 headings (PDF falls to `<p>`)

### Supported by PDF Only (❌ in Preview)

1. **Syntax highlighting** — `highlight.js` coloring for all code blocks
2. H4 headings with styled HTML (`<h4>`) — Preview uses unstyled react-markdown default
3. Print-safe link expansion — URLs shown in parentheses for paper readability

### Supported by Neither

- Footnotes
- Definition lists
- Math/KaTeX
- Mermaid diagrams
- Emoji shortcodes (`:smile:`)
- Raw HTML passthrough

---

## 6. Risks of Maintaining Two Renderers

### Risk 1: Silent Quality Regression (Critical)
Every time new markdown content is written (e.g., a new mock document, a real conversation that uses `~~strikethrough~~`, nested lists, or images), the PDF renderer will silently produce incorrect output. Because the two renderers run independently, bugs in `customRenderMarkdown()` won't surface during preview testing.

### Risk 2: Double Maintenance Burden (High)
Any new markdown feature (footnotes, diagrams, custom admonitions) must be implemented **twice** — once as a react-markdown component override and once as a regex/string-manipulation addition to `customRenderMarkdown()`. The risk of asymmetric implementation is near-certain over time.

### Risk 3: "What You See ≠ What You Get" (High)
The most fundamental promise of a document export tool is fidelity between preview and output. Currently:
- Code blocks look different (no highlighting in preview)
- Nested lists collapse in PDF
- Strikethrough content is garbled in PDF
- Blockquotes may differ

Users previewing a complex document will receive a PDF that doesn't match what they approved.

### Risk 4: Parser Correctness Ceiling (High)
`customRenderMarkdown()` is a ~120-line hand-rolled line parser. CommonMark specification has 652 test cases covering edge cases like:
- Lazy continuation lines in blockquotes
- Setext-style headings (`===` underline)
- Link reference definitions
- Escaped characters (`\*` not bold)
- HTML entity rendering

The custom parser handles none of these. As real user content flows in (Phase 5+), parse failures will increase.

### Risk 5: CSS Drift Between Rendering Contexts (Medium)
`globals.css` styles the `.markdown-content` class for preview. `PDF_CSS` (inline string in `pdf-generator.ts`) styles the same elements for print. These two stylesheets are manually synchronized. Any visual update (spacing, font sizes, border colors) must be applied in both places. This has already drifted:
- Preview `blockquote` uses `bg-blue-50/50` + italic
- PDF `blockquote` uses `#eff6ff` background + `#1e40af` color, no italic class

### Risk 6: Testing Surface Doubles (Medium)
Any QA pass must test both the `/preview` page and the downloaded PDF. There is no way to write a single rendering test that covers both outputs. As the feature set grows, this doubles the manual testing cost.

---

## 7. Recommendation: **Option B — Unified Pipeline**

> **Verdict: Adopt a shared markdown-to-HTML pipeline for both preview and PDF.**

The custom line parser should be replaced. The `unified`/`remark`/`rehype` ecosystem (which `react-markdown` already uses internally) is the correct foundation for both rendering contexts.

### Why Not Option A (Keep Two Renderers)

Option A is only viable if:
- The PDF and preview are intentionally different products (they are not — they must match)
- The markdown feature set is permanently frozen (it won't be — real user content is unlimited)
- There is dedicated engineering bandwidth to maintain two parsers (a startup SaaS doesn't have this)

None of these conditions hold. Option A guarantees an accumulating quality deficit.

---

## 8. Recommended Architecture: Shared `unified` Pipeline

### Core Concept

```
markdown string
      │
      ▼
unified()
  .use(remarkParse)         ← Same CommonMark + extensions for BOTH targets
  .use(remarkGfm)           ← Tables, strikethrough, autolinks, task lists
  .use(remarkRehype)        ← markdown AST → HTML AST
  .use(rehypeHighlight)     ← Syntax highlighting via highlight.js (BOTH targets)
      │
      ├─ For Preview:
      │    .use(rehypeReact, { createElement, components })
      │    → React element tree → rendered to DOM
      │    (This is exactly what react-markdown already does internally)
      │
      └─ For PDF:
           .use(rehypeStringify)
           → HTML string → injected into buildPdfTemplate()
           → Puppeteer → PDF
```

### Why This Works

1. **Single parse step** — both renderers share the exact same AST, so the same input always produces structurally identical output
2. **`rehype-highlight` replaces both** the missing preview highlighting AND the custom `highlightCode()` in pdf-generator
3. **`react-markdown` already uses this pipeline** — the preview change is adding one plugin (`rehype-highlight`), not a rewrite
4. **`rehypeStringify`** is purpose-built for generating HTML strings on the server — it replaces `customRenderMarkdown()` entirely
5. **All packages are already in the unified ecosystem** — no new dependency vendors, only additive plugins

### New Dependencies Required

| Package | Purpose | Size |
|---------|---------|------|
| `rehype-highlight` | Syntax highlighting plugin for rehype | ~2KB (uses existing `highlight.js` dep) |
| `rehype-stringify` | HTML string serializer (server-side) | ~5KB |
| `unified` | Core processor (already a transitive dep via react-markdown) | ~0KB new |

**`highlight.js` is already in `package.json`** — `rehype-highlight` simply uses it as a peer dependency. Net new bundle impact is minimal.

---

## 9. Migration Plan

### Step 1 — Add Syntax Highlighting to Preview (Low Risk, High Value)

**Files changed:** `MarkdownRenderer.tsx`, `package.json`  
**Risk:** Very low — additive only, no behavior removed

```
npm install rehype-highlight
```

In `MarkdownRenderer.tsx`, add `rehypePlugins={[rehypeHighlight]}` to `<ReactMarkdown>`. The `highlight.js` CSS classes (`hljs-keyword`, etc.) are already defined in `globals.css` from the PDF styles — or import a highlight.js theme stylesheet.

This is a **2-line change** that immediately fixes the #1 visual gap (no preview syntax highlighting) and proves the unified approach works.

**Validation:** Preview code blocks should now match PDF syntax colors.

---

### Step 2 — Extract Shared Pipeline Utility (Server-side)

**Files changed:** `src/lib/markdown-to-html.ts` (new file)  
**Risk:** Low — additive, existing code unchanged

Create `src/lib/markdown-to-html.ts`:

```typescript
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";

export async function markdownToHtml(content: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeHighlight)
    .use(rehypeStringify)
    .process(content);
  return String(result);
}
```

This function produces the same HTML that `react-markdown` + `rehype-highlight` would render in the browser — but as a string, usable by Puppeteer.

---

### Step 3 — Replace `customRenderMarkdown()` in `pdf-generator.ts`

**Files changed:** `pdf-generator.ts`  
**Risk:** Medium — replaces core PDF logic, requires PDF output testing

Replace the call on line 62:
```typescript
// Before:
const htmlBody = renderMarkdownToHtml(content);  // calls customRenderMarkdown()

// After:
const htmlBody = await markdownToHtml(content);  // uses unified pipeline
```

Make `generatePdf()` async-aware (it already is). Remove `customRenderMarkdown()`, `processInline()`, `escapeHtml()`, `getFileName()`, `highlightCode()`, and the entire 120-line custom parser. Keep `buildPdfTemplate()` and the Puppeteer launch code unchanged.

**Validation:** Download a PDF and compare against the before state:
- Code blocks should have identical highlight colors (same `hljs-*` classes)
- Nested lists should now render correctly
- Strikethrough, task lists, images should now work
- Tables should respect column alignment

---

### Step 4 — Unify CSS (Housekeeping)

**Files changed:** `globals.css`, `pdf-generator.ts` (PDF_CSS string)  
**Risk:** Low — cosmetic only

After Step 3, both renderers produce HTML with the same class names. Audit and reconcile the two stylesheets:
- `globals.css` → `.markdown-content { ... }` (screen)
- `PDF_CSS` in `pdf-generator.ts` (print)

Extract shared variables (colors, font sizes, border styles) into comments or constants so future visual changes are applied once and documented clearly. The print stylesheet will still need print-specific rules (`@page`, `page-break-inside`, `orphans/widows`) — these are intentionally different.

---

### Migration Risk Summary

| Step | Risk | Effort | Reversible? |
|------|------|--------|-------------|
| Step 1: Add rehype-highlight to preview | Very Low | 2 lines | Yes |
| Step 2: Create markdownToHtml() utility | Low | ~20 lines | Yes |
| Step 3: Replace customRenderMarkdown() | Medium | Delete ~120 lines | Yes (keep old fn commented) |
| Step 4: CSS unification | Low | Audit pass | Yes |

Total estimated effort: **1 focused engineering session (~4 hours)** including testing.

---

## Summary

| | Option A (Two Renderers) | Option B (Unified Pipeline) |
|--|--------------------------|----------------------------|
| Preview/PDF visual parity | ❌ Growing gap | ✅ Guaranteed same AST |
| Syntax highlighting | 2 separate implementations | ✅ One plugin, both targets |
| New markdown features | Must implement twice | ✅ Once, works everywhere |
| Parser correctness | ❌ 120-line hand-rolled | ✅ CommonMark-compliant |
| Maintenance surface | 2× | 1× |
| Migration cost | None now | ~4 hours |
| Long-term cost | High (compounding) | Low |

**Recommendation: Implement Option B, beginning with Step 1 (rehype-highlight in preview).**  
Step 1 alone delivers immediate user value (syntax highlighting in preview) with zero risk, and proves the unified approach before touching the PDF pipeline.
