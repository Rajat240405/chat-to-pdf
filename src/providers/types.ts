// ============================================================
// Chat2PDF — Provider Adapter Type Definitions
// ============================================================
//
// This file defines the complete normalized data contract shared
// by every provider adapter (ChatGPT, Claude, Gemini, …).
//
// EXTENSION GUIDE
// To add a new provider:
//   1. Create src/providers/<name>.ts
//   2. Implement ProviderAdapter
//   3. Register in src/providers/index.ts
//   No changes to this file are required.
// ============================================================

// ── Normalized Message ─────────────────────────────────────────────────────────

/**
 * A single turn in a conversation, normalized from the provider's
 * internal representation into a provider-agnostic schema.
 *
 * Roles:
 *   "user"      — A human message / prompt
 *   "assistant" — The model's response
 *   "system"    — An invisible context-setting instruction
 */
export interface ConversationMessage {
  /** Stable unique identifier for this message turn. */
  id: string;

  /** Who authored this message. */
  role: "user" | "assistant" | "system";

  /**
   * Raw text content of the message.
   * Preserved verbatim from the provider — formatting (markdown, code
   * blocks) is left intact for downstream renderers to handle.
   */
  content: string;

  /**
   * ISO-8601 timestamp of the message, if available.
   * Many providers expose this in their API or share-page HTML;
   * some (e.g. Gemini) do not include per-message times.
   */
  timestamp?: string;
}

// ── Normalized Conversation ────────────────────────────────────────────────────

/**
 * A complete conversation extracted from any provider, normalized
 * into a shape the rest of the application can consume without
 * knowing which provider produced it.
 */
export interface Conversation {
  /** Provider identifier — "chatgpt" | "claude" | "gemini" */
  provider: string;

  /**
   * Human-readable title of the conversation.
   * Derived from the page title, first user message, or a heuristic
   * — whichever the provider makes available.
   */
  title: string;

  /** Ordered list of message turns, oldest first. */
  messages: ConversationMessage[];

  /** The canonical share URL the conversation was extracted from. */
  sourceUrl: string;

  /**
   * Optional metadata bag for provider-specific fields that don't
   * fit the normalized schema but may be useful for display.
   * Examples: model name, temperature, token count, creation date.
   */
  metadata?: Record<string, string | number | boolean>;
}

// ── Provider Adapter Contract ──────────────────────────────────────────────────

/**
 * The single interface every provider adapter must implement.
 *
 * DETECTION CONTRACT
 *   detect(url) must be:
 *     - Pure (no network calls, no async)
 *     - Infallible (must not throw — return false on malformed URLs)
 *     - Fast (called on every URL in the registry before one is selected)
 *     - Conservative (only match URLs that actually belong to this provider)
 *
 * EXTRACTION CONTRACT
 *   extract(url) returns a Promise<Conversation> because all real
 *   implementations will involve async I/O (fetch, Playwright, API call).
 *   In this architecture phase, all adapters throw ExtractionNotImplementedError.
 */
export interface ProviderAdapter {
  /** Stable lowercase identifier — "chatgpt" | "claude" | "gemini" */
  readonly name: string;

  /**
   * Returns true if this adapter can handle the given URL.
   * Must NOT make network requests. Must NOT throw.
   */
  detect(url: string): boolean;

  /**
   * Extracts the full conversation from the given share URL and
   * returns a normalized Conversation object.
   *
   * @throws ExtractionNotImplementedError during the architecture phase
   * @throws ExtractionError on any retrieval or parsing failure
   */
  extract(url: string): Promise<Conversation>;
}

// ── Error Types ────────────────────────────────────────────────────────────────

/**
 * Thrown by all extract() implementations during the architecture
 * phase (Step 1). Replaced with real extraction logic in Step 2.
 */
export class ExtractionNotImplementedError extends Error {
  readonly provider: string;
  readonly url: string;

  constructor(provider: string, url: string) {
    super(
      `Extraction not yet implemented for provider "${provider}". ` +
        `URL: ${url}. ` +
        `See PROVIDER_ARCHITECTURE.md for the implementation roadmap.`
    );
    this.name = "ExtractionNotImplementedError";
    this.provider = provider;
    this.url = url;
  }
}

/**
 * Thrown when extraction is attempted but the URL is detected as a
 * valid provider URL yet fails to parse as a conversation share link.
 */
export class InvalidShareUrlError extends Error {
  readonly provider: string;
  readonly url: string;

  constructor(provider: string, url: string, reason?: string) {
    super(
      `Invalid share URL for provider "${provider}": ${url}` +
        (reason ? `. Reason: ${reason}` : "")
    );
    this.name = "InvalidShareUrlError";
    this.provider = provider;
    this.url = url;
  }
}

/**
 * Thrown when extraction itself fails (network error, parse error,
 * auth failure, rate limit, etc.).
 */
export class ExtractionError extends Error {
  readonly provider: string;
  readonly url: string;
  readonly cause?: unknown;

  constructor(provider: string, url: string, message: string, cause?: unknown) {
    super(`Extraction failed for provider "${provider}" at ${url}: ${message}`);
    this.name = "ExtractionError";
    this.provider = provider;
    this.url = url;
    this.cause = cause;
  }
}
