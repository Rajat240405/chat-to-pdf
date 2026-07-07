import fs from "fs";
import path from "path";
import { markdownToHtml } from "@/lib/markdown-to-html";

// ============================================================
// PromptPress — PDF Generator
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
  
  /** Enable dark mode rendering */
  darkMode?: boolean;
  /** Include logo header */
  includeLogo?: boolean;
  
  /** Timestamps visibility */
  showTimestamps?: boolean;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

    console.log("========== generatePdf START ==========");
  console.log(options);
  
  const {
  title,
  content,
  fontSize = 12,
  margins = "standard",
  darkMode = false,
  includeLogo = true,
  showTimestamps = false,
} = options;

  // Step 1: Render markdown to syntax-highlighted HTML
  // Uses the shared unified/remark/rehype pipeline (markdownToHtml)
  // replacing the hand-rolled customRenderMarkdown() that previously
  // lived in this file. See src/lib/markdown-to-html.ts.
  let htmlBody = await markdownToHtml(content);

  console.log("STEP 1: markdownToHtml completed");

  htmlBody = htmlBody.replace(
    /<pre><code class="hljs language-([a-zA-Z0-9_-]+)">([\s\S]*?)<\/code><\/pre>/g,
    (_match, lang, code) => `
<div class="code-block-container">
  <div class="code-language-badge">${lang.toUpperCase()}</div>
  <pre><code class="hljs language-${lang}">${code}</code></pre>
</div>
`
  );
  console.log("STEP 2: code block replacement completed");

console.log("STEP 3: about to build template");
  // Step 2: Build complete PDF template HTML
  const fullHtml = buildPdfTemplate({
    bodyContent: htmlBody,
    title,
    fontSize: Math.round(fontSize),
    marginClass: margins === "narrow" ? "margin-narrow" : "",
    
    darkModeClass: darkMode ? "dark-mode" : "",
    includeLogo,
    showTimestamps,
    provider: "ChatGPT",
    model: "GPT-5.5",
    messageCount: content.match(/\*\*(User|Assistant)\*\*/g)?.length ?? 0,
    generatedAt: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),

  });

  console.log("STEP 4: template built");

  // Step 3: Write temp file and use Puppeteer to generate PDF
  const tempDir = "/tmp/promptpress-pdf-" + Date.now();
  fs.mkdirSync(tempDir, { recursive: true });

  const htmlPath = path.join(tempDir, "document.html");
  const pdfPath = path.join(tempDir, "output.pdf");

  try {
    // Write HTML input
    fs.writeFileSync(htmlPath, fullHtml, "utf-8");

    
    console.log("STEP 5: calling Puppeteer");


    // Generate PDF using Puppeteer
    await runPuppeteerConversion(htmlPath, pdfPath, margins);

    console.log("STEP 6: Puppeteer finished");

    // Read result
    if (!fs.existsSync(pdfPath)) {
      throw new Error("Puppeteer failed to generate PDF");
    }

    const pdfBuffer = fs.readFileSync(pdfPath);
console.log("STEP 7: PDF read");

    // Estimate page count based on content characteristics
    const estimatedPages = estimatePageCount(content)

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
    }  catch (err) {
    console.error("========== generatePdf FAILED ==========");
    console.error(err);
    throw err;
  }
  }
}

/**
 * Run Puppeteer conversion — uses direct Puppeteer API.
 */
