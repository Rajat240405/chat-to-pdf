"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const statuses = [
  "Loading conversation...",
  "Restoring formatting...",
  "Rendering preview...",
];

export default function PreviewSkeleton() {
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStatusIndex((prev) => (prev + 1) % statuses.length);
    }, 900);

    return () => clearInterval(interval);
  }, []);

  return (
    <main className="h-screen overflow-hidden bg-slate-100 backdrop-blur-sm">
      {/* Header */}
      <header className="h-14 border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-5">
            <div className="h-6 w-36 skeleton rounded-md" />
            <div className="h-5 w-px bg-gray-200" />
            <div className="h-4 w-40 skeleton rounded" />
          </div>

          <div className="flex items-center gap-4">
            <div className="h-9 w-24 skeleton rounded-md" />
            <div className="h-9 w-24 skeleton rounded-md" />
            <div className="h-9 w-28 skeleton rounded-md" />
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-72 border-r border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-6">
            <div className="mb-6 h-5 w-40 skeleton rounded" />

            <div className="space-y-3">
              <div className="h-10 skeleton rounded-lg" />

              <div className="h-9 skeleton rounded-md" />

              <div className="h-9 skeleton rounded-md" />

              <div className="h-9 skeleton rounded-md" />

              <div className="h-9 skeleton rounded-md" />

              <div className="h-9 skeleton rounded-md" />
            </div>
          </div>

          <div className="p-6">
            <div className="mb-6 h-4 w-28 skeleton rounded" />

            <div className="space-y-4">
              <div className="flex justify-between">
                <div className="h-4 w-20 skeleton rounded" />

                <div className="h-4 w-16 skeleton rounded" />
              </div>

              <div className="flex justify-between">
                <div className="h-4 w-20 skeleton rounded" />

                <div className="h-4 w-20 skeleton rounded" />
              </div>

              <div className="flex justify-between">
                <div className="h-4 w-20 skeleton rounded" />

                <div className="h-4 w-14 skeleton rounded" />
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <section className="flex-1 overflow-hidden">
          <div className="mx-auto max-w-6xl p-10">
            {/* Document */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 p-10">
                {/* Title */}

                <div className="mb-5 h-10 w-[78%] skeleton rounded-lg" />

                {/* Description */}

                <div className="mb-6 h-5 w-[62%] skeleton rounded" />

                {/* Provider + Model */}

                <div className="mb-6 flex items-center gap-3">
                  <div className="h-8 w-24 skeleton rounded-full" />

                  <div className="h-8 w-20 skeleton rounded-full" />
                </div>

                {/* Metadata row */}

                <div className="flex items-center gap-6">
                  <div className="h-4 w-28 skeleton rounded" />

                  <div className="h-4 w-24 skeleton rounded" />

                  <div className="h-4 w-32 skeleton rounded" />
                </div>
              </div>

              <div className="space-y-10 p-10">
                {/* Paragraph */}
                <div className="space-y-3">
                  <div className="h-4 w-full skeleton rounded" />
                  <div className="h-4 w-full skeleton rounded" />
                  <div className="h-4 w-5/6 skeleton rounded" />
                </div>

                {/* Image */}
                <div className="aspect-video w-full skeleton rounded-xl" />

                {/* Paragraph */}
                <div className="space-y-3">
                  <div className="h-4 w-full skeleton rounded" />
                  <div className="h-4 w-11/12 skeleton rounded" />
                  <div className="h-4 w-4/5 skeleton rounded" />
                </div>

                {/* Code Block */}
                <div className="rounded-xl bg-gray-900 p-6">
                  <div className="space-y-3">
                    <div className="h-3 w-2/3 rounded bg-gray-700" />

                    <div className="h-3 w-full rounded bg-gray-700" />

                    <div className="h-3 w-4/5 rounded bg-gray-700" />

                    <div className="h-3 w-1/2 rounded bg-gray-700" />

                    <div className="h-3 w-3/4 rounded bg-gray-700" />
                  </div>
                </div>

                {/* Paragraph */}

                <div className="space-y-3">
                  <div className="h-4 w-full skeleton rounded" />

                  <div className="h-4 w-full skeleton rounded" />

                  <div className="h-4 w-5/6 skeleton rounded" />
                </div>

                {/* Another section */}

                <div className="space-y-4">
                  <div className="h-7 w-48 skeleton rounded" />

                  <div className="space-y-3">
                    <div className="h-4 w-full skeleton rounded" />

                    <div className="h-4 w-full skeleton rounded" />

                    <div className="h-4 w-3/4 skeleton rounded" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Floating Loading Toast */}
      <div className="fixed bottom-6 right-6 z-50">
        <div className="flex min-w-[320px] items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-xl">
          <Loader2 className="h-5 w-5 animate-spin text-black" />

          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">
              Preparing Preview
            </p>

            <p className="mt-1 text-sm text-gray-500">
              {statuses[statusIndex]}
            </p>

            <div className="mt-3 h-1 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-black transition-all duration-1000 ease-in-out"
                style={{
                  width:
                    statusIndex === 0
                      ? "25%"
                      : statusIndex === 1
                        ? "60%"
                        : "90%",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
