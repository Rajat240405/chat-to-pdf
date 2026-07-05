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
      sessionStorage.setItem(
        "promptpress_current_doc",
        JSON.stringify(doc)
      );
    } catch {}
  }

  function deleteConversation(id: string) {
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

        <div className="mb-10 flex items-center justify-between">

          <div>

            <Link
              href="/"
              className="mb-4 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
            >
              <ArrowLeft size={16} />
              Back to Home
            </Link>

            <h1 className="text-4xl font-bold tracking-tight">
              Recent Conversations
            </h1>

            <p className="mt-2 text-gray-500">
              {history.length} conversation{history.length !== 1 && "s"} saved locally
            </p>

          </div>
        </div>

        <div className="relative mb-8">

          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
          />

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full rounded-lg border bg-white py-3 pl-11 pr-4 outline-none transition focus:border-gray-900"
          />

        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border bg-white p-16 text-center">

            <MessageSquare
              size={48}
              className="mx-auto mb-4 text-gray-300"
            />

            <h2 className="text-xl font-semibold">
              No conversations found
            </h2>

            <p className="mt-2 text-gray-500">
              Convert a ChatGPT conversation to build your library.
            </p>

            <Link
              href="/"
              className="mt-6 inline-block rounded-lg bg-black px-5 py-3 text-white hover:bg-gray-800"
            >
              Convert Conversation
            </Link>

          </div>
        ) : (
          <div className="space-y-5">

            {filtered.map((doc) => (

              <div
                key={doc.id}
                className="rounded-xl border bg-white p-6 transition hover:border-gray-400"
              >

                <div className="flex items-start justify-between">

                  <div>

                    <div className="mb-3 inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium capitalize text-gray-700">
                      {doc.provider}
                    </div>

                    <h2 className="text-xl font-semibold">
                      {doc.title}
                    </h2>

                    <p className="mt-2 text-sm text-gray-500">
                      {doc.wordCount.toLocaleString()} words
                    </p>

                  </div>

                  <div className="flex items-center gap-2">

                    <Link
                      href="/preview"
                      onClick={() => openConversation(doc)}
                      className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-100"
                    >
                      Open
                      <ExternalLink size={16} />
                    </Link>

                    <button
                      onClick={() => deleteConversation(doc.id)}
                      className="rounded-lg border p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
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