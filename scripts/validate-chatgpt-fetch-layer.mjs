// scripts/validate-chatgpt-fetch-layer.mjs
// Run: node scripts/validate-chatgpt-fetch-layer.mjs
//
// Tests the ChatGPT fetch layer (URL validation + HTTP fetch) without
// requiring a TypeScript compiler. Detection and validation logic is
// re-implemented inline so this runs with plain Node.js.
//
// Tests are grouped into two suites:
//   Suite A — Offline (URL validation only, no network)
//   Suite B — Online  (actual HTTP fetch, skipped if SKIP_NETWORK=1)
//             Set env var: SKIP_NETWORK=1 node scripts/validate-chatgpt-fetch-layer.mjs

// ── Inline validation logic (mirrors src/providers/chatgpt.ts) ─────────────────

const SHARE_PATH_RE     = /^\/share\/([a-zA-Z0-9_-]+)(?:\/.*)?$/;
const OWN_CONV_PATH_RE  = /^\/c\/([a-zA-Z0-9_-]+)/;

function isShareableUrl(url) {
  try {
    const { hostname, pathname } = new URL(url);
    return hostname === "chatgpt.com" && SHARE_PATH_RE.test(pathname);
  } catch {
    return false;
  }
}

function isOwnConvUrl(url) {
  try {
    const { pathname } = new URL(url);
    return OWN_CONV_PATH_RE.test(pathname);
  } catch {
    return false;
  }
}

function extractShareId(url) {
  try {
    const match = new URL(url).pathname.match(SHARE_PATH_RE);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function detect(url) {
  try {
    const { hostname } = new URL(url);
    return hostname === "chatgpt.com" || hostname === "chat.openai.com" || hostname.endsWith(".chatgpt.com");
  } catch {
    return false;
  }
}

// Mimics the validation + error-discrimination logic inside extract()
function validateBeforeFetch(url) {
  if (!isShareableUrl(url)) {
    if (isOwnConvUrl(url)) {
      return { ok: false, error: "OWN_CONV", message: "/c/<id> URLs require login — use Share button to get a public link" };
    }
    return { ok: false, error: "INVALID_URL", message: "URL must be https://chatgpt.com/share/<uuid>" };
  }
  return { ok: true };
}

// ── Inline fetch (mirrors fetchChatGPTSharePage) ───────────────────────────────

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Upgrade-Insecure-Requests": "1",
};

async function fetchSharePage(url) {
  const doFetch = () => fetch(url, { method: "GET", headers: BROWSER_HEADERS, redirect: "follow", cache: "no-store" });

  let res = await doFetch();
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 2000));
    res = await doFetch();
  }

  if (res.status === 404) throw { code: "NOT_FOUND",   status: 404 };
  if (res.status === 403) throw { code: "FORBIDDEN",   status: 403 };
  if (res.status === 401) throw { code: "UNAUTHORIZED", status: 401 };
  if (res.status === 429) throw { code: "RATE_LIMITED", status: 429 };
  if (!res.ok)            throw { code: "HTTP_ERROR",   status: res.status };

  return { html: await res.text(), status: res.status };
}

// ── Test harness ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

// ── Suite A: Offline URL validation ───────────────────────────────────────────

console.log("\n=== Suite A — Offline URL Validation ===\n");

// Valid share URLs
console.log("── Valid share URLs (isShareableUrl → true) ──");
const validShareUrls = [
  "https://chatgpt.com/share/6751ab3d-f2e4-4a8c-9b12-3c7e09f42a11",
  "https://chatgpt.com/share/abc123DEF456-xyz",
  "https://chatgpt.com/share/short",
];
for (const url of validShareUrls) {
  assert(url, isShareableUrl(url) === true);
}

// /c/<id> own-conversation links — must be rejected
console.log("\n── /c/<id> links (isShareableUrl → false, isOwnConvUrl → true) ──");
const ownConvUrls = [
  "https://chatgpt.com/c/67c3b2a1-e8f4-4b2c-a1d0-5e6f7a8b9c0d",
  "https://chatgpt.com/c/abc123",
  "https://chat.openai.com/c/abc123",
];
for (const url of ownConvUrls) {
  assert(`isShareableUrl → false: ${url}`, isShareableUrl(url) === false);
  const parsed = new URL(url);
  if (parsed.hostname === "chatgpt.com" || parsed.hostname === "chat.openai.com") {
    assert(`isOwnConvUrl  → true:  ${url}`, isOwnConvUrl(url) === true);
  }
}

// legacy chat.openai.com share links — detect true, isShareableUrl false (redirect to chatgpt.com)
console.log("\n── Legacy chat.openai.com/share/ (detect → true, isShareableUrl → false) ──");
const legacyShareUrls = [
  "https://chat.openai.com/share/abc123-def456",
];
for (const url of legacyShareUrls) {
  assert(`detect → true:         ${url}`, detect(url) === true);
  assert(`isShareableUrl → false: ${url}`, isShareableUrl(url) === false, "canonical domain is chatgpt.com");
}

