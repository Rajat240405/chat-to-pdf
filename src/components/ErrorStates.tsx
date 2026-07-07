"use client";

import {
  Link2,
  Lock,
  AlertTriangle,
  RefreshCw,
  HelpCircle,
} from "lucide-react";

export function InvalidURLError() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm hover:shadow-md">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-red-50">
        <Link2 className="h-6 w-6 text-red-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900">Invalid URL</h3>
      <p className="mt-2 text-sm text-gray-500">
        This link doesn&apos;t look like a valid chat URL. Please verify the
        source and try again.
      </p>
      <a
        href="/"
        className="mt-6 inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        Edit URL
      </a>
    </div>
  );
}

export function PrivateConversationError() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm hover:shadow-md">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-amber-50">
        <Lock className="h-6 w-6 text-amber-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900">
        Private Conversation
      </h3>
      <p className="mt-2 text-sm text-gray-500">
        The provided link is private. Please ensure sharing is enabled in your
        chat settings.
      </p>
      <a
        href="https://help.openai.com/en/articles/7925741-chatgpt-shared-links-faq"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
      >
        How to Share
      </a>
    </div>
  );
}

export function ExtractionFailureError() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm hover:shadow-md">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50">
          <AlertTriangle className="h-5 w-5 text-red-500" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Extraction Failure
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            We couldn&apos;t parse this conversation. Technical details below.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-2 rounded-md bg-gray-50 p-4 font-mono text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500">ERRORCODE:</span>
          <span className="text-red-600">PARSER_ERR_84X</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">REF_ID:</span>
          <span className="text-gray-700">827-BCF-182</span>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 transition-colors hover:text-blue-700"
        >
          <RefreshCw className="h-4 w-4" />
          Retry Process
        </a>
        <a
          href="https://github.com/Rajat240405/chat-to-pdf/issues/new/choose"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
        >
          <HelpCircle className="h-4 w-4" />
          Contact Support
        </a>
      </div>
    </div>
  );
}
