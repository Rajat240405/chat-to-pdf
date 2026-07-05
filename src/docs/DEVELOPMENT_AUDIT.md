# PromptPress — Development Audit Report

**Audited:** 2026-06-24  
**Codebase Phase:** Phase 3 (PDF Export Complete — UI/Mock-data-only, no real backend)  
**Auditor:** Antigravity AI  

---

## 1. Folder Structure

```
promptpress-saas-frontend-development/
│
├── HANDOFF.md                          # Excellent 773-line handoff doc (accurate and up to date)
├── drizzle.config.json                 # Drizzle ORM config (DB not in active use)
├── eslint.config.mjs                   # ESLint flat config
├── next.config.ts                      # Minimal Next.js config
├── package.json                        # 11 prod deps + 7 dev deps
├── postcss.config.mjs                  # PostCSS for Tailwind v4
├── tsconfig.json                       # Strict TypeScript, @/* alias
│
├── scripts/
│   └── generate-pdf-chromium.js        # Standalone Puppeteer script (NOT used by app)
│
└── src/
    ├── app/                            # Next.js App Router
    │   ├── globals.css                 # Tailwind v4 import + .markdown-content styles
    │   ├── layout.tsx                  # Root HTML shell + metadata
    │   ├── page.tsx                    # Landing page (/)
    │   ├── processing/
    │   │   └── page.tsx                # Processing animation (/processing)
    │   ├── preview/
    │   │   └── page.tsx                # Document preview (/preview)
    │   ├── export/
    │   │   └── page.tsx                # Export settings (/export)
    │   └── api/
    │       ├── health/
    │       │   └── route.ts            # GET /api/health
    │       └── export/pdf/
    │           └── route.ts            # POST + GET /api/export/pdf
    │
    ├── components/                     # 6 reusable UI components
    │   ├── Header.tsx
    │   ├── Footer.tsx
    │   ├── PreviewSidebar.tsx
    │   ├── ProcessingCard.tsx
    │   ├── MarkdownRenderer.tsx
    │   └── ErrorStates.tsx
    │
    ├── lib/                            # Business logic
    │   ├── mock-data.ts                # 1,239-line mock data + type definitions
    │   ├── pdf-generator.ts            # 496-line PDF engine (Puppeteer)
    │   └── pdf-styles.css              # Print-optimized A4 CSS
    │
    └── db/                             # Database layer (scaffolded, unused)
        ├── schema.ts                   # Empty placeholder (exports {})
        └── index.ts                    # Drizzle + pg connection pool
```

**Observation:** Structure is clean and follows Next.js App Router conventions. No surprises or orphaned files (except `scripts/generate-pdf-chromium.js` which is explicitly noted as deprecated in `HANDOFF.md`).

---

## 2. Routing Architecture

### Route Map

| Route | File | Type | Purpose |
|-------|------|------|---------|
| `/` | `app/page.tsx` | Page (Client) | Landing page with URL input, feature grid, gallery, CTA |
| `/processing` | `app/processing/page.tsx` | Page (Client) | Animated processing simulation |
| `/preview` | `app/preview/page.tsx` | Page (Client) | Document viewer with sidebar |
| `/export` | `app/export/page.tsx` | Page (Client) | Export settings and PDF download trigger |
| `/api/health` | `app/api/health/route.ts` | API Route | Liveness check |
| `/api/export/pdf` | `app/api/export/pdf/route.ts` | API Route | POST: PDF generation; GET: sample PDF |

### Navigation Flow

```
/ (Landing)
  ↓  [URL entered + "Convert Conversation" clicked]
  ↓  (Next.js Link href="/processing" — NO validation, no URL passed to next page)
/processing
  ↓  [Simulated animation ~8s (80ms × 100 steps)]
  ↓  ⚠️ NO AUTO-REDIRECT implemented — user must navigate manually or via browser back
/preview
  ↓  [View 1 of 3 mock docs; "Export Settings" button in sidebar]
/export
  ↓  [Configure settings; click "Generate Export"]
  ↓  POST /api/export/pdf → PDF binary download
```

