"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import PreviewSidebar from "@/components/PreviewSidebar";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { mockDocuments, type ConversationDocument } from "@/lib/mock-data";
import { RefreshCw, Shield, ChevronDown, FileText } from "lucide-react";

// ── Content filter helpers ─────────────────────────────────────────────────────

/**
 * extractCodeBlocks — "Show code only" mode.
 * Walks the markdown and collects fenced code blocks, preserving the nearest
 * preceding H2 or H3 as a section header so the reader knows context.
 */
function extractCodeBlocks(markdown: string): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let lastHeader = "";
  let inBlock = false;
  let blockBuffer: string[] = [];
  let headerEmitted = false;

  for (const line of lines) {
    if (!inBlock && (line.startsWith("## ") || line.startsWith("### "))) {
      lastHeader = line;
      headerEmitted = false;
      continue;
    }
    if (!inBlock && line.startsWith("```")) {
      inBlock = true;
      blockBuffer = [line];
      continue;
    }
    if (inBlock) {
      blockBuffer.push(line);
      if (line.startsWith("```")) {
        inBlock = false;
        if (lastHeader && !headerEmitted) {
          output.push(lastHeader, "");
          headerEmitted = true;
        }
        output.push(...blockBuffer, "");
        blockBuffer = [];
      }
    }
  }

  return output.length > 0
    ? output.join("\n")
    : "*No code blocks found in this document.*";
}

/**
 * applyFilters — compute the content string shown to MarkdownRenderer.
 *
 * hidePrompts:    The current mock `renderedMarkdown` is already AI-only output
 *                 (no user-prompt sections). This filter will take effect once
 *                 real extraction is wired — for now it is a semantic no-op.
 *
 * showCodeOnly:   Strips everything except fenced code blocks + their nearest
 *                 section header. Works on all three mock documents today.
 *
 * systemMessages: Currently a no-op on `renderedMarkdown` (system-prompt turns
 *                 are not embedded). Will work once messages[] are rendered inline.
 */
