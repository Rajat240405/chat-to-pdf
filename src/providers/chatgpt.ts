// ============================================================
// Chat2PDF — ChatGPT Provider Adapter (with extraction)
// ============================================================
//
// SUPPORTED URLS
//   https://chatgpt.com/share/<uuid>      Public share link (main target)
//   https://chatgpt.com/c/<id>            Own conversation (requires auth — will 403)
//   https://chat.openai.com/share/<uuid>  Legacy domain
//   https://chat.openai.com/c/<id>        Legacy domain (own conv.)
//
// EXTRACTION APPROACH
//   ChatGPT share pages are Next.js apps that embed the full conversation
//   payload in a <script id="__NEXT_DATA__" type="application/json"> tag.
//   No login is required for public share links.
//
//   JSON path tried (in order — OpenAI changes this occasionally):
//     1. props.pageProps.serverResponse.data          (primary, ~2024-2026)
//     2. props.pageProps.serverResponse               (alt — data may be at root)
//     3. props.pageProps.sharedConversation           (older format)
//     4. props.pageProps                              (broad fallback)
//
//   Conversation structure:
//     • linear_conversation[] — flat ordered array (preferred)
//     • mapping{}             — tree (parent/children refs) — linearized when used
//
// KNOWN LIMITATIONS
//   • /c/<id> URLs for your own (non-shared) conversations return 403 — auth needed
//   • Deleted / expired share links return 404
//   • Rate-limited requests (429) are retried once after 2 s
//   • Image-only messages are skipped (no text parts to extract)
//   • Tool-use messages (code interpreter outputs, browser results) are skipped
//   • ChatGPT may change __NEXT_DATA__ structure without notice
// ============================================================

import type { ProviderAdapter, Conversation, ConversationMessage } from "./types";
import { InvalidShareUrlError, ExtractionError } from "./types";

// ── Constants ──────────────────────────────────────────────────────────────────

const CHATGPT_HOSTNAMES = new Set(["chatgpt.com", "chat.openai.com"]);
const SHARE_PATH_RE = /^\/(?:share|c)\/([a-zA-Z0-9_-]+)/;

/** Roles we keep. Tool outputs, system prompts, and internals are filtered. */
const KEPT_ROLES = new Set(["user", "assistant"]);

/** Fetch headers that mimic a real browser — reduces bot-detection rejections. */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

// ── Raw JSON types (ChatGPT internal — may change) ─────────────────────────────

interface RawPart {
  content_type?: string;
  asset_pointer?: string;
  [key: string]: unknown;
}

interface RawContent {
  content_type?: string;
  parts?: Array<string | RawPart | null>;
  text?: string;
}

interface RawAuthor {
  role?: string;
  name?: string | null;
  metadata?: Record<string, unknown>;
}

interface RawMessage {
  id?: string;
  author?: RawAuthor;
  content?: RawContent;
  create_time?: number | null;
  update_time?: number | null;
  status?: string;
  weight?: number;
  end_turn?: boolean | null;
  metadata?: Record<string, unknown>;
  recipient?: string;
}

interface RawNode {
  id?: string;
  message?: RawMessage | null;
  parent?: string | null;
  children?: string[];
}

interface RawConvData {
  title?: string;
  conversation_id?: string;
  linear_conversation?: RawNode[];
  mapping?: Record<string, RawNode>;
  create_time?: number;
  update_time?: number;
  gizmo_id?: string | null;
  model?: { slug?: string; [key: string]: unknown };
  [key: string]: unknown;
}

// ── HTML parsing ───────────────────────────────────────────────────────────────

/**
 * Extracts the raw JSON object from the <script id="__NEXT_DATA__"> tag.
 * Returns null if the tag is absent or the JSON cannot be parsed.
 */
