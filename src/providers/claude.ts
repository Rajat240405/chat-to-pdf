// Chat2PDF — Claude Provider Adapter
// Handles: claude.ai
//
// Supported URL patterns:
//   https://claude.ai/chat/<uuid>
//   https://claude.ai/share/<uuid>
//
// Extraction plan (Step 2, not yet implemented):
//   Option A: Fetch claude.ai/share/<id> page — Anthropic renders share
//   pages as static HTML with conversation JSON embedded in a <script> tag.
//   Option B: Anthropic Messages API (requires user's API key).
//   Option C: Playwright for private conversations.

import type { ProviderAdapter, Conversation } from "./types";
import { ExtractionNotImplementedError, InvalidShareUrlError } from "./types";

const CLAUDE_HOSTNAMES = new Set(["claude.ai"]);
const SHARE_PATH_RE = /^\/(?:chat|share)\/([a-zA-Z0-9_-]+)/;

export class ClaudeAdapter implements ProviderAdapter {
  readonly name = "claude" as const;

  detect(url: string): boolean {
    try {
      const { hostname } = new URL(url);
      return CLAUDE_HOSTNAMES.has(hostname) || hostname.endsWith(".claude.ai");
    } catch {
      return false;
    }
  }

  /** True only for /chat/<id> or /share/<id> paths — these are extractable. */
  isShareableUrl(url: string): boolean {
    try {
      const { hostname, pathname } = new URL(url);
      return CLAUDE_HOSTNAMES.has(hostname) && SHARE_PATH_RE.test(pathname);
    } catch {
      return false;
    }
  }

  /** Returns the conversation/share ID from the URL path, or null. */
  extractShareId(url: string): string | null {
    try {
      const match = new URL(url).pathname.match(SHARE_PATH_RE);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  async extract(url: string): Promise<Conversation> {
    if (!this.isShareableUrl(url)) {
      throw new InvalidShareUrlError(this.name, url, "URL must be a claude.ai /chat/<id> or /share/<id> link");
    }
    throw new ExtractionNotImplementedError(this.name, url);
  }
}
