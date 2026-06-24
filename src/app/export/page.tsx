"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  FileText,
  FileCode,
  FileType,
  FileSpreadsheet,
  X,
  Download,
  Monitor,
  RotateCcw,
  HelpCircle,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { InvalidURLError, PrivateConversationError, ExtractionFailureError } from "@/components/ErrorStates";
import type { PdfGenerationOptions } from "@/lib/pdf-generator";

export default function ExportPage() {
  const [selectedFormat, setSelectedFormat] = useState("pdf");
  const [fontSize, setFontSize] = useState(12);
  const [margin, setMargin] = useState<"standard" | "narrow">("standard");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [includeLogo, setIncludeLogo] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<
    "idle" | "generating" | "success" | "error"
  >("idle");
  const [exportMessage, setExportMessage] = useState("");
  const [exportErrorDetail, setExportErrorDetail] = useState("");

  // Active document — read from sessionStorage (set by PreviewPage on every
  // document switch). Falls back to doc-001 if sessionStorage is unavailable.
  const [activeDocId, setActiveDocId] = useState("doc-001");
  const [activeDocTitle, setActiveDocTitle] = useState("");
  const [filteredContent, setFilteredContent] = useState<string | null>(null);
  const [filtersActive, setFiltersActive] = useState(false);

  useEffect(() => {
    try {
      const storedId = sessionStorage.getItem("chat2pdf_active_doc_id");
      const storedTitle = sessionStorage.getItem("chat2pdf_active_doc_title");
      const storedContent = sessionStorage.getItem("chat2pdf_filtered_content");
      const storedFiltersActive = sessionStorage.getItem("chat2pdf_filters_active");

      if (storedId) setActiveDocId(storedId);
      if (storedTitle) setActiveDocTitle(storedTitle);
      if (storedContent) setFilteredContent(storedContent);
      if (storedFiltersActive) setFiltersActive(storedFiltersActive === "true");
    } catch {
      // sessionStorage unavailable — proceed with defaults
    }
  }, []);

  // Handle PDF generation
  const handleGenerateExport = async () => {
    if (selectedFormat !== "pdf") {
      setExportStatus("error");
      setExportMessage("Only PDF export is currently available");
      setExportErrorDetail("HTML, Markdown, and DOCX exports are coming in a future update.");
      return;
    }

    setIsExporting(true);
    setExportStatus("generating");
    setExportMessage("");

    try {
      const options: Partial<PdfGenerationOptions> = {
        fontSize,
        margins: margin,
        orientation,
        includeLogo,
        showTimestamps,
        darkMode,
      };

      const body: Record<string, unknown> = {
        documentId: activeDocId,
        options,
      };

      // When view filters were active on the preview page, pass the already-
      // filtered markdown so the PDF matches what the user saw.
      if (filtersActive && filteredContent) {
        body.content = filteredContent;
      }

      const response = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `Server returned ${response.status}`);
      }

      // Get the PDF blob
      const pdfBlob = await response.blob();
      const pageCount = response.headers.get("X-Page-Count");

      // Create download link
      const url = window.URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        response.headers
          .get("Content-Disposition")
          ?.split("filename=")?.[1]?.replace(/"/g, "") ||
        "chat2pdf-export.pdf";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setExportStatus("success");
      setExportMessage(
        `PDF generated successfully!${pageCount ? ` (${pageCount} pages)` : ""}`
      );

      // Reset status after delay
      setTimeout(() => setExportStatus("idle"), 4000);
    } catch (error) {
      console.error("Export failed:", error);
      setExportStatus("error");
      setExportMessage(
        error instanceof Error ? error.message : "Failed to generate PDF"
      );
      setExportErrorDetail(
        "This may be due to a server-side issue. Please try again or contact support."
      );
      setTimeout(() => setExportStatus("idle"), 8000);
    } finally {
      setIsExporting(false);
    }
  };

  const formats = [
    { id: "pdf", label: "PDF", icon: FileText },
    { id: "markdown", label: "Markdown", icon: FileCode },
    { id: "html", label: "HTML", icon: FileType },
    { id: "docx", label: "DOCX", icon: FileSpreadsheet },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 bg-gray-50">
        <div className="mx-auto max-w-5xl px-4 py-8">
          {/* Export Settings Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">Export Settings</h1>
            <p className="mt-1 text-sm text-gray-500">
              Configure your document output precisely. These settings apply to the current active document.
            </p>
            {activeDocTitle && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                Exporting: <span className="font-semibold">{activeDocTitle}</span>
              </p>
            )}
            {filtersActive && (
              <p className="ml-2 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Preview filters active — PDF will match filtered view
              </p>
            )}
          </div>

          {/* Export Status Banner */}
          {(exportStatus === "success" || exportStatus === "error") && (
            <div
              className={`mb-6 flex items-start gap-3 rounded-lg border px-4 py-3 ${
                exportStatus === "success"
                  ? "border-green-200 bg-green-50"
                  : "border-red-200 bg-red-50"
              }`}
            >
              {exportStatus === "success" ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              ) : (
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${
                    exportStatus === "success" ? "text-green-800" : "text-red-800"
                  }`}
                >
                  {exportMessage}
                </p>
                {exportErrorDetail && (
                  <p className="mt-1 text-xs text-red-600">{exportErrorDetail}</p>
                )}
              </div>
            </div>
          )}

          {/* Export Settings Panel */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-base font-semibold text-gray-900">Document Export</h2>
              <Link
                href="/preview"
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </Link>
            </div>

            <div className="grid gap-6 p-6 lg:grid-cols-12">
              {/* Format Selection */}
              <div className="lg:col-span-3">
                <div className="space-y-2">
                  {formats.map((format) => {
                    const Icon = format.icon;
                    return (
                      <button
                        key={format.id}
                        onClick={() => setSelectedFormat(format.id)}
                        className={`flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                          selectedFormat === format.id
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="font-medium">{format.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Settings */}
              <div className="space-y-6 lg:col-span-6">
                {/* Font Size */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Font Size
                  </label>
                  <div className="mt-3 flex items-center gap-4">
                    <input
                      type="range"
                      min={8}
                      max={18}
                      value={fontSize}
                      onChange={(e) => setFontSize(Number(e.target.value))}
                      className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-black"
                    />
                    <span className="w-12 text-right text-sm font-medium text-gray-700">
                      {fontSize}pt
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-gray-400">
                    <span>Compact</span>
                    <span>Default</span>
                    <span>Large</span>
                  </div>
                </div>

                {/* Page Margins */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Page Margins
                  </label>
                  <div className="mt-3 flex gap-3">
                    <button
                      onClick={() => setMargin("standard")}
                      className={`flex-1 rounded-md border px-4 py-2.5 text-sm font-medium transition-colors ${
                        margin === "standard"
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      Standard
                      {margin === "standard" && (
                        <span className="ml-2 text-blue-600">&#10003;</span>
                      )}
                    </button>
                    <button
                      onClick={() => setMargin("narrow")}
                      className={`flex-1 rounded-md border px-4 py-2.5 text-sm font-medium transition-colors ${
                        margin === "narrow"
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      Narrow
                    </button>
                  </div>
                </div>

                {/* Orientation */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Orientation
                  </label>
                  <div className="mt-3 flex gap-3">
                    <button
                      onClick={() => setOrientation("portrait")}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium transition-colors ${
                        orientation === "portrait"
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <Monitor className="h-4 w-4" />
                      Portrait
                    </button>
                    <button
                      onClick={() => setOrientation("landscape")}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium transition-colors ${
                        orientation === "landscape"
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Landscape
                    </button>
                  </div>
                </div>

                {/* Branding Options */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Branding Options
                  </label>
                  <div className="mt-3 space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeLogo}
                        onChange={(e) => setIncludeLogo(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Include Chat2PDF Logo</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showTimestamps}
                        onChange={(e) => setShowTimestamps(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Show source timestamps</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={darkMode}
                        onChange={(e) => setDarkMode(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Dark mode formatting</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="lg:col-span-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Preview
                </label>
                <div className="mt-3 flex aspect-[3/4] items-center justify-center rounded-md border border-gray-200 bg-gray-50 p-4">
                  <div
                    className={`w-full rounded border shadow-sm ${
                      orientation === "landscape" ? "aspect-[4/3]" : "aspect-[3/4]"
                    } ${darkMode ? "bg-gray-900" : "bg-white"}`}
                  >
                    <div className={`p-3 ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                      <div className={`h-1.5 w-1/2 rounded ${darkMode ? "bg-gray-700" : "bg-gray-200"}`} />
                      <div className={`mt-2 h-1 w-3/4 rounded ${darkMode ? "bg-gray-700" : "bg-gray-100"}`} />
                      <div className={`mt-1 h-1 w-full rounded ${darkMode ? "bg-gray-700" : "bg-gray-100"}`} />
                      <div className={`mt-1 h-1 w-5/6 rounded ${darkMode ? "bg-gray-700" : "bg-gray-100"}`} />
                      {/* Code block preview */}
                      <div className={`mt-3 rounded ${darkMode ? "bg-gray-950" : "bg-slate-900"} p-2`}>
                        <div className={`h-1 w-3/4 rounded ${darkMode ? "bg-emerald-500/30" : "bg-cyan-500/30"}`} />
                        <div className={`mt-1.5 h-1 w-1/2 rounded ${darkMode ? "bg-purple-500/30" : "bg-pink-500/30"}`} />
                      </div>
                      {/* Table preview */}
                      <div className={`mt-3 space-y-px`}>
                        <div className={`flex gap-1 ${darkMode ? "bg-gray-800" : "bg-gray-100"} py-0.5 px-1`}>
                          <span className={`h-1 w-8 rounded ${darkMode ? "bg-gray-600" : "bg-gray-300"}`} />
                          <span className={`h-1 w-16 rounded ${darkMode ? "bg-gray-600" : "bg-gray-300"}`} />
                        </div>
                        <div className={`flex gap-1 py-0.5 px-1`}>
                          <span className={`h-1 w-10 rounded ${darkMode ? "bg-gray-600" : "bg-gray-300"}`} />
                          <span className={`h-1 w-20 rounded ${darkMode ? "bg-gray-600" : "bg-gray-300"}`} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-center text-xs text-gray-400">Live Preview</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <Link
                href="/preview"
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </Link>
              <button
                onClick={handleGenerateExport}
                disabled={isExporting}
                className={`inline-flex min-w-[140px] items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium text-white transition-all ${
                  isExporting
                    ? "cursor-not-allowed bg-gray-400"
                    : "bg-black hover:bg-gray-800 active:scale-[0.98]"
                }`}
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Generate Export
                  </>
                )}
              </button>
            </div>
          </div>

          {/* System States Section */}
          <div className="mt-12">
            <h2 className="text-xl font-semibold text-gray-900">System States</h2>
            <p className="mt-1 text-sm text-gray-500">
              Refined error handling and notification patterns for technical failures.
            </p>
            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              <InvalidURLError />
              <PrivateConversationError />
              <ExtractionFailureError />
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
