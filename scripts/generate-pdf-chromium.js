/**
 * Chromium-based PDF Generator
 * =============================
 * Standalone script invoked by pdf-generator.ts via execFileSync.
 * Uses Puppeteer to render HTML to a professional A4 PDF.
 *
 * Usage: node generate-pdf-chromium.js <input.html> <output.pdf>
 */

const puppeteer = require("puppeteer");
const path = require("path");

async function main() {
  const [htmlPath, pdfPath] = process.argv.slice(2);

  if (!htmlPath || !pdfPath) {
    console.error("Usage: node generate-pdf-chromium.js <input.html> <output.pdf>");
    process.exit(1);
  }

  // Read HTML file
  const fs = require("fs");
  const htmlContent = fs.readFileSync(htmlPath, "utf-8");

  if (htmlContent.length === 0) {
    console.error("Error: Input HTML file is empty");
    process.exit(1);
  }

  let browser;
  try {
    // Launch browser with optimized settings for server-side rendering
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--font-render-hinting=none",
        "--disable-features=TranslateUI",
        // Increase resource limits
        "--disable-web-security", // Needed for local file loading
        "--allow-file-access-from-files",
      ],
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });

    const page = await browser.newPage();

    // Configure page settings for high-quality PDF output
    await page.setViewport({
      width: 794, // A4 width at 96 DPI
      height: 1123, // A4 height at 96 DPI
      deviceScaleFactor: 1, // Use 1 for print (higher doesn't help PDFs)
    });

    // Set content and wait for fonts to load
    await page.setContent(htmlContent, {
      waitUntil: "networkidle0",
      timeout: 15000,
    });

    // Wait additional time for web fonts to load
    try {
      await page.evaluateHandle(
        'document.fonts.ready.then(() => { document.body.classList.add("fonts-loaded"); })'
      );
      await page.waitForFunction('document.fonts.status === "loaded"', {
        timeout: 10000,
      });
    } catch {
      // Fonts might not be ready but we'll proceed anyway
      console.warn("Warning: Font loading timeout - continuing with fallback fonts");
    }

    // Generate PDF with optimized settings
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: {
        // Margins are handled by @page CSS, so keep these minimal
        top: "5mm",
        bottom: "5mm",
        left: "5mm",
        right: "5mm",
      },
      printBackground: true,
      displayHeaderFooter: false, // We handle this in the template itself
      preferCSSPageSize: true, // Let our @page rules control size
      scale: 1.0,
      headerTemplate: "<div></div>", // Disable default header
      footerTemplate: "<div></div>", // Disable default footer
    });

    // Write PDF to output file
    fs.writeFileSync(pdfPath, pdfBuffer);

    // Log success info
    console.log(`PDF generated successfully: ${pdfPath}`);
    console.log(`File size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main().catch((error) => {
  console.error("Fatal error in PDF generation:", error.message);
  process.exit(1);
});
