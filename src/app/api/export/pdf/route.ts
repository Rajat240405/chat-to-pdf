import { NextRequest, NextResponse } from "next/server";
import { generatePdf } from "@/lib/pdf-generator";
import { mockDocuments, type ConversationDocument } from "@/lib/mock-data";

/**
 * POST /api/export/pdf
 *
 * Generates a professional PDF from mock conversation data.
 * 
 * Request body (optional):
 *   - documentId: string — Which document to export (default: first)
 *   - options: PdfGenerationOptions for customization
 *
 * Returns: PDF binary file with appropriate headers
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const documentId = body.documentId || "doc-001";

    let doc: ConversationDocument | undefined;

    if (
      typeof body.content !== "string" ||
      body.content.trim().length === 0
    ) {
      doc = mockDocuments.find((d) => d.id === documentId);

      if (!doc) {
        return NextResponse.json(
          {
            error: "Document not found",
            availableIds: mockDocuments.map((d) => d.id),
          },
          { status: 404 }
        );
      }
    }
    // content override: when the client sends filtered markdown (e.g. "show code
    // only" mode), use that instead of the full renderedMarkdown so the PDF
    // matches exactly what the user saw in the preview.
    const content: string =
      typeof body.content === "string" && body.content.trim().length > 0
        ? body.content
        : doc!.renderedMarkdown;

    // Generate PDF with the provided options
    const pdfResult = await generatePdf({
      title: body.title || doc?.title || "Chat Export",
      content,
      fontSize: body.options?.fontSize ?? 12,
      margins: body.options?.margins ?? "standard",
      
      darkMode: body.options?.darkMode ?? false,
      includeLogo: body.options?.includeLogo !== false,
      showTimestamps: body.options?.showTimestamps ?? false,
    });

    // Build filename
    const sanitizedTitle = (body.title || doc?.title || "chat-export")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60);
    const filename = `${sanitizedTitle}.pdf`;

    // Return PDF as downloadable response
    const pdfUint8 = new Uint8Array(pdfResult.buffer);
    return new NextResponse(pdfUint8, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdfResult.buffer.length),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Page-Count": String(pdfResult.pageCount),
        "X-PDF-Version": "1.0.0",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: unknown) {
    

    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error: "Failed to generate PDF",
        details: message,
        suggestion:
          "Please check the server logs and verify Puppeteer/Chromium is installed.",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/export/pdf
 *
 * Quick test endpoint — generates a sample PDF using the default document.
 */
export async function GET() {
  try {
    const doc = mockDocuments[0]; // Default to first document

    const pdfResult = await generatePdf({
      title: doc.title,
      content: doc.renderedMarkdown,
      fontSize: 12,
      margins: "standard",
      
      darkMode: false,
      includeLogo: true,
    });

    const pdfUint8 = new Uint8Array(pdfResult.buffer);
    return new NextResponse(pdfUint8, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="promptpress-sample-export.pdf"',
        "X-Page-Count": String(pdfResult.pageCount),
      },
    });
  } catch (error: unknown) {
  console.error("========== PDF EXPORT ERROR ==========");
  console.error(error);
  console.error("======================================");

  const message =
    error instanceof Error ? error.message : String(error);

  return NextResponse.json(
    {
      error: message,
    },
    { status: 500 }
  );
}
}
