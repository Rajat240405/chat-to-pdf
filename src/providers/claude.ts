// PromptPress — Claude Provider Adapter

import type { ProviderAdapter, Conversation } from "./types";
import {
  ExtractionNotImplementedError,
  InvalidShareUrlError,
} from "./types";

const CLAUDE_HOSTNAMES = new Set(["claude.ai"]);
const SHARE_PATH_RE = /^\/share\/([a-f0-9-]+)$/i;

export class ClaudeAdapter implements ProviderAdapter {
  readonly name = "claude" as const;

  detect(url: string): boolean {
    try {
      const { hostname } = new URL(url);
      return CLAUDE_HOSTNAMES.has(hostname);
    } catch {
      return false;
    }
  }

  isShareableUrl(url: string): boolean {
    try {
      const { hostname, pathname } = new URL(url);
      return CLAUDE_HOSTNAMES.has(hostname) && SHARE_PATH_RE.test(pathname);
    } catch {
      return false;
    }
  }

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
      throw new InvalidShareUrlError(
        this.name,
        url,
        "URL must be a claude.ai /share/<id> link"
      );
    }

    throw new ExtractionNotImplementedError(this.name, url);
  }
}