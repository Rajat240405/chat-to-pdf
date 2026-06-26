"use client";
import { setCurrentDocument } from "@/lib/current-document-store";
import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  FileText,
  FileOutput,
  Code2,
  Database,
  Sparkles,
  Loader2,
} from "lucide-react";
import { mockGalleryDocuments } from "@/lib/mock-data";

export default function LandingPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Calls POST /api/extract with the current URL value.
   * On success: stores the ConversationDocument in sessionStorage
   * and navigates to /processing.
   * On failure: displays an inline error message.
   */
  const handleConvert = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please paste a share link before converting.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          (json && typeof json.error === "string" ? json.error : null) ??
          `Extraction failed (HTTP ${res.status}). Please check the URL and try again.`;
        setError(msg);
        return;
      }
      if (!json?.document) {
        setError("Unexpected response from server. Please try again.");
        return;
      }
      // Store the document so the preview/export pages can consume it
      // Fast in-memory handoff for Preview
setCurrentDocument(json.document);

// Persist as a fallback (refresh/new tab)
try {
  sessionStorage.setItem(
    "chat2pdf_current_doc",
    JSON.stringify(json.document)
  );
} catch {
  // sessionStorage unavailable
}
router.push("/processing");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Network error. Please check your connection and try again."
      );
    } finally {
      setIsLoading(false);
    }
  }, [url, router]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      {/* Hero Section */}
      <section className="flex flex-col items-center px-4 pt-16 pb-12 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          Turn AI Conversations into Technical Documentation.
        </h1>
        <p className="mt-5 max-w-lg text-base text-gray-500">
          Instantly convert links from ChatGPT, Claude, and Gemini into professionally formatted,
          vector-ready PDF technical manuals and docs.
        </p>

        <div className="mt-8 flex w-full max-w-xl flex-col gap-3 sm:flex-row">
          <input
            id="url-input"
            type="text"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !isLoading) handleConvert(); }}
            placeholder="Paste your ChatGPT, Claude, or Gemini link here..."
            disabled={isLoading}
            aria-label="Share URL input"
            className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <button
            id="btn-start-converting"
            onClick={handleConvert}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-black px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Extracting…
              </>
            ) : (
              "Start Converting"
            )}
          </button>
        </div>

        {/* Inline error — shown below the input row */}
        {error && (
          <p
            id="url-error"
            role="alert"
            className="mt-2 max-w-xl text-center text-sm text-red-600"
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center gap-6 text-xs font-medium text-gray-400">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
            OPENAI
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
            ANTHROPIC
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
            GOOGLE DEEPMIND
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="mx-auto w-full max-w-5xl px-4 py-12">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-blue-50">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">Auto-Markdown Rendering</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              Intelligent conversion of nested headers, lists, and citations into semantic document structures.
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-blue-50">
              <FileOutput className="h-5 w-5 text-blue-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">Vector PDF Export</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              Lossless resolution for high-quality printing and sharing. Text remains searchable and selectable.
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-blue-50">
              <Code2 className="h-5 w-5 text-blue-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">Code Block Extraction</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              Automatic syntax highlighting and formatting for all major programming languages within your chat.
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm sm:col-span-2 lg:col-span-3">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="flex-1">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-blue-50">
                  <Database className="h-5 w-5 text-blue-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">Metadata Preservation</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">
                  We keep the timestamps, conversation actors, and model versions intact for archival compliance and clarity.
                </p>
              </div>
              <div className="flex h-32 flex-1 items-center justify-center rounded-md bg-gray-50">
                <div className="w-full max-w-xs space-y-2 px-4">
                  <div className="h-2 w-3/4 rounded bg-gray-200" />
                  <div className="h-2 w-full rounded bg-gray-200" />
                  <div className="h-2 w-5/6 rounded bg-gray-200" />
                  <div className="h-2 w-2/3 rounded bg-gray-200" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Document Gallery Section */}
      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-5xl px-4">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Professional Document Exports</h2>
              <p className="mt-1 text-sm text-gray-500">Clean layouts optimized for technical teams.</p>
            </div>
            <Link
              href="/preview"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              View Documentation Gallery
            </Link>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            {mockGalleryDocuments.map((doc) => (
              <Link
                key={doc.id}
                href="/preview"
                className="group block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="aspect-[3/4] bg-gray-50 p-6">
                  {doc.preview === "api" && (
                    <div className="space-y-3">
                      <div className="h-3 w-1/3 rounded bg-gray-200" />
                      <div className="space-y-2">
                        <div className="h-2 w-full rounded bg-gray-100" />
                        <div className="h-2 w-5/6 rounded bg-gray-100" />
                        <div className="h-2 w-4/5 rounded bg-gray-100" />
                      </div>
                      <div className="mt-4 space-y-2">
                        <div className="h-2 w-full rounded bg-gray-100" />
                        <div className="h-2 w-3/4 rounded bg-gray-100" />
                      </div>
                    </div>
                  )}
                  {doc.preview === "code" && (
                    <div className="space-y-3">
                      <div className="h-3 w-1/3 rounded bg-gray-200" />
                      <div className="mt-2 rounded bg-gray-800 p-3">
                        <div className="h-2 w-3/4 rounded bg-gray-600" />
                        <div className="mt-1.5 h-2 w-1/2 rounded bg-gray-600" />
                        <div className="mt-1.5 h-2 w-2/3 rounded bg-gray-600" />
                      </div>
                      <div className="space-y-2">
                        <div className="h-2 w-full rounded bg-gray-100" />
                        <div className="h-2 w-4/5 rounded bg-gray-100" />
                      </div>
                    </div>
                  )}
                  {doc.preview === "diagram" && (
                    <div className="space-y-3">
                      <div className="h-3 w-1/3 rounded bg-gray-200" />
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-2 w-8 rounded bg-blue-400" />
                        <div className="h-2 w-12 rounded bg-gray-300" />
                      </div>
                      <div className="space-y-2">
                        <div className="h-2 w-full rounded bg-gray-100" />
                        <div className="h-2 w-5/6 rounded bg-gray-100" />
                        <div className="h-2 w-4/5 rounded bg-gray-100" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="text-sm font-semibold text-gray-900">{doc.title}</h3>
                  <p className="mt-1 text-xs font-medium uppercase tracking-wider text-gray-400">
                    {doc.subtitle}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 text-center">
        <h2 className="text-2xl font-semibold text-gray-900">
          Ready to automate your technical docs?
        </h2>
        <p className="mt-3 text-sm text-gray-500">
          Stop copying and pasting manually. Build your documentation library in seconds.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            id="btn-get-started"
            onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="inline-flex items-center justify-center rounded-md bg-black px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
          >
            Get Started Free
          </button>
          <button className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            Enterprise Sales
          </button>
        </div>
      </section>

      {/* Stats & Recent Docs Section */}
      <section className="border-t border-gray-200 bg-white py-16">
        <div className="mx-auto max-w-5xl px-4">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="flex flex-col justify-center rounded-lg bg-black p-8 text-white">
              <Sparkles className="mb-4 h-8 w-8 text-white" />
              <h3 className="text-2xl font-semibold">Professional Output</h3>
              <p className="mt-2 text-sm text-gray-300">
                Clean, pixel-perfect exports for every technical conversation you have.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
                <div className="text-3xl font-bold text-blue-600">2.4k</div>
                <div className="mt-1 text-xs font-medium uppercase tracking-wider text-gray-400">
                  Files Processed
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
                <div className="text-3xl font-bold text-gray-900">99%</div>
                <div className="mt-1 text-xs font-medium uppercase tracking-wider text-gray-400">
                  Parsing Accuracy
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 sm:col-span-2">
                <h4 className="text-sm font-semibold text-gray-900">Recent Documents</h4>
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-xs font-medium text-gray-600 shadow-sm">
                    1
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-xs font-medium text-gray-600 shadow-sm">
                    2
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-xs font-medium text-gray-600 shadow-sm">
                    3
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-xs font-medium text-gray-600 shadow-sm">
                    +4
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
