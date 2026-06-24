"use client";

import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Copy, Check } from "lucide-react";
import type { ReactNode, ReactElement } from "react";

interface MarkdownRendererProps {
  content: string;
}

// ---------------------------------------------------------------------------
// Map language identifiers to generic display filenames.
// These are intentionally generic (not document-specific) so they work for
// any content, not just the three hardcoded mock documents.
// ---------------------------------------------------------------------------
const languageDisplayNames: Record<string, string> = {
  typescript: "TypeScript",
  tsx:        "TSX",
  jsx:        "JSX",
  javascript: "JavaScript",
  js:         "JavaScript",
  go:         "Go",
  python:     "Python",
  py:         "Python",
  java:       "Java",
  bash:       "Shell",
  sh:         "Shell",
  sql:        "SQL",
  json:       "JSON",
  yaml:       "YAML",
  yml:        "YAML",
  css:        "CSS",
  html:       "HTML",
  rust:       "Rust",
  cpp:        "C++",
  c:          "C",
  md:         "Markdown",
};

// ---------------------------------------------------------------------------
// extractText — recursively pull plain text out of React children.
//
// This is necessary because rehype-highlight transforms code block content
// into a tree of <span> elements (React elements, not a string) at the
// rehype AST level before react-markdown's component overrides run.
// Calling String(children) on a React element returns "[object Object]",
// which would corrupt the clipboard copy. This helper traverses the tree.
// ---------------------------------------------------------------------------
function extractText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join("");
  }
  if (node && typeof node === "object" && "props" in (node as object)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    return extractText(el.props.children);
  }
  return "";
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const [copiedBlocks, setCopiedBlocks] = useState<Set<string>>(new Set());

  const handleCopy = useCallback(
    (blockId: string, text: string) => () => {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedBlocks((prev) => new Set(prev).add(blockId));
        setTimeout(() => {
          setCopiedBlocks((prev) => {
            const next = new Set(prev);
            next.delete(blockId);
            return next;
          });
        }, 2000);
      });
    },
    []
  );

  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          // detect:true auto-detects language for unlabelled fenced blocks.
          // ignoreMissing:true suppresses warnings for unknown language hints.
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
        ]}
        components={{
          // -----------------------------------------------------------------
          // code — handles both inline code and fenced code blocks.
          //
          // After rehype-highlight runs, fenced block children are React
          // element trees (spans), not strings. extractText() is used to
          // get the plain text for clipboard copy without breaking the UI.
          // -----------------------------------------------------------------
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const language = match ? match[1] : "";

            // Inline code: no language class is present.
            // rehype-highlight only processes elements that have a language-*
            // class, so inline code children remain plain strings here.
            const isInline = !className;
            if (isInline) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }

            // Fenced block: extract plain text for the copy button.
            const rawCode = extractText(children).replace(/\n$/, "");
            const blockId = `${language}-${rawCode.slice(0, 50)}`;
            const isCopied = copiedBlocks.has(blockId);
            const displayName = languageDisplayNames[language] ?? language ?? "Code";

            return (
              <div className="code-block-wrapper my-6 rounded-lg overflow-hidden border border-gray-700">
                {/* Code block header: language label + copy button */}
                <div className="code-header flex items-center justify-between bg-gray-800 px-4 py-2">
                  <span className="font-mono text-xs font-medium text-gray-300">
                    {displayName}
                  </span>
                  <button
                    onClick={handleCopy(blockId, rawCode)}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-gray-400 transition-colors hover:text-white"
                    title={isCopied ? "Copied!" : "Copy code"}
                  >
                    {isCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-green-400" />
                        <span className="text-green-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Code content — children are already highlighted spans */}
                <pre className="m-0 overflow-x-auto">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              </div>
            );
          },

          // Custom table wrapper for horizontal scroll on small screens
          table({ children }) {
            return (
              <div className="overflow-x-auto my-4 rounded-lg border border-gray-200">
                <table>{children}</table>
              </div>
            );
          },

          // Enhanced blockquote styling
          blockquote({ children }) {
            return (
              <blockquote className="my-4 border-l-4 border-blue-500 bg-blue-50/50 py-2 pl-4 pr-4 text-gray-600">
                {children}
              </blockquote>
            );
          },

          h1({ children }) {
            return (
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 mt-10 mb-5 border-b-2 border-gray-200 pb-3">
                {children}
              </h1>
            );
          },

          h2({ children, id }) {
            return (
              <h2 id={id} className="group relative text-xl font-semibold text-gray-900 mt-8 mb-4 flex items-center gap-2 cursor-pointer hover:text-blue-600 transition-colors">
                {children}
                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-500 text-base">#</span>
              </h2>
            );
          },

          h3({ children }) {
            return (
              <h3 className="text-base font-semibold text-gray-800 mt-6 mb-3">{children}</h3>
            );
          },

          h4({ children }) {
            return (
              <h4 className="text-sm font-semibold text-gray-700 mt-5 mb-2 uppercase tracking-wide">{children}</h4>
            );
          },

          ul({ children }) {
            return <ul className="my-3 ml-5 space-y-1.5 list-disc marker:text-blue-400">{children}</ul>;
          },

          ol({ children }) {
            return <ol className="my-3 ml-5 space-y-1.5 list-decimal marker:text-blue-500 font-medium">{children}</ol>;
          },

          li({ children }) {
            return <li className="text-sm leading-relaxed text-gray-700 pl-1">{children}</li>;
          },

          p({ children }) {
            return <p className="mb-4 leading-relaxed text-gray-700 text-[15px]">{children}</p>;
          },

          a({ href, children }) {
            return (
              <a
                href={href}
                target={href?.startsWith("http") ? "_blank" : undefined}
                rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
                className="text-blue-600 underline decoration-blue-300 hover:text-blue-700 hover:decoration-blue-500 transition-colors"
              >
                {children}
              </a>
            );
          },

          hr() {
            return <hr className="my-8 border-t-2 border-dashed border-gray-200" />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
