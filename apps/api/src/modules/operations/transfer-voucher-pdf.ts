import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { isAbsolute, join, resolve } from 'path';
import PDFDocument from 'pdfkit';
import { findMonorepoRoot, loadEnv } from '@wayrune/config';
import type { OrgBrandingPayload } from '../../common/customer-proposal';

export type TransferVoucherPdfInput = {
  branding: OrgBrandingPayload;
  tripNumber: string;
  tripTitle: string;
  partyName?: string | null;
  guestNames: string[];
  supplierName: string;
  fromPlace?: string | null;
  toPlace?: string | null;
  vehicleName?: string | null;
  vehicles: number;
  serviceDate?: string | null;
  confirmationRef?: string | null;
  agencyPhone?: string | null;
};

async function loadLogoBuffer(logoUrl: string | null | undefined): Promise<Buffer | null> {
  if (!logoUrl?.trim()) return null;
  const url = logoUrl.trim();
  try {
    if (/^https?:\/\//i.test(url)) {
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) return null;
      const ctype = res.headers.get('content-type') || '';
      if (ctype && !ctype.startsWith('image/')) return null;
      return Buffer.from(await res.arrayBuffer());
    }
    const env = loadEnv();
    const uploadRoot = resolve(findMonorepoRoot(), env.uploadDir);
    const candidates = [
      isAbsolute(url) ? url : null,
      resolve(process.cwd(), url.replace(/^\//, '')),
      join(uploadRoot, url.replace(/^\//, '')),
      join(findMonorepoRoot(), url.replace(/^\//, '')),
    ].filter(Boolean) as string[];
    for (const path of candidates) {
      if (existsSync(path)) return await readFile(path);
    }
  } catch {
    // Skip logo
  }
  return null;
}

function fmtDay(iso?: string | null): string {
  if (!iso?.trim()) return '—';
  const d = new Date(`${iso.trim().slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Customer-facing transfer voucher PDF (A4). Omits buy/sell and internal notes. */
export async function buildTransferVoucherPdf(
  input: TransferVoucherPdfInput,
): Promise<Buffer> {
  const company = input.branding.companyName || 'Travel Agency';
  const footer =
    input.branding.previewFooter || `${company} · Transfer voucher`;
  const primary = input.branding.primaryColor || '#0f6e56';
  const logoBuffer = await loadLogoBuffer(input.branding.logoUrl);

  const corridor =
    input.fromPlace?.trim() && input.toPlace?.trim()
      ? `${input.fromPlace.trim()} → ${input.toPlace.trim()}`
      : input.fromPlace?.trim() ||
        input.toPlace?.trim() ||
        input.supplierName;

  return new Promise((resolvePromise, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolvePromise(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width;
    const left = 48;
    const right = pageW - 48;
    const contentW = right - left;

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, left, 40, { height: 36 });
      } catch {
        // ignore bad logo bytes
      }
    }
    doc
      .fillColor(primary)
      .fontSize(18)
      .font('Helvetica-Bold')
      .text(company, left, logoBuffer ? 48 : 48, {
        width: contentW,
        align: logoBuffer ? 'right' : 'left',
      });

    doc.moveDown(logoBuffer ? 1.8 : 0.8);
    doc
      .fillColor('#111')
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('Transfer voucher', left, doc.y, { width: contentW });
    doc
      .moveDown(0.25)
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#555')
      .text('Present this voucher to your driver at pickup.', {
        width: contentW,
      });

    doc.moveDown(0.8);
    doc
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .strokeColor(primary)
      .lineWidth(1.5)
      .stroke();
    doc.moveDown(0.8);

    const row = (label: string, value: string) => {
      const y = doc.y;
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#666')
        .text(label.toUpperCase(), left, y, { width: 120 });
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#111')
        .text(value || '—', left + 128, y, { width: contentW - 128 });
      doc.moveDown(0.55);
    };

    row('Trip', `${input.tripNumber} · ${input.tripTitle}`);
    if (input.partyName?.trim()) row('Guest party', input.partyName.trim());
    if (input.guestNames.length) {
      row('Travellers', input.guestNames.join(', '));
    }
    row('Corridor', corridor);
    row('Operator', input.supplierName);
    if (input.vehicleName?.trim()) row('Vehicle', input.vehicleName.trim());
    row(
      'Vehicles',
      `${Math.max(1, input.vehicles)} vehicle${
        Math.max(1, input.vehicles) === 1 ? '' : 's'
      }`,
    );
    row('Service date', fmtDay(input.serviceDate));
    if (input.confirmationRef?.trim()) {
      row('Confirmation', input.confirmationRef.trim());
    }

    doc.moveDown(1);
    doc
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .strokeColor('#ddd')
      .lineWidth(0.5)
      .stroke();
    doc.moveDown(0.6);

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#555')
      .text(
        'This voucher confirms the transfer arranged by your travel agency. Pickup timing and meeting point may be shared separately. Please carry a valid photo ID matching the guest names.',
        left,
        doc.y,
        { width: contentW, align: 'left' },
      );

    if (input.agencyPhone?.trim()) {
      doc.moveDown(0.5);
      doc.text(`Agency contact: ${input.agencyPhone.trim()}`, {
        width: contentW,
      });
    }

    doc
      .fontSize(8)
      .fillColor('#888')
      .text(footer, left, doc.page.height - 56, {
        width: contentW,
        align: 'center',
      });

    doc.end();
  });
}