> [!WARNING]
> **Critical Gap:** The ProcessingCard has NO auto-redirect to `/preview` after completion. HANDOFF.md says "Auto-redirects to /preview after ~10 seconds" but this code is **absent** from `ProcessingCard.tsx`. The progress bar reaches 100% and stops — user is stranded.

### Cross-Page State

- **Zero shared state** between pages. Landing page URL input is not transmitted to Processing or Preview.
- Export page always hardcodes `documentId: "doc-001"` — ignores which doc the user selected in `/preview`.
- Filter toggles (hide prompts, show code only) in `PreviewSidebar` update local state but **do not filter the rendered markdown** — they are purely cosmetic at this stage.

---

## 3. Component Hierarchy

```
RootLayout (layout.tsx)
  └─ <body> (antialiased, bg-white)
      │
      ├─ LandingPage (page.tsx) — "use client"
      │   ├─ <Header variant="landing" />
      │   ├─ Hero: URL <input> + <Link href="/processing"> button
      │   ├─ Feature Grid (4 cards, static JSX)
      │   ├─ Document Gallery ← mockGalleryDocuments[]
      │   ├─ CTA Section
      │   ├─ Stats Section
      │   └─ <Footer />
      │
      ├─ ProcessingPage (processing/page.tsx) — Server Component
      │   ├─ <Header />
      │   ├─ <ProcessingCard /> ← "use client", handles its own state
      │   └─ <Footer />
      │
      ├─ PreviewPage (preview/page.tsx) — "use client"
      │   ├─ <Header showExport />
      │   ├─ Document Switcher Bar (inline, absolute positioned)
      │   ├─ <PreviewSidebar document={activeDoc} /> ← "use client"
      │   │   ├─ Metadata display (from doc.metadata)
      │   │   ├─ Export format radio (PDF/MD/RTF — state only, no effect)
      │   │   ├─ View Filters (3 toggles — state only, no effect on content)
      │   │   ├─ "Export Settings →" Link to /export
      │   │   └─ "Quick Export PDF" button → POST /api/export/pdf
      │   └─ <main>
      │       ├─ Document header (title, description, revision, word count)
      │       ├─ <MarkdownRenderer content={activeDoc.renderedMarkdown} />
      │       └─ Source footer (model info, original URL link)
      │
      ├─ ExportPage (export/page.tsx) — "use client"
      │   ├─ <Header />
      │   ├─ Export Status Banner (success/error)
      │   ├─ Format Selection (PDF/MD/HTML/DOCX buttons — only PDF actually works)
      │   ├─ Settings Panel (font slider, margins, orientation, branding checkboxes)
      │   ├─ Live Preview Thumbnail (static skeleton approximation)
      │   ├─ "Generate Export" button → handleGenerateExport()
      │   ├─ System States showcase (InvalidURLError, PrivateConversationError, ExtractionFailureError)
      │   └─ <Footer />
      │
      └─ Shared Components:
          ├─ Header.tsx        — `variant` prop unused in render logic; `showExport` shows Export button
          ├─ Footer.tsx        — Copyright, Privacy, Terms, API status dot (hardcoded green)
          ├─ ErrorStates.tsx   — 3 exported named components, all buttons are non-functional
          └─ MarkdownRenderer.tsx — react-markdown + remark-gfm, custom component overrides
```

---

## 4. State Management

### Pattern: Isolated Local State — No Global Store

All state is `useState` within individual components. There is no Context, Redux, Zustand, Jotai, or SWR in use.

| Component | State Variables | Notes |
|-----------|----------------|-------|
| `LandingPage` | `url` | Input value only; not used for navigation |
| `PreviewPage` | `activeDocIndex`, `showDocSwitcher` | Determines which mock doc renders |
| `PreviewSidebar` | `exportFormat`, `hidePrompts`, `showCodeOnly`, `systemMessages`, `isExporting`, `copied` | Filters are cosmetic — **not connected to MarkdownRenderer** |
| `ExportPage` | `selectedFormat`, `fontSize`, `margin`, `orientation`, `includeLogo`, `showTimestamps`, `darkMode`, `isExporting`, `exportStatus`, `exportMessage`, `exportErrorDetail` | Only PDF format triggers real API call |
| `ProcessingCard` | `progress` (0→100 at 80ms/tick), `steps` | Timer-based only; no real job tracking |
| `MarkdownRenderer` | `copiedBlocks` (Set) | Tracks which code blocks showed "Copied!" feedback |

