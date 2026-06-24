import fs from "fs";
import path from "path";
import { markdownToHtml } from "@/lib/markdown-to-html";

// ============================================================
// Chat2PDF — PDF Generator
// ============================================================
// Converts markdown conversation content into professional,
// print-optimized A4 PDF documents using Puppeteer.
//
// Design Goals:
//   - Match preview page visual fidelity 1:1
//   - Proper pagination (no orphaned headings/list items)
//   - Syntax-highlighted code blocks with no page-breaks
//   - Clean, Notion/GitBook-style technical documentation
// ============================================================

export interface PdfGenerationOptions {
  /** Document title displayed in header */
  title: string;
  /** Markdown content to render */
  content: string;
  /** Font size multiplier (default: 1) */
  fontSize?: number;
  /** Page margin style */
  margins?: "standard" | "narrow";
  /** Page orientation */
  orientation?: "portrait" | "landscape";
  /** Enable dark mode rendering */
  darkMode?: boolean;
  /** Include logo header */
  includeLogo?: boolean;
  /** Timestamps visibility */
  showTimestamps?: boolean;
}

export interface PdfResult {
  /** Raw PDF buffer for streaming/download */
  buffer: Buffer;
  /** Approximate page count (for user feedback) */
  pageCount: number;
}

/**
 * Generate a professional PDF document from markdown content.
 * Uses Puppeteer directly (server-side only).
 * Only call from API routes or server actions.
 */
export async function generatePdf(options: PdfGenerationOptions): Promise<PdfResult> {
  const {
    title,
    content,
    fontSize = 12,
    margins = "standard",
    orientation = "portrait",
    darkMode = false,
    includeLogo = true,
    showTimestamps = false,
  } = options;

  // Step 1: Render markdown to syntax-highlighted HTML
  // Uses the shared unified/remark/rehype pipeline (markdownToHtml)
  // replacing the hand-rolled customRenderMarkdown() that previously
  // lived in this file. See src/lib/markdown-to-html.ts.
  const htmlBody = await markdownToHtml(content);

  // Step 2: Build complete PDF template HTML
  const fullHtml = buildPdfTemplate({
    bodyContent: htmlBody,
    title,
    fontSize: Math.round(fontSize),
    marginClass: margins === "narrow" ? "margin-narrow" : "",
    orientationClass: orientation === "landscape" ? "orientation-landscape" : "",
    darkModeClass: darkMode ? "dark-mode" : "",
    includeLogo,
    generatedAt: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  });

  // Step 3: Write temp file and use Puppeteer to generate PDF
  const tempDir = "/tmp/chat2pdf-pdf-" + Date.now();
  fs.mkdirSync(tempDir, { recursive: true });

  const htmlPath = path.join(tempDir, "document.html");
  const pdfPath = path.join(tempDir, "output.pdf");

  try {
    // Write HTML input
    fs.writeFileSync(htmlPath, fullHtml, "utf-8");

    // Generate PDF using Puppeteer
    await runPuppeteerConversion(htmlPath, pdfPath, orientation, margins);

    // Read result
    if (!fs.existsSync(pdfPath)) {
      throw new Error("Puppeteer failed to generate PDF");
    }

    const pdfBuffer = fs.readFileSync(pdfPath);
    
    // Estimate page count based on content characteristics
    const estimatedPages = estimatePageCount(content, orientation);

    return {
      buffer: pdfBuffer,
      pageCount: estimatedPages,
    };
  } finally {
    // Cleanup temp files best-effort
    try {
      if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      fs.rmdirSync(tempDir, { recursive: true });
    } catch { /* best effort */ }
  }
}

/**
 * Run Puppeteer conversion — uses direct Puppeteer API.
 */
