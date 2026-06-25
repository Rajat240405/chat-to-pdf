import { NextRequest, NextResponse } from "next/server";
import {
  getProviderAdapter,
  InvalidShareUrlError,
  ExtractionError,
  ExtractionNotImplementedError,
  type Conversation,
  type ConversationMessage,
} from "@/providers";
import type {
  ConversationDocument,
  Message,
  DocumentMetadata,
} from "@/lib/mock-data";

// ── Adapter: Conversation → ConversationDocument ──────────────────────────────

/**
 * Generates a stable, deterministic document ID from the share URL.
 * Same URL always produces the same ID — safe to use as a cache key.
 */
function urlToDocId(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) + h) ^ url.charCodeAt(i);
    h = h >>> 0; // unsigned 32-bit
  }
  return `conv-${h.toString(16).padStart(8, "0")}`;
}

/** Counts whitespace-delimited words in a string. */
function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Renders the normalized conversation as a readable Markdown document.
 * Each turn is labelled with its role and an optional timestamp, separated
 * by horizontal rules so the preview sidebar can visually distinguish turns.
 */
function buildRenderedMarkdown(conv: Conversation): string {
  const lines: string[] = [`# ${conv.title}`, ""];

  for (const msg of conv.messages) {
    const roleLabel = msg.role === "user" ? "**User**" : "**Assistant**";
    const ts =
      msg.timestamp
        ? ` _(${new Date(msg.timestamp).toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
          })})_`
        : "";

    lines.push(`${roleLabel}${ts}`);
    lines.push("");
    lines.push(msg.content);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

/**
 * Derives a short description from the first user message.
 * Falls back to a generic provider string if no user message exists.
 */
function buildDescription(conv: Conversation): string {
  const firstUser = conv.messages.find((m) => m.role === "user");
  if (!firstUser) return `Conversation extracted from ${conv.provider}.`;
  const text = firstUser.content.split("\n")[0].trim();
  return text.length > 200 ? text.slice(0, 197) + "…" : text;
}

/**
 * Converts a normalized Conversation returned by a ProviderAdapter
 * into the ConversationDocument shape consumed by the preview/export UI.
 *
 * Mapping:
 *   Conversation.title      → ConversationDocument.title
 *   Conversation.provider   → ConversationDocument.provider (narrowed)
 *   Conversation.messages   → ConversationDocument.messages (roles narrowed)
 *   Conversation.sourceUrl  → ConversationDocument.url
 *   Conversation.metadata   → individual fields scattered into the document
 *   buildRenderedMarkdown() → ConversationDocument.renderedMarkdown
 *   countWords()            → ConversationDocument.wordCount
 *   buildDescription()      → ConversationDocument.description
 *   urlToDocId()            → ConversationDocument.id
 */
function conversationToDocument(
  conv: Conversation,
  sourceUrl: string
): ConversationDocument {
  const renderedMarkdown = buildRenderedMarkdown(conv);
  const wordCount = countWords(renderedMarkdown);
  const id = urlToDocId(sourceUrl);

  // Only keep user/assistant turns; system messages are already filtered
  // by shouldKeepNode() in chatgpt.ts, but guard here defensively.
  const messages: Message[] = conv.messages
    .filter(
      (m): m is ConversationMessage & { role: "user" | "assistant" } =>
        m.role === "user" || m.role === "assistant"
    )
    .map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.timestamp ? { timestamp: m.timestamp } : {}),
    }));

  // Pull well-known metadata fields out of the opaque bag
  const model =
    typeof conv.metadata?.["model"] === "string"
      ? conv.metadata["model"]
      : conv.provider;

  const created =
    typeof conv.metadata?.["created"] === "string"
      ? conv.metadata["created"]
      : new Date().toISOString();

  const metadata: DocumentMetadata = {
    created,
    model,
    wordCount: `${wordCount.toLocaleString()} words`,
    provider: conv.provider,
    revision: "1",
    verified: true,
    messageCount: messages.length,
    exportFormats: ["PDF", "Markdown"],
  };

  // Narrow provider to the three known literals; default to "chatgpt"
  const provider = (
    ["chatgpt", "claude", "gemini"].includes(conv.provider)
      ? conv.provider
      : "chatgpt"
  ) as "chatgpt" | "claude" | "gemini";

  return {
    id,
    title: conv.title,
    description: buildDescription(conv),
    provider,
    model,
    url: sourceUrl,
    createdAt: created,
    wordCount,
    messages,
    renderedMarkdown,
    metadata,
  };
}

// ── POST /api/extract ─────────────────────────────────────────────────────────

/**
 * POST /api/extract
 *
 * Extracts a public AI conversation from a share URL and returns a
 * ConversationDocument ready for the preview/export pipeline.
 *
 * Request body:
 *   { "url": "https://chatgpt.com/share/<uuid>" }
 *
 * Success response (200):
 *   { "document": ConversationDocument }
 *
 * Error responses:
 *   400  — Missing / malformed request body or url field
 *   422  — Unsupported provider or invalid share URL (user error)
 *   501  — Provider detected but extraction not yet implemented
 *   502  — Extraction failed (network, parse, or rate-limit error)
 *   500  — Unexpected server error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Request body must be a JSON object." },
      { status: 400 }
    );
  }

  const { url } = body as Record<string, unknown>;

  if (!url || typeof url !== "string" || !url.trim()) {
    return NextResponse.json(
      {
        error: "Missing required field: url (non-empty string).",
        example: { url: "https://chatgpt.com/share/<uuid>" },
      },
      { status: 400 }
    );
  }

  const trimmedUrl = url.trim();

  // Basic URL format validation — catch typos before hitting the network
  try {
    new URL(trimmedUrl);
  } catch {
    return NextResponse.json(
      { error: `"${trimmedUrl}" is not a valid URL.` },
      { status: 400 }
    );
  }

  // ── Adapter selection ───────────────────────────────────────────────────────
  let adapter;
  try {
    adapter = getProviderAdapter(trimmedUrl);
  } catch {
    return NextResponse.json(
      {
        error:
          "Unsupported URL. Only public share links from ChatGPT, Claude, " +
          "and Gemini are supported.",
        hint: "Use a public share link such as https://chatgpt.com/share/<uuid>",
      },
      { status: 422 }
    );
  }

  // ── Extraction ──────────────────────────────────────────────────────────────
  let conversation: Conversation;
  try {
    conversation = await adapter.extract(trimmedUrl);
  } catch (err) {
    if (err instanceof InvalidShareUrlError) {
      return NextResponse.json(
        { error: err.message, code: "INVALID_SHARE_URL" },
        { status: 422 }
      );
    }
    if (err instanceof ExtractionNotImplementedError) {
      return NextResponse.json(
        {
          error: `Extraction for provider "${adapter.name}" is not yet implemented.`,
          code: "NOT_IMPLEMENTED",
        },
        { status: 501 }
      );
    }
    if (err instanceof ExtractionError) {
      return NextResponse.json(
        { error: err.message, code: "EXTRACTION_FAILED" },
        { status: 502 }
      );
    }
    // Unknown error — log server-side, return generic message to client
    console.error("[/api/extract] Unexpected error:", err);
    return NextResponse.json(
      {
        error: "An unexpected error occurred during extraction.",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }

  // ── Conversion & response ───────────────────────────────────────────────────
  const document = conversationToDocument(conversation, trimmedUrl);

  return NextResponse.json({ document }, { status: 200 });
}
