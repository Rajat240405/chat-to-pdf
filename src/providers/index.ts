// ============================================================
// Chat2PDF — Provider Registry & Public API
// ============================================================
//
// Single import point for all provider functionality.
//
// USAGE
//   import { getProviderAdapter } from "@/providers";
//   const adapter = getProviderAdapter("https://chatgpt.com/share/abc123");
//   const conversation = await adapter.extract(url); // Step 2
//
// ADDING A NEW PROVIDER
//   1. Create src/providers/<name>.ts, implement ProviderAdapter
//   2. Add an instance to REGISTRY below — detection is tried in order
//   3. Export the class from this file
//   No other files need to change.
// ============================================================

import { ChatGPTAdapter } from "./chatgpt";
import { ClaudeAdapter } from "./claude";
import { GeminiAdapter } from "./gemini";
import type { ProviderAdapter } from "./types";

// ── Adapter Registry ───────────────────────────────────────────────────────────
// Detection is attempted in array order. More specific adapters should come
// before more general ones if their hostname sets overlap (they don't today).

const REGISTRY: readonly ProviderAdapter[] = [
  new ChatGPTAdapter(),
  new ClaudeAdapter(),
  new GeminiAdapter(),
];

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Selects the correct ProviderAdapter for the given URL by trying each
 * registered adapter's detect() method in order.
 *
 * @throws Error if no adapter recognises the URL.
 *
 * @example
 *   const adapter = getProviderAdapter("https://chatgpt.com/share/abc123");
 *   adapter.name // → "chatgpt"
 */
export function getProviderAdapter(url: string): ProviderAdapter {
  const adapter = REGISTRY.find((a) => a.detect(url));
  if (!adapter) {
    const supported = REGISTRY.map((a) => a.name).join(", ");
    throw new Error(
      `No provider adapter found for URL: "${url}". ` +
        `Supported providers: ${supported}.`
    );
  }
  return adapter;
}

/**
 * Returns the list of provider names in registration order.
 * Useful for UI dropdowns and capability checks.
 */
export function getSupportedProviders(): string[] {
  return REGISTRY.map((a) => a.name);
}

/**
 * Returns true if any registered adapter can handle the URL.
 * Cheaper than getProviderAdapter() when you only need a yes/no answer.
 */
export function isSupportedUrl(url: string): boolean {
  return REGISTRY.some((a) => a.detect(url));
}

// ── Re-exports ─────────────────────────────────────────────────────────────────

export { ChatGPTAdapter } from "./chatgpt";
export { ClaudeAdapter } from "./claude";
export { GeminiAdapter } from "./gemini";
export type {
  ProviderAdapter,
  Conversation,
  ConversationMessage,
} from "./types";
export {
  ExtractionNotImplementedError,
  InvalidShareUrlError,
  ExtractionError,
} from "./types";