async function runPuppeteerConversion(
  htmlPath: string,
  pdfPath: string,
  orientation: "portrait" | "landscape",
  _margins: "standard" | "narrow"
): Promise<void> {
  let puppeteerModule;

  try {
    puppeteerModule = await import("puppeteer");
  } catch (e) {
    throw new Error("Puppeteer package not installed. Please run: npm install puppeteer");
  }

  const puppeteer = puppeteerModule.default || puppeteerModule;

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--font-render-hinting=none",
        "--disable-features=TranslateUI",
      ],
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        undefined,
    });

    const page = await browser.newPage();

    await page.setViewport({
      width: orientation === "landscape" ? 1123 : 794,
      height: orientation === "landscape" ? 794 : 1123,
      deviceScaleFactor: 1,
    });

    // Set content and wait for resources
    await page.setContent(
      fs.readFileSync(htmlPath, "utf-8"),
      {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      }
    );

    // Wait for web fonts
    try {
      await page.evaluateHandle(`document.fonts.ready.then(() => {})`);
      await page.waitForFunction('document.fonts.status === "loaded"', {
        timeout: 12000,
      });
    } catch {
      // Font loading may time out; proceed with fallback fonts
    }

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: { top: "5mm", bottom: "5mm", left: "5mm", right: "5mm" },
      printBackground: true,
      displayHeaderFooter: false,
      preferCSSPageSize: true,
      scale: 1.0,
      headerTemplate: "<div></div>",
      footerTemplate: "<div></div>",
    });

    // Write output
    fs.writeFileSync(pdfPath, pdfBuffer);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// escapeHtml is kept: still used by buildPdfTemplate() to safely
// inject the document title into the HTML template string.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// REMOVED in Step 3 (renderer unification):
//   renderMarkdownToHtml() — thin wrapper, now redundant
//   getFileName()          — generated code-header filenames for the
//                            old .code-block-wrapper div structure
//   highlightCode()        — called hljs.highlight() manually;
//                            rehype-highlight now handles this
//   customRenderMarkdown() — 120-line hand-rolled line parser replaced
//                            by the unified/remark/rehype pipeline in
//                            src/lib/markdown-to-html.ts



