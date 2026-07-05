// PromptPress — Gemini Provider Adapter
// Handles: gemini.google.com, aistudio.google.com, g.co (short URLs)
//
// Supported URL patterns:
//   https://gemini.google.com/share/<id>
//   https://gemini.google.com/app/<id>
//   https://aistudio.google.com/app/prompts/<id>
//   https://g.co/gemini/share/<id>   (short URL — redirects to gemini.google.com)
//
// Extraction plan (Step 2, not yet implemented):
//   Option A: Gemini share pages embed conversation JSON in the HTML.
//   Fetch + parse with Cheerio. No auth required for public share links.
//   Option B: Google Generative Language API (requires API key).
//   Note: g.co short URLs must be followed before parsing (HTTP redirect).

import type { ProviderAdapter, Conversation } from "./types";
import { ExtractionNotImplementedError, InvalidShareUrlError } from "./types";

const GEMINI_HOSTNAMES = new Set([
  "gemini.google.com",
  "aistudio.google.com",
  "g.co", // Gemini short-link domain
]);

const SHARE_PATH_RE = /^\/(?:share|app|app\/prompts|gemini\/share)\/([a-zA-Z0-9_-]+)/;

export class GeminiAdapter implements ProviderAdapter {
  readonly name = "gemini" as const;

  detect(url: string): boolean {
    try {
      const { hostname } = new URL(url);
      return GEMINI_HOSTNAMES.has(hostname);
    } catch {
      return false;
    }
  }

  /** True only for URL paths that point to a share/conversation page. */
  isShareableUrl(url: string): boolean {
    try {
      const { hostname, pathname } = new URL(url);
      if (!GEMINI_HOSTNAMES.has(hostname)) return false;
      // g.co short links are always shareable (they redirect server-side)
      if (hostname === "g.co") return pathname.startsWith("/gemini/");
      return SHARE_PATH_RE.test(pathname);
    } catch {
      return false;
    }
  }

  /** Returns the share ID, or null if not a valid share link. */
  extractShareId(url: string): string | null {
    try {
      const { hostname, pathname } = new URL(url);
      if (hostname === "g.co") {
        // g.co/gemini/share/<id>
        const match = pathname.match(/^\/gemini\/share\/([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
      }
      const match = pathname.match(SHARE_PATH_RE);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  async extract(url: string): Promise<Conversation> {
    if (!this.isShareableUrl(url)) {
      throw new InvalidShareUrlError(this.name, url, "URL must be a Gemini /share/<id> or AI Studio /prompts/<id> link");
    }
    throw new ExtractionNotImplementedError(this.name, url);
  }
}
