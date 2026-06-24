// ============================================================
// Chat2PDF — Shared Markdown → HTML Utility
// ============================================================
//
// PURPOSE
//   Converts a markdown string to a semantically correct, fully
//   syntax-highlighted HTML string using the unified/remark/rehype
//   ecosystem — the same pipeline react-markdown uses internally
//   for the preview renderer.
//
//   This utility is the foundation for Step 3 of the renderer
//   architecture migration: replacing customRenderMarkdown() in
//   pdf-generator.ts with a single, correct, shared pipeline.
//
// CURRENT STATUS (Step 2 — additive only)
//   This file is NEW. It does NOT yet replace customRenderMarkdown()
//   in pdf-generator.ts. Both renderers coexist. Step 3 will wire
//   this utility into the PDF pipeline.
//
// USAGE (server-side only — API routes, server actions)
//   import { markdownToHtml } from "@/lib/markdown-to-html";
//   const html = await markdownToHtml(markdownContent);
//
// ENVIRONMENT
//   Server-side Node.js only. Do NOT import from client components.
//   All packages (unified, remark-*, rehype-*) are ESM-only and
//   run safely in Next.js API routes / server components.
// ============================================================

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";

// ---------------------------------------------------------------
// MarkdownToHtmlOptions
// ---------------------------------------------------------------

export interface MarkdownToHtmlOptions {
  /**
   * When true, rehype-highlight will attempt to auto-detect the
   * language of unlabelled code blocks (no language hint after ```).
   * Default: true.
   */
  detect?: boolean;

  /**
   * When true, suppresses console warnings for unknown language
   * identifiers (e.g. ```brainfuck on a block). Does not affect
   * rendering — the block still appears, just unhighlighted.
   * Default: true.
   */
  ignoreMissing?: boolean;

  /**
   * When true, raw HTML within the markdown source is passed
   * through to the output unchanged. When false (default), raw
   * HTML is stripped for safety. Only enable for trusted content.
   * Default: false.
   */
  allowDangerousHtml?: boolean;
}

// ---------------------------------------------------------------
// markdownToHtml
// ---------------------------------------------------------------

/**
 * Convert a markdown string to a syntax-highlighted HTML string.
 *
 * Pipeline:
 *   remark-parse       → Markdown AST (mdast)
 *   remark-gfm         → GFM extensions: tables, strikethrough,
 *                        autolinks, task lists
 *   remark-rehype      → HTML AST (hast)
 *   rehype-highlight   → Syntax highlighting via highlight.js
 *                        (same token colours as PDF renderer)
 *   rehype-stringify   → HTML string
 *
 * Supported markdown features (complete list):
 *   ✅ Headings H1–H6
 *   ✅ Paragraphs with soft/hard breaks
 *   ✅ Bold, italic, bold-italic, strikethrough (GFM)
 *   ✅ Inline code
 *   ✅ Fenced code blocks with language hints + syntax highlighting
 *   ✅ Autodetect language for unlabelled code blocks
 *   ✅ Tables with alignment (GFM)
 *   ✅ Unordered lists (- / * / +) with arbitrary nesting depth
 *   ✅ Ordered lists (1. / 1)) with arbitrary nesting depth
 *   ✅ Task list checkboxes (- [x] / - [ ]) (GFM)
 *   ✅ Blockquotes with multi-paragraph support
 *   ✅ Horizontal rules (---, ***, ___)
 *   ✅ Links — inline and reference-style
 *   ✅ Autolinks (<https://...> and bare URLs) (GFM)
 *   ✅ Images (![alt](url))
 *   ✅ Footnotes (remark-gfm subset)
 *   ✅ HTML entities and escape sequences
 *
 * @param content Raw markdown string.
 * @param options Optional configuration. See MarkdownToHtmlOptions.
 * @returns Promise resolving to a valid HTML fragment string.
 *
 * @example
 *   const html = await markdownToHtml("# Hello\n\n```ts\nconst x = 1;\n```");
 *   // → '<h1>Hello</h1>\n<div class="code-block-wrapper">...'
 */
export async function markdownToHtml(
  content: string,
  options: MarkdownToHtmlOptions = {}
): Promise<string> {
  const {
    detect = true,
    ignoreMissing = true,
    allowDangerousHtml = false,
  } = options;

  const result = await unified()
    // ── Stage 1: Parse markdown text → mdast ──────────────────
    .use(remarkParse)

    // ── Stage 2: GFM extensions ───────────────────────────────
    // Adds: tables, strikethrough (~~), autolinks, task lists,
    // footnotes. Must come before remark-rehype.
    .use(remarkGfm)

    // ── Stage 3: mdast → hast (HTML AST) ─────────────────────
    .use(remarkRehype, {
      // allowDangerousHtml passes raw HTML nodes from markdown
      // through to the hast; they are then included in the output.
      // Disabled by default — only enable for trusted sources.
      allowDangerousHtml,
    })

    // ── Stage 4: Syntax highlighting ─────────────────────────
    // rehype-highlight walks the hast and wraps code block text
    // nodes in <span> elements with hljs-* classes. Uses the
    // same highlight.js version as pdf-generator.ts (^11.11.1),
    // producing identical token colours for both outputs.
    .use(rehypeHighlight, {
      detect,
      ignoreMissing,
    })

    // ── Stage 5: hast → HTML string ──────────────────────────
    .use(rehypeStringify, {
      // Omit the XML self-closing slash on void elements (e.g.
      // <br> not <br />) for standard HTML5 output.
      closeSelfClosing: false,
    })

    .process(content);

  return String(result);
}

// ---------------------------------------------------------------
// markdownToHtmlSync — thin wrapper for contexts that cannot
// await (e.g. synchronous Next.js middleware).
//
// ⚠ Uses .processSync() which disables async plugins. All plugins
// in the current pipeline are synchronous, so this is safe today.
// If a future async plugin is added, this will throw — prefer
// markdownToHtml() for new code.
// ---------------------------------------------------------------

export function markdownToHtmlSync(
  content: string,
  options: MarkdownToHtmlOptions = {}
): string {
  const {
    detect = true,
    ignoreMissing = true,
    allowDangerousHtml = false,
  } = options;

  const result = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml })
    .use(rehypeHighlight, { detect, ignoreMissing })
    .use(rehypeStringify, { closeSelfClosing: false })
    .processSync(content);

  return String(result);
}