/** Estimate page count based on content */
function estimatePageCount(content: string, orientation: "portrait" | "landscape"): number {
  const baseCharsPerPage = orientation === "landscape" ? 4500 : 3000;
  const codeBlocks = content.match(/\`\`\`[\s\S]*?\`\`\`/g) || [];
  const extraCode = codeBlocks.reduce((acc, cb) => acc + cb.split("\n").length * 20, 0);
  const tblRows = (content.match(/\|/g) || []).length / 4;
  const effectiveLength = content.length + extraCode + tblRows * 50;
  return Math.max(1, Math.ceil(effectiveLength / baseCharsPerPage));
}

interface TemplateVars {
  bodyContent: string;
  title: string;
  fontSize: number;
  marginClass: string;
  orientationClass: string;
  darkModeClass: string;
  includeLogo: boolean;
  generatedAt: string;
}

const PDF_CSS = `
/* === A4 Print Layout === */
@page { size: A4; margin: 20mm 18mm; }
* { box-sizing: border-box; }
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: $FONT_SIZEpt; line-height: 1.65; color: #111827; background: white;
  margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
}
.pdf-document { max-width: 100%; padding: 0; }
h1 { font-size: 24pt; font-weight: 700; color: #111827; margin-top: 0; margin-bottom: 16pt; padding-bottom: 8pt; border-bottom: 2px solid #e5e7eb; page-break-after: avoid; orphans: 3; widows: 3; }
h2 { font-size: 17pt; font-weight: 600; color: #111827; margin-top: 28pt; margin-bottom: 10pt; padding-bottom: 5pt; border-bottom: 1px solid #e5e7eb; page-break-after: avoid; orphans: 3; widows: 3; }
h3 { font-size: 14pt; font-weight: 600; color: #1f2937; margin-top: 18pt; margin-bottom: 8pt; page-break-after: avoid; orphans: 2; widows: 2; }
p { margin-top: 0; margin-bottom: 10pt; text-align: justify; hyphens: auto; orphans: 2; widows: 2; }
a { color: #2563eb; text-decoration: none; }
a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 9pt; color: #6b7280; word-break: break-all; }
ul, ol { margin-top: 8pt; margin-bottom: 12pt; padding-left: 22pt; }
li { margin-bottom: 4pt; orphans: 2; widows: 2; }
ul ul, ol ol, ul ol, ol ul { margin-top: 4pt; margin-bottom: 4pt; }
li > strong { color: #111827; font-weight: 600; }
table { width: 100%; border-collapse: collapse; margin: 14pt 0; font-size: 10pt; page-break-inside: avoid; }
thead { background-color: #f9fafb; }
th { text-align: left; font-weight: 600; color: #111827; padding: 8pt 10pt; border: 1px solid #e5e7eb; vertical-align: top; }
td { padding: 7pt 10pt; border: 1px solid #e5e7eb; color: #374151; vertical-align: top; }
tbody tr:nth-child(even) { background-color: #fafafa; }
blockquote { margin: 14pt 0; padding: 10pt 16pt; border-left: 4px solid #2563eb; background-color: #eff6ff; color: #1e40af; orphans: 2; widows: 2; page-break-inside: avoid; }
blockquote p:last-child { margin-bottom: 0; }
blockquote pre { color: #1e40af; background-color: rgba(255,255,255,0.6); }
pre { margin: 14pt 0; padding: 12pt 14pt; background-color: #1e293b; color: #e2e8f0; border-radius: 6px; font-family: 'JetBrains Mono','SF Mono',Monaco,'Cascadia Code',Consolas,monospace; font-size: 9pt; line-height: 1.55; overflow-x: auto; white-space: pre; word-wrap: normal; tab-size: 2; page-break-inside: avoid !important; orphans: 4 !important; widows: 4 !important; }
code { font-family: 'JetBrains Mono','SF Mono',Monaco,'Cascadia Code',Consolas,monospace; font-size: 0.88em; }
p code, li code, td code, th code:not(pre code) { background-color: #f3f4f6; color: #dc2626; padding: 2pt 5pt; border-radius: 3pt; font-size: 0.9em; }
/* === Syntax highlighting — highlight.js token colours ===
   Identical palette used in globals.css for the preview renderer.
   markdownToHtml() emits <code class="hljs language-X"> inside bare
   <pre> elements; no .code-block-wrapper wrapper div is generated. */
.hljs{background:#1e293b;color:#e2e8f0}
.hljs-keyword{color:#c084fc;font-weight:500}.hljs-built_in{color:#38bdf8}.hljs-type{color:#fb923c}.hljs-literal{color:#38bdf8}.hljs-number{color:#fb923c}.hljs-string{color:#4ade80}.hljs-regexp{color:#4ade80}.hljs-symbol{color:#c084fc}.hljs-class{color:#fb923c}.hljs-function{color:#60a5fa}.hljs-title{color:#60a5fa}.hljs-params{color:#e2e8f0}.hljs-comment{color:#64748b;font-style:italic}.hljs-doctag{color:#64748b;font-style:italic}.hljs-attr{color:#f97316}.hljs-attribute{color:#f97316}.hljs-variable{color:#e2e8f0}.hljs-bullet{color:#38bdf8}.hljs-name{color:#67e8f9}.hljs-tag{color:#67e8f9}.hljs-selector-tag{color:#fb923c}.hljs-selector-id{color:#60a5fa}.hljs-selector-class{color:#4ade80}.hljs-meta{color:#94a3b8}.hljs-operator{color:#e2e8f0}.hljs-punctuation{color:#94a3b8}.hljs-property{color:#60a5fa}.hljs-template-variable{color:#4ade80}.hljs-addition{background-color:#052e16;color:#86efac;display:inline-block;width:100%}.hljs-deletion{background-color:#450a0a;color:#fca5a5;display:inline-block;width:100%}.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:700}
/* === New elements emitted by markdownToHtml() pipeline === */
/* Images — markdownToHtml correctly produces <img> for ![alt](url);
   customRenderMarkdown() previously dropped images silently. */
img { max-width: 100%; height: auto; display: block; margin: 12pt auto; page-break-inside: avoid; }
/* Strikethrough — markdownToHtml produces <del>; old parser emitted
   raw ~~text~~ characters. */
del { text-decoration: line-through; color: #6b7280; }
/* Task lists — markdownToHtml produces .contains-task-list and
   .task-list-item with <input type="checkbox" disabled>.
   Old parser rendered [ ] / [x] as literal text characters. */
.contains-task-list { list-style: none; padding-left: 0; }
.task-list-item { padding-left: 0; }
.task-list-item input[type="checkbox"] { margin-right: 6pt; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
hr { border: none; border-top: 2px dashed #d1d5db; margin: 20pt 0; page-break-after: avoid; }
h1,h2,h3{page-break-after:avoid}
ul,ol,tr,blockquote,pre,figure,img{page-break-inside:avoid}
table{border-collapse:collapse;width:100%}
.pdf-footer{margin-top:30pt;padding-top:12pt;border-top:1px solid #e5e7eb;font-size:8pt;color:#9ca3af;text-align:center;page-break-inside:avoid}
@page:first{margin-top:15mm}
body.margin-narrow@page{margin:12mm 10mm!important}
body.orientation-landscape@page{size:A4 landscape!important}
body.dark-mode body{background-color:#0f172a;color:#e2e8f0}
body.dark-mode pre{background-color:#020617;border-color:#334155}
body.dark-mode th,body.dark-mode td{border-color:#334155;color:#cbd5e1}
body.dark-mode h1,body.dark-mode h2,body.dark-mode h3{color:#f1f5f9;border-color:#334155}
body.dark-mode blockquote{border-color:#3b82f6;background-color:#172554;color:#93c5fd}
`;

function buildPdfTemplate(vars: TemplateVars): string {
  let css = PDF_CSS.replace("$FONT_SIZE", String(vars.fontSize));
  
  // Build HTML using string concatenation to avoid template literal escaping issues
  const lines: string[] = [];
  var bodyClasses = [vars.marginClass, vars.orientationClass, vars.darkModeClass].filter(Boolean).join(" ");

  lines.push("<!DOCTYPE html>");
  lines.push('<html lang="en">');
  lines.push("<head>");
  lines.push('  <meta charset="UTF-8">');
  lines.push('  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
  lines.push("  <title>" + escapeHtml(vars.title) + "</title>");
  lines.push('  <link rel="preconnect" href="https://fonts.googleapis.com">');
  lines.push('  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
  lines.push('<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">');
  lines.push("  <style>" + css + "</style>");
  lines.push("</head>");

  lines.push('<body class="' + bodyClasses + '">');
  lines.push('  <div class="pdf-document">');

  if (vars.includeLogo) {
    lines.push(
      "  <div style='display:flex;align-items:center;justify-content:space-between;padding-bottom:16pt;border-bottom:1px solid #e5e7eb;margin-bottom:24pt;page-break-after:avoid;'>" +
      "    <div style='display:flex;align-items:center;gap:10pt;'>" +
      "      <svg width='28' height='28' viewBox='0 0 24 24' fill='none'><rect width='24' height='24' rx='6' fill='#111827'/><path d='M7 8h4M7 12h10M7 16h6' stroke='white' stroke-width='1.5' stroke-linecap='round'/><rect x='14' y='5' width='5' height='5' rx='1.5' fill='#2563eb'/></svg>" +
      "      <span style='font-size:11pt;font-weight:700;letter-spacing:-0.02em;color:#111827;'>Chat2PDF</span>" +
      "    </div>" +
      "    <div style='font-size:8pt;color:#9ca3af;'>" + "Generated " + vars.generatedAt + "</div>" +
      "  </div>"
    );
  }

  lines.push("  <h1>" + escapeHtml(vars.title) + "</h1>");
  lines.push("  <div class='markdown-body'>" + vars.bodyContent + "</div>");

  lines.push(
    "  <div class='pdf-footer'>" +
    "    <p style='margin:0;'>" + "Exported by Chat2PDF &mdash; " + vars.generatedAt + "</p>" +
    "    <p style='margin:4pt 0 0 0;color:#d1d5db;'>This document was auto-generated from an AI conversation.</p>" +
    "  </div>"
  );

  lines.push("  </div>");
  lines.push("</body>");
  lines.push("</html>");

  return lines.join("\n");
}