async function runPuppeteerConversion(
  htmlPath: string,
  pdfPath: string,
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
    const pageMargins =
  _margins === "narrow"
    ? {
        top: "6mm",
        bottom: "6mm",
        left: "8mm",
        right: "8mm",
      }
    : {
        top: "14mm",
        bottom: "14mm",
        left: "18mm",
        right: "18mm",
      };


const pdfBuffer = await page.pdf({
  format: "A4",

  margin: pageMargins,

  printBackground: true,
  displayHeaderFooter: true,
  preferCSSPageSize: false,
  scale: 1,

  headerTemplate: `
    <div style="width:100%;"></div>
  `,

  footerTemplate: `
    <div style="
      width:100%;
      padding:0 20px;
      font-size:9px;
      color:#6b7280;
      text-align:center;
    ">
      Page <span class="pageNumber"></span> of
      <span class="totalPages"></span>
    </div>
  `,
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
function estimatePageCount(content: string): number {
  const baseCharsPerPage = 3000;

  const codeBlocks =
    content.match(/\`\`\`[\s\S]*?\`\`\`/g) || [];

  const extraCode = codeBlocks.reduce(
    (acc, cb) => acc + cb.split("\n").length * 20,
    0
  );

  const tblRows =
    (content.match(/\|/g) || []).length / 4;

  const effectiveLength =
    content.length + extraCode + tblRows * 50;

  return Math.max(
    1,
    Math.ceil(effectiveLength / baseCharsPerPage)
  );
}

interface TemplateVars {
  messageCount: number;
  bodyContent: string;
  title: string;
  fontSize: number;
  marginClass: string;
  
  darkModeClass: string;

  includeLogo: boolean;
  showTimestamps: boolean;

  generatedAt: string;

  provider?: string;
  model?: string;
}

const PDF_CSS = fs.readFileSync(
  path.join(process.cwd(), "src/lib/pdf-styles.css"),
  "utf8"
);


function buildPdfTemplate(vars: TemplateVars): string {

  

  let css = PDF_CSS.replace("$FONT_SIZE", String(vars.fontSize));

  // Build HTML using string concatenation to avoid template literal escaping issues
  const lines: string[] = [];
  var bodyClasses = [vars.marginClass,vars.darkModeClass].filter(Boolean).join(" ");

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

  lines.push(
  "  <div style='display:flex;align-items:center;justify-content:space-between;padding-bottom:16pt;border-bottom:1px solid #e5e7eb;margin-bottom:24pt;page-break-after:avoid;'>"
);

if (vars.includeLogo) {
  lines.push(
    "    <div style='display:flex;align-items:center;gap:10pt;'>" +
      "<svg width='28' height='28' viewBox='0 0 24 24' fill='none'>" +
      "<rect width='24' height='24' rx='6' fill='#111827'/>" +
      "<path d='M7 8h4M7 12h10M7 16h6' stroke='white' stroke-width='1.5' stroke-linecap='round'/>" +
      "<rect x='14' y='5' width='5' height='5' rx='1.5' fill='#2563eb'/>" +
      "</svg>" +
      "<span style='font-size:11pt;font-weight:700;color:#111827;'>PromptPress</span>" +
    "</div>"
  );
} else {
  lines.push("<div></div>");
}

if (vars.showTimestamps) {
  lines.push(
    "<div style='font-size:8pt;color:#9ca3af;'>Generated " +
      vars.generatedAt +
      "</div>"
  );
}

lines.push("</div>");

  lines.push(`
<div class="pdf-hero">
  <div class="pdf-hero-title">
    ${escapeHtml(vars.title)}
  </div>

  <div class="pdf-meta-row">
    ${vars.provider ?? "Unknown"} •
    ${vars.model ?? "Unknown"} •
    ${vars.messageCount ?? 0} messages
    ${
      vars.showTimestamps
        ? ` • ${vars.generatedAt}`
        : ""
    }
  </div>
</div>
`);
  const cleanedBody = vars.bodyContent.replace(
    new RegExp(`^<h1>${escapeRegExp(vars.title)}</h1>\\s*`, "i"),
    ""
  );

  lines.push(`
  <hr class="conversation-start-divider">

  <div class="chat-transcript">
    <div class="markdown-body">
      ${cleanedBody}
    </div>
  </div>
`);



  lines.push(
  "  <div class='pdf-footer'>" +
  "    <p style='margin:0;'>" +
  "Exported by PromptPress" +
  (vars.showTimestamps ? " &mdash; " + vars.generatedAt : "") +
  "</p>" +
  "    <p style='margin:4pt 0 0 0;color:#d1d5db;'>This document was auto-generated from an AI conversation.</p>" +
  "  </div>"
);

  lines.push("  </div>");
  lines.push("</body>");
  lines.push("</html>");

  return lines.join("\n");
}