### Missing State Infrastructure

- No URL search params for sharing document selection
- No localStorage persistence for user preferences
- No React Context for cross-page document state
- No data-fetching layer (SWR/React Query) — everything is import-time bundled

---

## 5. Current Implemented Features

### ✅ Fully Working

| Feature | Location | Quality |
|---------|----------|---------|
| Landing Page UI | `/` | ✅ Clean, professional layout |
| Processing animation | `/processing` | ✅ Smooth progress bar + step list |
| Document preview (3 mock docs) | `/preview` | ✅ Full layout with sidebar |
| Document switcher dropdown | `/preview` | ✅ Functional |
| Markdown rendering | `MarkdownRenderer.tsx` | ✅ Full GFM support |
| Copy-to-clipboard on code blocks | `MarkdownRenderer.tsx` | ✅ Works with 2s feedback |
| Export settings UI | `/export` | ✅ All controls render and respond |
| PDF generation (POST) | `/api/export/pdf` | ✅ Puppeteer pipeline, real PDF download |
| PDF generation (GET sample) | `/api/export/pdf` | ✅ Quick test endpoint |
| Error state components | `ErrorStates.tsx` | ✅ Visual showcase only |
| Health check endpoint | `/api/health` | ✅ Basic liveness |

### ⚠️ Partially Working (UI present, logic broken/missing)

| Feature | Status | Issue |
|---------|--------|-------|
| View filters (hide prompts, code only) | UI works, logic absent | Toggle state doesn't filter `renderedMarkdown` |
| Export format selection in sidebar | UI works | "md" and "rtf" selected but Quick Export always sends PDF |
| Processing auto-redirect | Absent | Progress reaches 100% but no `router.push('/preview')` |
| "Cancel conversion" button | Non-functional | No onClick handler |
| "Settings" button in sidebar | Non-functional | No onClick handler |
| "Help" button in sidebar | Non-functional | No onClick handler |
| "Enterprise Sales" CTA button | Non-functional | No href or onClick |
| Export page: Markdown/HTML/DOCX formats | Shows error message | Intentional — planned for future |
| Error state buttons (Edit URL, Request Access, Retry) | Non-functional | Visual showcase only |

---

## 6. Mock Data Flow

```
src/lib/mock-data.ts (bundled at build time, 46KB, 1,239 lines)
│
├── mockProcessingSteps[]        → ProcessingCard.tsx (step list display)
│
├── mockGalleryDocuments[]       → LandingPage (gallery section cards)
│   { id, title, subtitle, preview: "api"|"code"|"diagram" }
│
└── mockDocuments[]              → PreviewPage, PreviewSidebar, ExportPage, /api/export/pdf
    Three ConversationDocument objects:
    ├── doc-001: "Distributed Consensus Architecture" (GPT-4o, 2847 words)
    ├── doc-002: "React Optimization Guide" (Claude 3.5 Sonnet, 3214 words)
    └── doc-003: "PostgreSQL Migration Playbook" (Gemini Pro, ~2600 words)

    Each ConversationDocument contains:
    - id, title, description, provider, model, url, createdAt, wordCount
    - messages: Message[]  (role/content/timestamp)
    - renderedMarkdown: string  (the actual markdown content shown in PreviewPage)
    - metadata: DocumentMetadata  (human-readable labels for the sidebar)
```

### Key Data Flow Observations

