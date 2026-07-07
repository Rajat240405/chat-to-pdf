"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Search,
  Trash2,
  ExternalLink,
  MessageSquare,
} from "lucide-react";

import type { ConversationDocument } from "@/lib/mock-data";
import { getHistory } from "@/lib/history";
import { setCurrentDocument } from "@/lib/current-document-store";

export default function HistoryPage() {
  const [history, setHistory] = useState<ConversationDocument[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  const filtered = useMemo(() => {
    return history.filter((doc) =>
      doc.title.toLowerCase().includes(search.toLowerCase())
    );
  }, [history, search]);

  function openConversation(doc: ConversationDocument) {
    setCurrentDocument(doc);

    try {
      localStorage.setItem(
  "promptpress_current_doc",
  JSON.stringify(doc)
);
    } catch {}
  }

  function deleteConversation(id: string) {
    if (!confirm("Delete this conversation?")) return;

    const updated = history.filter((d) => d.id !== id);

    setHistory(updated);

    localStorage.setItem(
      "promptpress_history",
      JSON.stringify(updated)
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-6 py-10">

        <div className="mb-10">

          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-black"
          >
            <ArrowLeft size={16} />
            Back to Home
          </Link>

          <div className="flex items-center gap-3">
            <MessageSquare className="h-8 w-8 text-gray-800" />

            <h1 className="text-4xl font-bold">
              Recent Conversations
            </h1>
          </div>

          <p className="mt-2 text-gray-500">
            {history.length} conversation{history.length !== 1 && "s"} saved locally
          </p>

        </div>

        <div className="relative mb-8">

          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
          />

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title..."
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-11 pr-4 shadow-sm outline-none focus:border-black"
          />

        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border bg-white p-16 text-center">

            <MessageSquare
              className="mx-auto mb-4 text-gray-300"
              size={48}
            />

            <h2 className="text-xl font-semibold">
              No conversations yet
            </h2>

            <p className="mt-2 text-gray-500">
              Convert your first ChatGPT conversation to start building your library.
            </p>

            <Link
              href="/"
              className="mt-6 inline-block rounded-xl bg-black px-6 py-3 text-white hover:bg-gray-800"
            >
              Convert Conversation
            </Link>

          </div>
        ) : (
          <div className="space-y-5">

            {filtered.map((doc) => (

              <div
                key={doc.id}
                className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-black hover:shadow-lg"
              >

                <div className="flex items-start justify-between">

                  <div>

                    <div className="mb-3 inline-flex rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                      {doc.provider}
                    </div>

                    <h2 className="text-xl font-semibold">
                      {doc.title}
                    </h2>

                    <div className="mt-3 flex items-center gap-3 text-sm text-gray-500">
                      <span>{doc.wordCount.toLocaleString()} words</span>

                      <span>•</span>

                      <span>
                        {new Date(doc.createdAt ?? Date.now()).toLocaleDateString()}
                      </span>
                    </div>

                  </div>

                  <div className="flex items-center gap-2">

                    <Link
                      href="/loading-preview"
                      onClick={() => openConversation(doc)}
                      className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-100"
                    >
                      Open
                      <ExternalLink size={16} />
                    </Link>

                    <button
                      onClick={() => deleteConversation(doc.id)}
                      className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={18} />
                    </button>

                  </div>

                </div>

              </div>

            ))}

          </div>
        )}

      </div>
    </main>
  );
}