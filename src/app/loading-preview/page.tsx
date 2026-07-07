"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

const statuses = [
  "Loading conversation...",
  "Restoring formatting...",
  "Preparing preview...",
];

export default function LoadingPreviewPage() {
  const router = useRouter();
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStatusIndex((prev) =>
        prev < statuses.length - 1 ? prev + 1 : prev
      );
    }, 600);

    const timeout = setTimeout(() => {
      router.replace("/preview");
    }, 1800);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-white to-gray-100">
      <div className="w-full max-w-md px-8 text-center">

        <div className="mb-8 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-3xl font-bold text-black">
            P
          </div>
        </div>

        <h1 className="text-3xl font-bold">
          PromptPress
        </h1>

        <p className="mt-2 text-gray-400">
          Preparing Preview
        </p>

        <div className="mt-10">
          <div className="h-1 overflow-hidden rounded-full bg-gray-800">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-white" />
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-3">

          <RefreshCw className="h-5 w-5 animate-spin" />

          <p className="text-lg">
            {statuses[statusIndex]}
          </p>

        </div>

      </div>
    </main>
  );
}