1. `renderedMarkdown` and `messages[].content` are the **same string** (assistant's response). The `messages[]` array exists for future use (role-based filtering, chat UX) but is not rendered anywhere currently.
2. Export Page hardcodes `documentId: "doc-001"` — it ignores which doc is selected in `/preview`.
3. `PreviewSidebar.handleQuickExport()` correctly uses `doc.id` (passed as prop), so Quick Export is document-aware.
4. Both renderers (client-side `MarkdownRenderer` + server-side `customRenderMarkdown` in pdf-generator) process the same string — but they are **completely independent implementations** (react-markdown vs custom line parser).

---

## 7. PDF Export Implementation Status

### ✅ Fully Functional

The PDF pipeline is the most complete part of the codebase. Two renderers exist:

**Client-side (screen preview):**  
`react-markdown` + `remark-gfm` → custom JSX component overrides  
No syntax highlighting (code blocks render as raw text in a styled `<pre>`)

**Server-side (PDF):**  
`customRenderMarkdown()` → line-by-line parser → `highlight.js` syntax coloring → Puppeteer/Chromium → PDF binary

### Pipeline Status

| Stage | Implementation | Status |
|-------|---------------|--------|
| Markdown → HTML | `customRenderMarkdown()` — custom line parser | ✅ Works; handles headings, tables, code blocks, lists, blockquotes, inline formatting |
| Syntax highlighting | `highlight.js` via `highlightCode()` | ✅ Works for all listed languages |
| HTML template | `buildPdfTemplate()` — string concatenation, embeds PDF_CSS inline | ✅ Complete |
| Font loading | Google Fonts (Inter + JetBrains Mono) via CDN links | ⚠️ Requires network access at render time — will fail offline |
| Puppeteer launch | Dynamic import, `--no-sandbox` flags | ✅ Works; respects `PUPPETEER_EXECUTABLE_PATH` env var |
| Page config | A4 format, 5mm Puppeteer margin + 20mm CSS @page margin | ✅ Works |
| PDF response | Binary Uint8Array with proper Content-Type, Content-Disposition, X-Page-Count headers | ✅ Works |
| Download trigger | Client-side Blob URL + programmatic `<a>` click | ✅ Works |
| Page count | `estimatePageCount()` — heuristic formula (not actual PDF introspection) | ⚠️ Approximate only |
| Dark mode | CSS class injection in body | ✅ Implemented; visually untested per HANDOFF.md |
| Landscape mode | Viewport swap + CSS @page | ✅ Implemented |
| Narrow margins | CSS class | ✅ Implemented |

### Known Issue

The `/tmp/promptpress-pdf-{timestamp}` temp directory approach **will fail on Windows** in production environments since `/tmp` doesn't exist on Windows paths. This is not an issue in this local dev environment (the project runs via Node.js which handles `/tmp` on Windows via WSL or equivalent), but would be a production concern on Windows Server hosts.

---

## 8. Markdown Rendering Status

### Two Parallel Renderers — Divergence Risk

| Feature | Screen (`MarkdownRenderer.tsx`) | PDF (`pdf-generator.ts`) |
|---------|--------------------------------|--------------------------|
| H1/H2/H3 | ✅ Custom JSX with Tailwind classes | ✅ Custom HTML string |
| H4 | ❌ Not overridden (falls to react-markdown default) | ✅ Handled |
| Tables | ✅ Wrapped in overflow-x container | ✅ `.table-wrapper` div |
| Code blocks | ✅ Dark bg, copy button, language header | ✅ highlight.js colors, filename header |
| **Syntax highlighting** | ❌ **NOT implemented** — code appears as plain text in dark pre | ✅ Full highlight.js |
| Blockquotes | ✅ Blue left border | ✅ Blue left border |
| Inline code | ✅ Gray bg | ✅ Red color, gray bg |
| Links | ✅ External opens new tab | ✅ Shows URL in parentheses (print-safe) |
| Bold/Italic | ✅ via react-markdown | ✅ via regex |
| Strikethrough | ✅ remark-gfm | ⚠️ Not detected in custom parser |
| Nested lists | ✅ react-markdown handles natively | ⚠️ Custom parser may not handle deep nesting |
| Checkboxes (GFM) | ✅ remark-gfm | ❌ Not handled in custom parser |
| HR | ✅ Dashed style | ✅ Dashed style |

> [!IMPORTANT]
> **The biggest visual quality gap:** Client-side code blocks have **no syntax highlighting**. Users see the document beautifully in the exported PDF, but the preview page shows unstyled code. This is explicitly documented in HANDOFF.md (Gotcha #3) but creates a misleading "what you see is NOT what you get" experience.

---

## 9. Technical Debt

### High Priority

| Debt Item | Location | Impact |
|-----------|----------|--------|
| **No syntax highlighting on preview** | `MarkdownRenderer.tsx` | Major UX disconnect vs PDF output |
| **Processing page has no auto-redirect** | `ProcessingCard.tsx` | Broken user flow — user is stranded at 100% |
| **Export page ignores selected document** | `export/page.tsx` L68 | Always exports `doc-001` regardless of `/preview` selection |
| **View filters are cosmetic only** | `PreviewSidebar.tsx` | Toggle states exist but never passed to `MarkdownRenderer` |
| **URL from landing page is discarded** | `page.tsx` → Link href | Core product UX is broken — URL input does nothing |

### Medium Priority

| Debt Item | Location | Impact |
|-----------|----------|--------|
| **Two diverging markdown parsers** | `MarkdownRenderer.tsx` vs `pdf-generator.ts` | Maintenance burden; rendering inconsistencies |
| **`db/index.ts` throws on missing DATABASE_URL** | `db/index.ts` L6-8 | App crashes if imported without env var set |
| **`db/schema.ts` is empty** (`export {}`) | `db/schema.ts` | Drizzle is configured but has zero tables |
| **`scripts/generate-pdf-chromium.js` is dead code** | `scripts/` | Confusion for new developers |
| **Language display names in MarkdownRenderer are hardcoded to specific filenames** | `MarkdownRenderer.tsx` L13-22 | e.g., typescript always shows "merge.ts" — arbitrary |
| **`Header.tsx` `variant` prop declared but never used** | `Header.tsx` L7,11 | Dead prop |
| **Export page "Live Preview" is a static skeleton** | `export/page.tsx` | Not live — just a hardcoded wireframe illustration |
| **ProcessingCard job ID is hardcoded** (`#PDF-8842-XC`) | `ProcessingCard.tsx` L97 | Fake data presented as real system info |

### Low Priority

| Debt Item | Location | Impact |
|-----------|----------|--------|
| **`package.json` name is `nextjs-postgresql-template`** | `package.json` L2 | Should be `promptpress` |
| **`/tmp` path hardcoded** in PDF generator | `pdf-generator.ts` L83 | Not Windows-production-safe |
| **No 404 page** | `app/` | Next.js default 404 shown |
| **No loading.tsx files** | `app/*/` | No Suspense boundaries; full page loads |
| **All buttons in ErrorStates have no handlers** | `ErrorStates.tsx` | Visual only |
| **`Footer.tsx` API status dot is hardcoded green** | `Footer.tsx` | Not actually monitoring `/api/health` |
| **No input validation on URL field** | `page.tsx` | Any text (or empty) navigates to /processing |
| **Google Fonts loaded via CDN in PDF** | `pdf-generator.ts` L461 | Will silently degrade offline |
| **`copied` state in PreviewSidebar never set to true** | `PreviewSidebar.tsx` L211 | "Copied!" label never appears; used `isExporting` state instead |

---

## 10. Missing Features

### Core Product (Blocking MVP)

| Feature | Priority | Notes |
|---------|----------|-------|
| **URL validation** | P0 | Detect chatgpt.com/share/, claude.ai/share/, gemini.google.com/ URLs |
| **URL → Processing pipeline connection** | P0 | Landing page URL must be passed to processing and eventually used |
| **Real extraction / scraping** | P0 | Playwright fetch of shared conversation pages; parse DOM |
| **Provider adapters** | P0 | Normalized parsers per provider (OpenAI, Anthropic, Google) |
| **Real document data flow** | P0 | Replace mock-data with API-fetched `ConversationDocument` objects |
| **Processing auto-redirect** | P0 | `router.push('/preview')` after progress reaches 100% |
| **Filter functionality wired up** | P1 | Hiding prompts, code-only view, passing state to MarkdownRenderer |
| **Cross-page document selection** | P1 | Export page should know which document was selected in preview |

### Quality & UX

| Feature | Priority | Notes |
|---------|----------|-------|
| **Syntax highlighting in preview** | P1 | Add `react-syntax-highlighter` or `highlight.js` integration to `MarkdownRenderer` |
| **H4 support in MarkdownRenderer** | P1 | Override `h4` component currently missing |
| **Checkbox list support (GFM)** | P2 | `- [x] item` renders but checkboxes need styling |
| **TOC generation in PDF** | P2 | Extract h2 headings, render clickable anchor links |
| **Page numbers in PDF** | P2 | Puppeteer footer template |
| **Real "live" preview on export page** | P2 | Show actual rendered content scaled down |
| **Persistent user preferences** | P2 | localStorage for font size, default format |

### Export Formats

| Feature | Priority | Notes |
|---------|----------|-------|
| **Markdown (.md) export** | P1 | Near-zero effort — raw string already available |
| **HTML export** | P1 | Reuse `buildPdfTemplate()` without Puppeteer, return HTML file |
| **DOCX export** | P2 | Requires `docx` npm package |

### Infrastructure

| Feature | Priority | Notes |
|---------|----------|-------|
| **User authentication** | P2 | NextAuth or Clerk |
| **Document persistence** | P2 | Drizzle + PostgreSQL (schema scaffolded, empty) |
| **Document library/dashboard** | P2 | User's saved conversions |
| **Real-time processing feedback** | P2 | SSE or WebSocket instead of fake timer |
| **Rate limiting** | P3 | Prevent abuse |
| **Job queue** | P3 | BullMQ/Redis for heavy conversions |

---

## 11. Recommended Roadmap

### Phase 4 — Close the Core Loop (Estimated: 2–3 sprints)

**Sprint 1: Fix Broken User Flow**
1. Add `router.push('/preview')` after progress reaches 100% in `ProcessingCard` (+ `useRouter` hook)
2. Wire URL from landing page through to processing via `searchParams` or `sessionStorage`
3. Add URL format validation in landing page input with inline error messaging
4. Fix `copied` state bug in `PreviewSidebar` (it references the wrong state variable)

**Sprint 2: Wire Up Existing UI**
1. Connect view filter toggles to `MarkdownRenderer` — pass `hidePrompts`, `showCodeOnly` as props and filter `messages[]` accordingly
2. Connect selected document ID from `/preview` to `/export` (via URL param or sessionStorage)
3. Add syntax highlighting to `MarkdownRenderer` — integrate `highlight.js` in the `code` component override (it's already in `package.json`)
4. Implement H4 override in `MarkdownRenderer`

**Sprint 3: Easy Export Wins**
1. Add `/api/export/markdown` route — 10 lines, returns raw string as `.md` file
2. Add `/api/export/html` route — reuse `buildPdfTemplate()` output directly
3. Remove hardcoded `documentId: "doc-001"` from export page

### Phase 5 — Real Backend (Estimated: 3–4 sprints)

1. Define Drizzle schema tables: `documents`, `messages`, `export_jobs`
2. Create `/api/extract` route with URL detection + provider adapter interface stubs
3. Build scraping infrastructure (Playwright for ChatGPT/Claude/Gemini shared URLs)
4. Connect processing page to real API job polling (SSE)
5. Connect preview page to fetched `ConversationDocument` (not mock data)

### Phase 6 — Product Hardening

1. Add NextAuth (Google + GitHub OAuth)
2. Implement document library page
3. Add PDF TOC and page numbers
4. Rate limiting, error monitoring (Sentry), uptime alerts

---

## Safest Next Development Step

> [!TIP]
> **The single safest, highest-value change:** Add `useRouter` and `router.push('/preview')` to `ProcessingCard.tsx` once `progress >= 100`.

**Why this is the right first step:**
- It is a **2-line change** (import `useRouter`, add `useEffect` on `progress`)
- It fixes the only broken navigation in the entire user flow
- It requires **zero new dependencies** and **zero architectural decisions**
- It unblocks manual testing of the complete Landing → Processing → Preview → Export → Download flow
- It carries **zero risk of regression** — it only adds behavior, not changes existing behavior
- Once the flow is unbroken end-to-end (even with mock data), every subsequent improvement has a working baseline to build on

The second safest step after that would be adding `highlight.js` to the client-side `MarkdownRenderer`, since the library is already a declared dependency — it just needs to be called in the `code` component override.
