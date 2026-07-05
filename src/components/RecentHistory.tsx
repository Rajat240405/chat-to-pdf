"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getRecentHistory } from "@/lib/history";
import { setCurrentDocument } from "@/lib/current-document-store";
import type { ConversationDocument } from "@/lib/mock-data";

export default function RecentHistory() {
  const [history, setHistory] = useState<ConversationDocument[]>([]);

  useEffect(() => {
    setHistory(getRecentHistory());
  }, []);

  if (history.length === 0) return null;

  return (
    <section className="py-16">
      <div className="mx-auto max-w-5xl px-4">

<div className="mb-8 flex items-center justify-between">

  <div>
    <h2 className="text-3xl font-bold tracking-tight">
      Recent Conversions
    </h2>

    <p className="mt-2 text-gray-500">
      Continue working on your latest exported conversations.
    </p>
  </div>

  <Link
    href="/history"
    className="rounded-lg border px-4 py-2 text-sm font-medium transition hover:bg-gray-100"
  >
    View all
  </Link>

</div>

        <div className="space-y-5">

          {history.map((doc) => (

            <Link
  key={doc.id}
  href="/preview"
  onClick={() => {
    setCurrentDocument(doc);

    sessionStorage.setItem(
      "promptpress_current_doc",
      JSON.stringify(doc)
    );
  }}
  className="group block rounded-xl border bg-white p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-gray-400 hover:shadow-sm hover:shadow-md"
>
  <div className="flex items-center justify-between">

    <div className="flex-1">

      <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium capitalize text-gray-700">
        {doc.provider}
      </span>

      <h3 className="mt-4 text-lg font-semibold text-gray-900">
        {doc.title}
      </h3>

      <p className="mt-2 text-sm text-gray-500">
        {doc.wordCount.toLocaleString()} words
      </p>

    </div>

    <button
      className="rounded-lg border px-4 py-2 text-sm font-medium transition group-hover:bg-gray-100"
    >
      Open
    </button>

  </div>
</Link>

          ))}

        </div>

      </div>
    </section>
  );
}