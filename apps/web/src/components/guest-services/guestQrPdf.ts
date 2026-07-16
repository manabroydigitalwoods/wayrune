import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

export async function downloadLocationQrPdf(input: {
  businessName: string;
  label: string;
  publicPath: string;
}) {
  const url = `${window.location.origin}${input.publicPath}`;
  const dataUrl = await QRCode.toDataURL(url, {
    width: 512,
    margin: 1,
    color: { dark: '#1a120c', light: '#faf6ef' },
  });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(250, 246, 239);
  doc.rect(0, 0, w, doc.internal.pageSize.getHeight(), 'F');
  doc.setTextColor(26, 18, 12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(input.businessName, w / 2, 22, { align: 'center', maxWidth: w - 24 });
  doc.setFontSize(14);
  doc.text(input.label, w / 2, 34, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Scan to order', w / 2, 44, { align: 'center' });
  const qrSize = 72;
  doc.addImage(dataUrl, 'PNG', (w - qrSize) / 2, 52, qrSize, qrSize);
  doc.setFontSize(8);
  doc.setTextColor(90, 111, 106);
  doc.text(url, w / 2, 134, { align: 'center', maxWidth: w - 20 });
  doc.save(`${input.label.replace(/\s+/g, '-').toLowerCase()}-qr.pdf`);
}

export async function downloadAllLocationQrPdf(
  businessName: string,
  locations: Array<{ label: string; publicPath: string }>,
) {
  if (!locations.length) return;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
  for (let i = 0; i < locations.length; i++) {
    if (i > 0) doc.addPage();
    const loc = locations[i]!;
    const url = `${window.location.origin}${loc.publicPath}`;
    const dataUrl = await QRCode.toDataURL(url, {
      width: 512,
      margin: 1,
          color: { dark: '#1a120c', light: '#faf6ef' },
        });
    const w = doc.internal.pageSize.getWidth();
    doc.setFillColor(250, 246, 239);
    doc.rect(0, 0, w, doc.internal.pageSize.getHeight(), 'F');
    doc.setTextColor(26, 18, 12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(businessName, w / 2, 22, { align: 'center', maxWidth: w - 24 });
    doc.setFontSize(14);
    doc.text(loc.label, w / 2, 34, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Scan to order', w / 2, 44, { align: 'center' });
    const qrSize = 72;
    doc.addImage(dataUrl, 'PNG', (w - qrSize) / 2, 52, qrSize, qrSize);
    doc.setFontSize(8);
    doc.setTextColor(90, 111, 106);
    doc.text(url, w / 2, 134, { align: 'center', maxWidth: w - 20 });
  }
  doc.save(`${businessName.replace(/\s+/g, '-').toLowerCase()}-all-qr.pdf`);
}