function applyFilters(
  markdown: string,
  { hidePrompts, showCodeOnly }: { hidePrompts: boolean; showCodeOnly: boolean }
): string {
  let content = markdown;
  if (showCodeOnly) content = extractCodeBlocks(content);
  // hidePrompts and systemMessages act on the messages[] view, not renderedMarkdown,
  // so they are wired but are currently no-ops on the mock data.
  void hidePrompts;
  return content;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PreviewPage() {
  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const [showDocSwitcher, setShowDocSwitcher] = useState(false);

  // Filter state — lifted from PreviewSidebar so PreviewPage controls content
  const [hidePrompts, setHidePrompts] = useState(false);
  const [showCodeOnly, setShowCodeOnly] = useState(false);
  const [systemMessages, setSystemMessages] = useState(true);

  // Quick export state — lifted here so we can include filteredContent in body
  const [isExporting, setIsExporting] = useState(false);

  const activeDoc: ConversationDocument = mockDocuments[activeDocIndex];

  // Persist the active document ID to sessionStorage whenever it changes.
  // The export page reads this so it always exports the document the user is
  // currently viewing, not the hardcoded "doc-001".
  useEffect(() => {
    try {
      sessionStorage.setItem("chat2pdf_active_doc_id", activeDoc.id);
      // Also store the title for display on the export page
      sessionStorage.setItem("chat2pdf_active_doc_title", activeDoc.title);
    } catch {
      // sessionStorage unavailable (SSR, private browsing) — degrade silently
    }
  }, [activeDoc.id, activeDoc.title]);

  // Compute the filtered content shown to MarkdownRenderer.
  // Re-computed synchronously on every render — cheap for markdown strings.
  const filteredContent = applyFilters(activeDoc.renderedMarkdown, {
    hidePrompts,
    showCodeOnly,
  });

  // Persist filtered content to sessionStorage so the export page can use it
  // when active filters are on, ensuring What-You-See === What-You-Export.
  useEffect(() => {
    try {
      sessionStorage.setItem("chat2pdf_filtered_content", filteredContent);
      sessionStorage.setItem(
        "chat2pdf_filters_active",
        String(hidePrompts || showCodeOnly || !systemMessages)
      );
    } catch {
      // degrade silently
    }
  }, [filteredContent, hidePrompts, showCodeOnly, systemMessages]);

  const handleQuickExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const body: Record<string, unknown> = {
        documentId: activeDoc.id,
        options: {
          fontSize: 12,
          margins: "standard",
          orientation: "portrait",
          includeLogo: true,
        },
      };

      // If any filter is active, send the filtered markdown directly so the
      // PDF contains exactly what the user sees in the preview.
      if (hidePrompts || showCodeOnly || !systemMessages) {
        body.content = filteredContent;
      }

      const response = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        response.headers.get("Content-Disposition")?.split("filename=")?.[1]?.replace(/"/g, "") ||
        `${activeDoc.title.slice(0, 40).toLowerCase().replace(/\s+/g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Quick export failed:", error);
    } finally {
      setIsExporting(false);
    }
  }, [activeDoc, filteredContent, hidePrompts, showCodeOnly, systemMessages]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header showExport />
      <div className="flex flex-1 overflow-hidden">
        {/* Document Selector Bar */}
        <div className="absolute left-72 right-0 top-14 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-2">
          <div className="flex items-center gap-3">
            <FileText className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-900">{activeDoc.title}</span>
            <button
              id="btn-doc-switcher"
              onClick={() => setShowDocSwitcher(!showDocSwitcher)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          {showDocSwitcher && (
            <div className="absolute left-16 top-full mt-1 w-80 rounded-lg border border-gray-200 bg-white shadow-lg">
              <div className="p-2">
                {mockDocuments.map((doc, idx) => (
                  <button
                    key={doc.id}
                    id={`doc-switcher-${doc.id}`}
                    onClick={() => {
                      setActiveDocIndex(idx);
                      setShowDocSwitcher(false);
                      // Reset filters when switching documents
                      setHidePrompts(false);
                      setShowCodeOnly(false);
                      setSystemMessages(true);
                    }}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors ${
                      activeDocIndex === idx
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{doc.title}</p>
                      <p className="text-xs text-gray-500">
                        {doc.model} • {doc.metadata.wordCount}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
              {activeDoc.provider.charAt(0).toUpperCase() + activeDoc.provider.slice(1)}
            </span>
            <span>{activeDoc.messages.length} messages</span>
          </div>
        </div>

        {/* Sidebar — fully controlled: filter state + handlers passed as props */}
        <PreviewSidebar
          document={activeDoc}
          hidePrompts={hidePrompts}
          showCodeOnly={showCodeOnly}
          systemMessages={systemMessages}
          onHidePromptsChange={setHidePrompts}
          onShowCodeOnlyChange={setShowCodeOnly}
          onSystemMessagesChange={setSystemMessages}
          onQuickExport={handleQuickExport}
          isExporting={isExporting}
        />

        {/* Main content area — renders the FILTERED markdown, not the raw doc */}
        <main className="flex-1 overflow-y-auto bg-white pt-14">
          <div className="mx-auto max-w-3xl px-8 py-12">
            {/* Document Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold leading-tight text-gray-900">
                {activeDoc.title}
              </h1>
              <p className="mt-2 text-sm text-gray-500">{activeDoc.description}</p>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-500">
                <div className="flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Revision {activeDoc.metadata.revision}</span>
                </div>
                <span className="text-gray-300">•</span>
                <div className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  <span>System Verified</span>
                </div>
                <span className="text-gray-300">•</span>
                <span>{activeDoc.metadata.wordCount}</span>
                <span className="text-gray-300">•</span>
                <span>Created: {activeDoc.metadata.created}</span>
              </div>
            </div>

            {/* Filtered content — what you see IS what you export */}
            <MarkdownRenderer content={filteredContent} />

            {/* Document Footer */}
            <div className="mt-12 border-t border-gray-200 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-gray-500">
                <div>
                  Source conversation from{" "}
                  <strong className="font-semibold text-gray-700">{activeDoc.model}</strong>{" "}
                  via{" "}
                  {activeDoc.provider === "chatgpt"
                    ? "OpenAI API"
                    : activeDoc.provider === "claude"
                    ? "Anthropic API"
                    : "Google DeepMind"}
                </div>
                <a
                  href={activeDoc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 hover:text-blue-700 underline"
                >
                  View original conversation →
                </a>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
