"use client";

import Link from "next/link";

import { FaGithub } from "react-icons/fa";
import { FileOutput } from "lucide-react";
interface HeaderProps {
  variant?: "landing" | "app";
  showExport?: boolean;
}

export default function Header({
  variant = "landing",
  showExport = false,
}: HeaderProps) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-gray-900"
          >
            PromptPress
          </Link>
          <span className="text-gray-300">|</span>
          <Link
            href="/history"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Recent Conversations
          </Link>
        </div>

        <div className="flex items-center gap-5">
          <a
            href="https://github.com/Rajat240405/chat-to-pdf/issues/new/choose"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-gray-600 transition hover:text-black"
          >
            Feedback
          </a>

          <a
  href="https://github.com/Rajat240405/chat-to-pdf"
  target="_blank"
  rel="noopener noreferrer"
  className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-black"
>
  <FaGithub className="h-4 w-4" />
  GitHub
</a>
          {showExport && (
            <Link
              href="/export"
              className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
            >
              <FileOutput className="h-4 w-4" />
              Export
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
