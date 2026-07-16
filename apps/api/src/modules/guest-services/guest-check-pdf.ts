import PDFDocument from 'pdfkit';

export type GuestCheckPdfInput = {
  businessName: string;
  locationLabel: string;
  documentNumber: string;
  currency: string;
  lines: Array<{ description: string; amount: number; taxAmount: number }>;
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
};

export async function buildGuestCheckPdf(input: GuestCheckPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text(input.businessName, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#444').text('Guest check', { align: 'center' });
    doc.moveDown(0.5);
    doc.fillColor('#000').fontSize(10);
    doc.text(`Location: ${input.locationLabel}`);
    doc.text(`Check #: ${input.documentNumber}`);
    doc.text(`Date: ${new Date().toLocaleString('en-IN')}`);
    doc.moveDown(0.6);
    doc.moveTo(36, doc.y).lineTo(doc.page.width - 36, doc.y).stroke('#ccc');
    doc.moveDown(0.4);

    for (const line of input.lines) {
      doc.text(line.description, { continued: false });
      doc.text(
        `${input.currency} ${(line.amount + line.taxAmount).toFixed(2)}`,
        { align: 'right' },
      );
      doc.moveDown(0.25);
    }

    doc.moveDown(0.3);
    doc.moveTo(36, doc.y).lineTo(doc.page.width - 36, doc.y).stroke('#ccc');
    doc.moveDown(0.4);
    doc.text(`Subtotal: ${input.currency} ${input.subtotal.toFixed(2)}`);
    doc.text(`Tax: ${input.currency} ${input.taxTotal.toFixed(2)}`);
    doc.fontSize(12).text(`Total: ${input.currency} ${input.total.toFixed(2)}`);
    doc.fontSize(10).text(`Paid: ${input.currency} ${input.amountPaid.toFixed(2)}`);
    doc.text(
      `Balance: ${input.currency} ${Math.max(0, input.total - input.amountPaid).toFixed(2)}`,
    );
    doc.moveDown(1);
    doc.fontSize(8).fillColor('#666').text('Not a tax e-invoice unless IRN is attached.', {
      align: 'center',
    });
    doc.end();
  });
}