function parseNextDataScript(html: string): unknown | null {
  // Match the script tag — allow whitespace around the id attribute
  const match = html.match(
    /<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * Safely reads a nested object path, returning undefined if any key is absent.
 * Example: deepGet(obj, "props", "pageProps", "serverResponse", "data")
 */
function deepGet(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj;
  for (const key of keys) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/**
 * Walks the __NEXT_DATA__ object and returns the raw conversation payload,
 * trying several known paths in priority order.
 *
 * OpenAI has placed this data at different locations over time; we try the
 * most current path first and fall back progressively.
 */
function findConversationData(nextData: unknown): RawConvData | null {
  const candidates: unknown[] = [
    deepGet(nextData, "props", "pageProps", "serverResponse", "data"),
    deepGet(nextData, "props", "pageProps", "serverResponse"),
    deepGet(nextData, "props", "pageProps", "sharedConversation"),
    deepGet(nextData, "props", "pageProps"),
  ];

  for (const candidate of candidates) {
    if (
      candidate !== null &&
      candidate !== undefined &&
      typeof candidate === "object" &&
      (
        Array.isArray((candidate as RawConvData).linear_conversation) ||
        typeof (candidate as RawConvData).mapping === "object" ||
        typeof (candidate as RawConvData).title === "string"
      )
    ) {
      return candidate as RawConvData;
    }
  }
  return null;
}

// ── Message linearization ──────────────────────────────────────────────────────

/**
 * Extracts plain text from a raw message's content object.
 * Handles content_type "text" (parts[]) and "tether_quote"/"code" etc.
 * Returns empty string for image-only, tool-result, or metadata-only messages.
 */
function extractTextContent(content: RawContent | undefined | null): string {
  if (!content) return "";

  // Standard text messages: content.parts is an array of strings
  if (content.content_type === "text" && Array.isArray(content.parts)) {
    return content.parts
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      .join("\n");
  }

  // Older format: content.text (direct string)
  if (typeof content.text === "string") return content.text;

  // Mixed parts: extract any string parts (skip image asset pointers, etc.)
  if (Array.isArray(content.parts)) {
    const textParts = content.parts.filter(
      (p): p is string => typeof p === "string" && p.trim().length > 0
    );
    if (textParts.length > 0) return textParts.join("\n");
  }

  return "";
}

/**
 * Decides whether a raw node/message should be included in the output.
 * Filters out: null messages, tool messages, system messages,
 * zero-weight (invisible) messages, and empty content.
 */
function shouldKeepNode(node: RawNode): boolean {
  const msg = node.message;
  if (!msg) return false;
  if (!msg.author?.role) return false;
  if (!KEPT_ROLES.has(msg.author.role)) return false;
  // Weight 0 = invisible system message / filler node
  if (msg.weight === 0) return false;
  // Recipient != "all" = tool-directed message (browser, code interpreter…)
  if (msg.recipient && msg.recipient !== "all") return false;
  return true;
}

/** Converts a filtered RawNode into a normalized ConversationMessage. */
function normalizeNode(node: RawNode, index: number): ConversationMessage {
  const msg = node.message!;
  const role = msg.author!.role as "user" | "assistant";
  const content = extractTextContent(msg.content);
  const ts =
    typeof msg.create_time === "number" && msg.create_time > 0
      ? new Date(msg.create_time * 1000).toISOString()
      : undefined;

  return {
    id: msg.id ?? node.id ?? `chatgpt-msg-${index}`,
    role,
    content,
    ...(ts ? { timestamp: ts } : {}),
  };
}

/**
 * Normalizes messages from a linear_conversation array.
 * Filters silently to keep only user/assistant text messages with content.
 */
function normalizeFromLinear(nodes: RawNode[]): ConversationMessage[] {
  return nodes
    .filter(shouldKeepNode)
    .map(normalizeNode)
    .filter((m) => m.content.trim().length > 0);
}

/**
 * Normalizes messages from a mapping object (tree structure).
 *
 * The mapping is a dict of { [nodeId]: RawNode } where each node has
 * a parent reference and children array. To reconstruct the linear
 * conversation we walk from the root, following the last child at each
 * branch (ChatGPT's editing creates multiple branches; the last child
 * represents the final, shown version).
 *
 * Root detection: a node whose parent is null, undefined, or not present
 * in the mapping.
 */
function normalizeFromMapping(
  mapping: Record<string, RawNode>
): ConversationMessage[] {
  // Find root(s)
  const roots = Object.values(mapping).filter(
    (node) => !node.parent || !(node.parent in mapping)
  );
  if (roots.length === 0) return [];

  const ordered: RawNode[] = [];

  // DFS from the root, always taking the LAST child (most recent branch)
  function walk(nodeId: string) {
    const node = mapping[nodeId];
    if (!node) return;
    ordered.push(node);
    const children = node.children ?? [];
    if (children.length > 0) {
      // Last child = the user's most recent edit / model's final response
      walk(children[children.length - 1]);
    }
  }

  walk(roots[0].id ?? Object.keys(mapping)[0]);

  return ordered
    .filter(shouldKeepNode)
    .map(normalizeNode)
    .filter((m) => m.content.trim().length > 0);
}

// ── HTTP fetch ─────────────────────────────────────────────────────────────────

/**
 * Fetches a ChatGPT share page with browser-like headers.
 * Handles common error responses and retries once on 429.
 */
async function fetchSharePage(url: string): Promise<string> {
  const doFetch = async () =>
    fetch(url, {
      method: "GET",
      headers: BROWSER_HEADERS,
      redirect: "follow",
    });

  let res = await doFetch();

  // 429 Too Many Requests — wait 2 s then retry once
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 2000));
    res = await doFetch();
  }

  if (res.status === 404) {
    throw new ExtractionError(
      "chatgpt",
      url,
      "Conversation not found (404). The share link may have expired or been deleted."
    );
  }
  if (res.status === 403 || res.status === 401) {
    throw new ExtractionError(
      "chatgpt",
      url,
      `Access denied (${res.status}). The conversation may be private or the share link may require login. ` +
        "Only public share links (/share/<id>) can be extracted without authentication."
    );
  }
  if (res.status === 429) {
    throw new ExtractionError(
      "chatgpt",
      url,
      "Rate limited (429). ChatGPT rejected too many requests. Please wait a few minutes and try again."
    );
  }
  if (!res.ok) {
    throw new ExtractionError(
      "chatgpt",
      url,
      `Unexpected HTTP ${res.status} from ChatGPT. The page structure may have changed.`
    );
  }

  return res.text();
}

