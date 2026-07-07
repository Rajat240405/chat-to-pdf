"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-gray-500 md:flex-row">
        <div>
          <p className="font-semibold text-gray-900">PromptPress</p>

          <p className="mt-1">
            Transform AI conversations into polished documentation.
          </p>
        </div>

        <div className="flex items-center gap-6">
          <a
            href="https://github.com/YOUR_USERNAME"
            target="_blank"
            className="hover:text-black transition"
          >
            GitHub
          </a>

          <a
            href="https://github.com/Rajat240405/chat-to-pdf/issues/new/choose"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 transition-colors hover:text-gray-900"
          >
            Contact
          </a>

          <span>© {new Date().getFullYear()} PromptPress</span>
        </div>
      </div>
    </footer>
  );
}
