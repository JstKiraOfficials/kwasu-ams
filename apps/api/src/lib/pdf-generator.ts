/**
 * @file pdf-generator.ts
 * @module lib
 *
 * PDF generation utility using `pdfkit`.
 *
 * Generates PDF buffers for reports, certificates, and NUC packages.
 * All generated PDFs embed a SHA-256 checksum in the footer.
 */

import { Buffer } from 'buffer';
import PDFDocument from 'pdfkit';
import { computeSha256 } from './checksum.js';

/**
 * Generates a PDF buffer from the provided content sections.
 *
 * The PDF includes a footer on every page with the document SHA-256 checksum.
 * The checksum is computed over the content string before PDF generation.
 *
 * @param title    - Document title displayed at the top of the first page.
 * @param sections - Array of `{ heading, body }` content sections.
 * @returns A promise resolving to `{ buffer, checksum }` — the PDF bytes and its SHA-256 hash.
 */
export async function generatePdf(
  title: string,
  sections: Array<{ heading: string; body: string }>,
): Promise<{ buffer: Buffer; checksum: string }> {
  // Compute checksum over the content (before PDF generation)
  const contentString = `${title}\n${sections.map((s) => `${s.heading}\n${s.body}`).join('\n')}`;
  const checksum = computeSha256(contentString);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), checksum }));
    doc.on('error', reject);

    // Title
    doc.fontSize(18).font('Helvetica-Bold').text(title, { align: 'center' });
    doc.moveDown();

    // Sections
    for (const section of sections) {
      doc.fontSize(13).font('Helvetica-Bold').text(section.heading);
      doc.fontSize(11).font('Helvetica').text(section.body);
      doc.moveDown();
    }

    // Footer with checksum on every page
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc
        .fontSize(8)
        .font('Helvetica')
        .text(`Document SHA-256: ${checksum}`, 50, doc.page.height - 40, {
          align: 'center',
          width: doc.page.width - 100,
        });
    }

    doc.end();
  });
}