// ── Conversation assembly ──────────────────────────────────────────────────────

/**
 * Converts a raw conversation data object into a normalized Conversation.
 * Prefers linear_conversation over mapping; uses mapping as a fallback.
 */
function assembleConversation(data: RawConvData, sourceUrl: string): Conversation {
  let messages: ConversationMessage[] = [];

  if (Array.isArray(data.linear_conversation) && data.linear_conversation.length > 0) {
    messages = normalizeFromLinear(data.linear_conversation);
  } else if (data.mapping && typeof data.mapping === "object") {
    messages = normalizeFromMapping(data.mapping);
  }

  if (messages.length === 0) {
    throw new ExtractionError(
      "chatgpt",
      sourceUrl,
      "No extractable messages found in the conversation. " +
        "The conversation may be empty, image-only, or use an unsupported content type."
    );
  }

  // Title: from JSON → first user message (truncated) → fallback
  const firstUserMsg = messages.find((m) => m.role === "user");
  const title: string =
    typeof data.title === "string" && data.title.trim().length > 0
      ? data.title.trim()
      : firstUserMsg
      ? firstUserMsg.content.split("\n")[0].slice(0, 80).trim()
      : "Untitled ChatGPT Conversation";

  // Optional metadata (model slug, timestamps)
  const metadata: Record<string, string | number | boolean> = {};
  if (typeof data.create_time === "number") {
    metadata["created"] = new Date(data.create_time * 1000).toISOString();
  }
  if (typeof data.update_time === "number") {
    metadata["updated"] = new Date(data.update_time * 1000).toISOString();
  }
  if (data.model && typeof data.model === "object" && data.model.slug) {
    metadata["model"] = String(data.model.slug);
  }
  if (data.conversation_id) {
    metadata["conversationId"] = String(data.conversation_id);
  }

  return {
    provider: "chatgpt",
    title,
    messages,
    sourceUrl,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

// ── Adapter class ──────────────────────────────────────────────────────────────

export class ChatGPTAdapter implements ProviderAdapter {
  readonly name = "chatgpt" as const;

  detect(url: string): boolean {
    try {
      const { hostname } = new URL(url);
      return (
        CHATGPT_HOSTNAMES.has(hostname) || hostname.endsWith(".chatgpt.com")
      );
    } catch {
      return false;
    }
  }

  /** True only for /share/<id> or /c/<id> paths — these are extractable. */
  isShareableUrl(url: string): boolean {
    try {
      const { hostname, pathname } = new URL(url);
      return CHATGPT_HOSTNAMES.has(hostname) && SHARE_PATH_RE.test(pathname);
    } catch {
      return false;
    }
  }

  /** Returns the share/conversation ID from the URL path, or null. */
  extractShareId(url: string): string | null {
    try {
      const match = new URL(url).pathname.match(SHARE_PATH_RE);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Extracts a public ChatGPT share conversation into a normalized Conversation.
   *
   * Steps:
   *   1. Validate URL with isShareableUrl()
   *   2. Fetch the share page HTML
   *   3. Parse __NEXT_DATA__ JSON from the embedded script tag
   *   4. Find conversation data in the JSON (tries 4 known path variations)
   *   5. Linearize messages (from linear_conversation[] or mapping tree)
   *   6. Filter: keep only user/assistant text messages
   *   7. Normalize to ConversationMessage[]
   *   8. Assemble and return Conversation
   *
   * @throws InvalidShareUrlError  — URL is not a valid share link
   * @throws ExtractionError       — network failure, page structure changed, etc.
   */
  async extract(url: string): Promise<Conversation> {
    // ── Step 1: URL validation ───────────────────────────────────────────────
    if (!this.isShareableUrl(url)) {
      throw new InvalidShareUrlError(
        this.name,
        url,
        "URL must be a public ChatGPT share link: https://chatgpt.com/share/<id>"
      );
    }

    try {
      // ── Step 2: Fetch HTML ─────────────────────────────────────────────────
      const html = await fetchSharePage(url);

      // ── Step 3: Parse __NEXT_DATA__ ───────────────────────────────────────
      const nextData = parseNextDataScript(html);
      if (!nextData) {
        throw new ExtractionError(
          this.name,
          url,
          "__NEXT_DATA__ script tag not found in the page HTML. " +
            "ChatGPT may have changed their page structure. " +
            "Alternatively, the page may have rendered a login redirect instead of the conversation."
        );
      }

      // ── Step 4: Find conversation payload ─────────────────────────────────
      const convData = findConversationData(nextData);
      if (!convData) {
        throw new ExtractionError(
          this.name,
          url,
          "Could not locate conversation data in __NEXT_DATA__. " +
            "The JSON path may have changed — check the CHATGPT_EXTRACTION_REPORT.md for known paths."
        );
      }

      // ── Steps 5–8: Normalize and return ──────────────────────────────────
      return assembleConversation(convData, url);
    } catch (err) {
      // Re-throw typed errors unchanged; wrap unexpected errors
      if (
        err instanceof InvalidShareUrlError ||
        err instanceof ExtractionError
      ) {
        throw err;
      }
      throw new ExtractionError(
        this.name,
        url,
        `Unexpected error during extraction: ${String(err)}`,
        err
      );
    }
  }
}

// ── Exported helpers (for testing and future API route use) ───────────────────

/**
 * Parses a ChatGPT share page HTML string without making a network request.
 * Useful for unit testing and offline validation.
 *
 * @throws ExtractionError if parsing fails
 */
export function parseSharePageHtml(html: string, sourceUrl: string): Conversation {
  const nextData = parseNextDataScript(html);
  if (!nextData) {
    throw new ExtractionError(
      "chatgpt",
      sourceUrl,
      "__NEXT_DATA__ script tag not found"
    );
  }
  const convData = findConversationData(nextData);
  if (!convData) {
    throw new ExtractionError(
      "chatgpt",
      sourceUrl,
      "Conversation data not found in __NEXT_DATA__"
    );
  }
  return assembleConversation(convData, sourceUrl);
}
