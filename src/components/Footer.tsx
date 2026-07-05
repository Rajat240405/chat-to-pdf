"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="text-xs text-gray-500">
            <span className="font-medium text-gray-700">PromptPress Inc.</span>
            <br />
            &copy; 2024 PromptPress Inc. All rights reserved.
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-600">
            <Link href="#" className="hover:text-gray-900 transition-colors">
              Privacy Policy
            </Link>
            <Link href="#" className="hover:text-gray-900 transition-colors">
              Terms of Service
            </Link>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span>API Status</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
