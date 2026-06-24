"use client";

import Link from "next/link";
import { Settings, User, FileOutput } from "lucide-react";

interface HeaderProps {
  variant?: "landing" | "app";
  showExport?: boolean;
}

export default function Header({ variant = "landing", showExport = false }: HeaderProps) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-bold tracking-tight text-gray-900">
            Chat2PDF
          </Link>
          <span className="text-gray-300">|</span>
          <Link
            href="/preview"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            My Documents
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <button className="p-2 text-gray-500 hover:text-gray-900 transition-colors">
            <Settings className="h-5 w-5" />
          </button>
          <button className="p-2 text-gray-500 hover:text-gray-900 transition-colors">
            <User className="h-5 w-5" />
          </button>
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