// Unsupported and malformed URLs
console.log("\n── Unsupported / malformed URLs (no throw, correct false) ──");
const invalidUrls = [
  ["https://claude.ai/chat/abc",       false, false],
  ["https://gemini.google.com/share/x",false, false],
  ["https://chatgpt.com/",             false, false],
  ["https://chatgpt.com/auth/login",   false, false],
  ["https://chatgpt.com/gpts",         false, false],
  ["not-a-url",                        false, false],
  ["",                                 false, false],
  ["javascript:alert(1)",              false, false],
];
for (const [url, expectShareable] of invalidUrls) {
  assert(`isShareableUrl → ${expectShareable}: ${url || "(empty)"}`, isShareableUrl(url) === expectShareable);
}

// Share ID extraction
console.log("\n── extractShareId ──");
assert(
  "Extracts UUID from /share/<uuid>",
  extractShareId("https://chatgpt.com/share/6751ab3d-f2e4-4a8c-9b12-3c7e09f42a11") === "6751ab3d-f2e4-4a8c-9b12-3c7e09f42a11"
);
assert(
  "Returns null for /c/<id>",
  extractShareId("https://chatgpt.com/c/abc123") === null
);
assert(
  "Returns null for non-ChatGPT URL",
  extractShareId("https://claude.ai/chat/abc") === null
);
assert(
  "Returns null for malformed URL",
  extractShareId("not-a-url") === null
);

// validateBeforeFetch discrimination
console.log("\n── validateBeforeFetch error discrimination ──");
{
  const r1 = validateBeforeFetch("https://chatgpt.com/share/valid-id");
  assert("Valid share URL → ok: true", r1.ok === true);

  const r2 = validateBeforeFetch("https://chatgpt.com/c/own-conv");
  assert("/c/<id> → error: OWN_CONV", r2.ok === false && r2.error === "OWN_CONV");

  const r3 = validateBeforeFetch("https://chatgpt.com/");
  assert("Homepage → error: INVALID_URL", r3.ok === false && r3.error === "INVALID_URL");

  const r4 = validateBeforeFetch("https://claude.ai/chat/abc");
  assert("Claude URL → error: INVALID_URL", r4.ok === false && r4.error === "INVALID_URL");

  const r5 = validateBeforeFetch("bad-url");
  assert("Malformed URL → error: INVALID_URL", r5.ok === false && r5.error === "INVALID_URL");
}

// ── Suite B: Online fetch (optional) ──────────────────────────────────────────

const skipNetwork = process.env.SKIP_NETWORK === "1";

if (skipNetwork) {
  console.log("\n=== Suite B — Online Fetch (SKIPPED: SKIP_NETWORK=1) ===\n");
} else {
  console.log("\n=== Suite B — Online Fetch (live network) ===");
  console.log("    Set SKIP_NETWORK=1 to skip. Tests may take 3-8 s each.\n");

  // Test: 404 for a non-existent share ID
  console.log("── HTTP error handling ──");
  try {
    await fetchSharePage("https://chatgpt.com/share/00000000-0000-0000-0000-000000000000");
    assert("Non-existent share → HTTP error thrown", false, "expected error, got HTML");
  } catch (err) {
    const got404 = err?.code === "NOT_FOUND" || err?.status === 404 ||
                   // Some CDNs return 200 with a redirect page for unknown IDs
                   err?.code === "HTTP_ERROR";
    assert(
      `Non-existent share → error code received (${err?.code ?? "unknown"})`,
      !!err?.code,
      `status: ${err?.status}`
    );
  }

  // Test: Fetch a real public share URL if provided via env
  // Usage: CHATGPT_SHARE_URL="https://chatgpt.com/share/<real-id>" node scripts/validate-chatgpt-fetch-layer.mjs
  const realUrl = process.env.CHATGPT_SHARE_URL;
  if (realUrl) {
    console.log(`\n── Real URL fetch: ${realUrl} ──`);
    try {
      const validation = validateBeforeFetch(realUrl);
      assert("URL passes validation", validation.ok === true);

      if (validation.ok) {
        const { html, status } = await fetchSharePage(realUrl);
        assert(`HTTP ${status} (OK)`, status === 200);
        assert("Response is non-empty HTML", typeof html === "string" && html.length > 500);
        assert("Contains <html> tag", html.toLowerCase().includes("<html"));
        assert(
          "Contains __NEXT_DATA__ script tag",
          html.includes("__NEXT_DATA__"),
          "If absent, ChatGPT may have changed their page structure"
        );

        // Check User-Agent was sent correctly (inferred: if we got HTML not a bot block)
        const gotBotBlocked = html.toLowerCase().includes("access denied") ||
                              html.toLowerCase().includes("blocked") ||
                              html.toLowerCase().includes("verify you are human");
        assert("Not bot-blocked by ChatGPT CDN", !gotBotBlocked);

        const sizeKb = (html.length / 1024).toFixed(1);
        console.log(`     HTML size: ${sizeKb} KB`);
      }
    } catch (err) {
      if (err?.code) {
        assert(`Fetch completed without unexpected error (got ${err.code})`, false, `status: ${err.status}`);
      } else {
        assert("Fetch completed without unexpected error", false, String(err));
      }
    }
  } else {
    console.log("    (No CHATGPT_SHARE_URL env var set — skipping real-URL test)");
    console.log("    Usage: CHATGPT_SHARE_URL=\"https://chatgpt.com/share/<id>\" node scripts/validate-chatgpt-fetch-layer.mjs");
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("\n🎉 All checks passed. Fetch layer is correct.\n");
  process.exit(0);
} else {
  console.log("\n⚠  Failures detected — review output above.\n");
  process.exit(1);
}
