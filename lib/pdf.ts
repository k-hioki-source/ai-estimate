// @ts-ignore
import PDFDocument from 'pdfkit/js/pdfkit.standalone.js';
import path from 'path';

type EstimatePdfData = {
  company?: string;
  name?: string;
  totalPrice: number;
  estimatedHours: number;
  confidenceScore?: number;
  confidenceLevel?: string;
  sourceType?: string;
  usage?: string;
  style?: string;
  quantity?: number;
  aiComment?: string;
  notes?: string;
};

export function createEstimatePdf(data: EstimatePdfData): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42 });
    const fontPath = path.join(
  process.cwd(),
  'public',
  'fonts',
  'NotoSansJP-Regular.ttf'
);


doc.registerFont('JP', fontPath);
doc.font('JP');
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const navy = '#111827';
    const blue = '#2563eb';
    const lightBlue = '#dbeafe';
    const gray = '#475569';

    // Header
    doc
      .fontSize(18)
      .fillColor(navy)
      .text('CREATE SUPPORT', 42, 36);

    doc
      .fontSize(10)
      .fillColor(gray)
      .text('AI Estimate Report', 42, 60);

    // Main dark result box
    doc
      .roundedRect(42, 90, 511, 210, 18)
      .fill('#142033');

    doc
      .fillColor('#dbeafe')
      .fontSize(10)
      .text('AI ESTIMATE RESULT', 68, 118);

    doc
      .fillColor('#ffffff')
      .fontSize(15)
      .text('Estimated Price', 68, 145);

    doc
      .fontSize(40)
      .text(`${data.totalPrice.toLocaleString()} JPY`, 68, 170);

    doc
      .fontSize(10)
      .fillColor('#cbd5e1')
      .text('Approximate estimate based on image and input conditions.', 68, 230);

    // Confidence card
    doc
      .roundedRect(340, 125, 180, 120, 12)
      .fill('#ffffff');

    doc
      .fillColor(blue)
      .fontSize(12)
      .text('AI Confidence', 362, 148);

    doc
      .fontSize(30)
      .text(`${data.confidenceScore ?? '-'}%`, 362, 170);

    doc
      .fontSize(10)
      .fillColor(navy)
      .text(`Level: ${data.confidenceLevel || '-'}`, 362, 212);

    // Conditions
    doc
      .roundedRect(42, 325, 245, 180, 14)
      .fill('#f8fafc');

    doc
      .fillColor(blue)
      .fontSize(12)
      .text('Estimate Conditions', 64, 350);

    doc
      .fillColor(navy)
      .fontSize(10)
      .text(`Company: ${data.company || '-'}`, 64, 382)
      .text(`Name: ${data.name || '-'}`, 64, 402)
      .text(`Source Type: ${data.sourceType || '-'}`, 64, 430)
      .text(`Usage: ${data.usage || '-'}`, 64, 450)
      .text(`Style: ${data.style || '-'}`, 64, 470)
      .text(`Quantity: ${data.quantity || 1}`, 64, 490);

    // Calculation
    doc
      .roundedRect(308, 325, 245, 180, 14)
      .fill('#f8fafc');

    doc
      .fillColor(blue)
      .fontSize(12)
      .text('Calculation', 330, 350);

    doc
      .fillColor(navy)
      .fontSize(10)
      .text(`Estimated Hours: ${data.estimatedHours} h`, 330, 382)
      .text('Hourly Rate: 3,000 JPY / h', 330, 402)
      .text(`Price: ${data.totalPrice.toLocaleString()} JPY`, 330, 430);

    // Comment
    doc
      .roundedRect(42, 530, 511, 150, 14)
      .fill('#ffffff')
      .strokeColor(lightBlue)
      .stroke();

    doc
      .fillColor(blue)
      .fontSize(12)
      .text('AI Analysis Comment', 64, 552);

    doc
      .fillColor(navy)
      .fontSize(9)
      .text(data.aiComment || '-', 64, 578, {
        width: 465,
        lineGap: 4,
      });

    // Notes
    doc
      .fillColor(blue)
      .fontSize(12)
      .text('Notes', 64, 700);

    doc
      .fillColor(navy)
      .fontSize(9)
      .text(data.notes || '-', 64, 722, {
        width: 465,
        lineGap: 4,
      });

    // Footer
    doc
      .fillColor('#64748b')
      .fontSize(8)
      .text(
        'This document is an automatically generated estimate report. Final quotation may vary after confirmation.',
        42,
        790,
        { width: 511, align: 'center' }
      );

    doc.end();
  });
}