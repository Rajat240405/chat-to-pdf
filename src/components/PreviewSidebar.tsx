"use client";

import Link from "next/link";

import {
  FileText,
  FileCode,
  FileType,
  Settings,
  HelpCircle,
  Copy,
  FileOutput,
  Loader2,
} from "lucide-react";
import type { ConversationDocument } from "@/lib/mock-data";
import { Switch } from "@/components/ui/switch";

// ── Props ──────────────────────────────────────────────────────────────────────
// Filter state is now CONTROLLED from the parent (PreviewPage).
// PreviewSidebar renders toggles and calls the parent's setters — it no longer
// owns this state itself. This allows PreviewPage to read filter values and
// compute the filtered content passed to MarkdownRenderer.

export interface PreviewSidebarProps {
  document: ConversationDocument;
  // Controlled filter state
  hidePrompts: boolean;
  showCodeOnly: boolean;
  systemMessages: boolean;
  onHidePromptsChange: (v: boolean) => void;
  onShowCodeOnlyChange: (v: boolean) => void;
  onSystemMessagesChange: (v: boolean) => void;
  // Quick export handler from parent (so parent can include filtered content)
  onQuickExport: () => void;
  isExporting: boolean;
}

export default function PreviewSidebar({
  document: doc,
  hidePrompts,
  showCodeOnly,
  systemMessages,
  onHidePromptsChange,
  onShowCodeOnlyChange,
  onSystemMessagesChange,
  onQuickExport,
  isExporting,
}: PreviewSidebarProps) {
  const formats = [
    { id: "pdf", label: "Portable Document (PDF)", icon: FileText },
    { id: "md", label: "Markdown (MD)", icon: FileCode },
    { id: "rtf", label: "Rich Text (RTF)", icon: FileType },
  ];

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-gray-200 bg-gray-50">
      <div className="flex-1 overflow-y-auto p-6">
        {/* Document Metadata */}
        <div className="mb-8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Document Metadata
          </h3>
          <div className="mt-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Created</span>
              <span className="text-gray-900">{doc.metadata.created}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Model</span>
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-600">
                {doc.model}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Word Count</span>
              <span className="text-gray-900">{doc.metadata.wordCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Provider</span>
              <span className="text-gray-900">{doc.metadata.provider}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Messages</span>
              <span className="text-gray-900">{doc.metadata.messageCount}</span>
            </div>
          </div>
        </div>

        {/* Export Format (display only — actual format chosen on export page) */}
        <div className="mb-8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Export Format
          </h3>
          <div className="mt-4 space-y-2">
            {formats.map((format) => {
              const Icon = format.icon;
              const isActive = format.id === "pdf";
              return (
                <div
                  key={format.id}
                  className={`flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm ${
                    isActive
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white text-gray-400"
                  }`}
                >
                  <div
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                      isActive ? "border-blue-600" : "border-gray-300"
                    }`}
                  >
                    {isActive && (
                      <div className="h-2 w-2 rounded-full bg-blue-600" />
                    )}
                  </div>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="font-medium">{format.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* View Filters — controlled by PreviewPage */}
        <div className="mb-8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            View Filters
          </h3>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Hide user prompts</span>

              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                Coming Soon
              </span>
            </div>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-gray-700">Show code only</span>
              <Switch
                checked={showCodeOnly}
                onCheckedChange={onShowCodeOnlyChange}
              />
            </label>
            <div className="flex items-center justify-between">
  <span className="text-sm text-gray-700">
    System messages
  </span>

  <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
    Coming Soon
  </span>
</div>
          </div>

          {/* Active filter indicator */}
          {(hidePrompts || showCodeOnly || !systemMessages) && (
            <p className="mt-3 text-xs text-amber-600 flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
              Code-only mode affects both preview and export.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Link
            href="/export"
            className="flex w-full items-center justify-center gap-2 rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
          >
            <FileOutput className="h-4 w-4" />
            Export Settings →
          </Link>
          <button
            id="btn-quick-export"
            onClick={onQuickExport}
            disabled={isExporting}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border border-gray-200 disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Quick Export PDF
              </>
            )}
          </button>
        </div>
      </div>

      {/* Bottom Nav */}
      <div className="border-t border-gray-200 p-4">
  <p className="text-center text-xs text-gray-400">
    PromptPress v1.0
  </p>
</div>
    </aside>
  );
}
