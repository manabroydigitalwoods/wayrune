import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { isAbsolute, join, resolve } from 'path';
import PDFDocument from 'pdfkit';
import { findMonorepoRoot, loadEnv } from '@wayrune/config';
import type { OrgBrandingPayload } from '../../common/customer-proposal';

export type ProposalPdfLine = {
  description: string;
  quantity: number;
  unitSell: number;
  lineSell: number;
};

export type ProposalPdfDayItem = {
  title: string;
  time?: string | null;
  place?: string | null;
};

export type ProposalPdfDayDetail = {
  title: string;
  items: ProposalPdfDayItem[];
};

export type ProposalPdfInput = {
  branding: OrgBrandingPayload;
  tripTitle: string;
  partyName?: string | null;
  quoteNumber: string;
  versionLabel?: string | null;
  currency: string;
  sellTotal: number;
  taxTotal?: number;
  validUntil?: string | null;
  terms?: string | null;
  destinations: string[];
  days: number;
  nights: number;
  /** @deprecated Prefer daysDetail — kept for callers that only pass titles. */
  dayTitles?: string[];
  daysDetail?: ProposalPdfDayDetail[];
  items: ProposalPdfLine[];
  formatMoney: (amount: number, currency: string) => string;
  /** Incomplete draft — watermark so it is not mistaken for a send-ready proposal. */
  draftIncomplete?: boolean;
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
    // Local path (absolute or under upload root / monorepo)
    const env = loadEnv();
    const uploadRoot = resolve(findMonorepoRoot(), env.uploadDir);
    const candidates = [
      isAbsolute(url) ? url : null,
      resolve(process.cwd(), url.replace(/^\//, '')),
      join(uploadRoot, url.replace(/^\//, '')),
      join(findMonorepoRoot(), url.replace(/^\//, '')),
    ].filter(Boolean) as string[];
    for (const path of candidates) {
      if (existsSync(path)) {
        return await readFile(path);
      }
    }
  } catch {
    // Skip logo — proposal still renders without it
  }
  return null;
}

function formatItemMeta(item: ProposalPdfDayItem): string {
  const bits = [item.time, item.place].filter(
    (v): v is string => typeof v === 'string' && Boolean(v.trim()),
  );
  return bits.length ? bits.join(' · ') : '';
}

/** Build a branded A4 proposal PDF buffer (Stage A download). */
export async function buildBrandedProposalPdf(input: ProposalPdfInput): Promise<Buffer> {
  const company = input.branding.companyName || 'Travel Agency';
  const footer =
    input.branding.previewFooter || `${company} · Proposal`;
  const logoBuffer = await loadLogoBuffer(input.branding.logoUrl);
  const primary = input.branding.primaryColor || '#0f6e56';

  const daysDetail: ProposalPdfDayDetail[] =
    input.daysDetail && input.daysDetail.length
      ? input.daysDetail
      : (input.dayTitles || []).map((title) => ({ title, items: [] }));

  return new Promise((resolvePromise, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title: `${input.quoteNumber} — ${input.tripTitle}`,
        Author: company,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolvePromise(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const left = doc.page.margins.left;
    const right = pageWidth - doc.page.margins.right;
    const contentWidth = right - left;
    const headerHeight = 72;

    const stampDraftWatermark = () => {
      if (!input.draftIncomplete) return;
      const cx = pageWidth / 2;
      const cy = doc.page.height / 2;
      doc.save();
      doc
        .fillColor('#b45309')
        .opacity(0.12)
        .font('Helvetica-Bold')
        .fontSize(36)
        .rotate(-32, { origin: [cx, cy] })
        .text('DRAFT — PRICING INCOMPLETE', cx - 220, cy - 18, {
          width: 440,
          align: 'center',
          lineBreak: false,
        });
      doc.restore();
      doc.opacity(1);
    };

    doc.on('pageAdded', () => {
      stampDraftWatermark();
    });

    doc.rect(0, 0, pageWidth, headerHeight).fill(primary);

    let textLeft = left;
    if (logoBuffer) {
      try {
        const logoMaxH = 44;
        const logoMaxW = 120;
        doc.image(logoBuffer, left, 14, {
          fit: [logoMaxW, logoMaxH],
        });
        textLeft = left + logoMaxW + 12;
      } catch {
        textLeft = left;
      }
    }

    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(company, textLeft, 22, { width: right - textLeft });
    doc
      .font('Helvetica')
      .fontSize(10)
      .text('Travel proposal', textLeft, 46, { width: right - textLeft });

    stampDraftWatermark();

    doc.fillColor('#111111');
    let y = 96;
    if (input.draftIncomplete) {
      doc
        .roundedRect(left, y, contentWidth, 28, 4)
        .fill('#fff7ed');
      doc
        .fillColor('#9a3412')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('Draft proposal — pricing incomplete', left + 10, y + 9, {
          width: contentWidth - 20,
        });
      y += 40;
    }

    doc.fillColor('#111111');
    doc.font('Helvetica-Bold').fontSize(16).text(input.tripTitle, left, y, { width: contentWidth });
    y = doc.y + 8;

    if (input.partyName) {
      doc.font('Helvetica').fontSize(11).fillColor('#444444').text(`Prepared for ${input.partyName}`, left, y);
      y = doc.y + 4;
    }

    const meta = [
      input.quoteNumber,
      input.versionLabel || null,
      `${input.days}D · ${input.nights}N`,
      input.destinations.length ? input.destinations.join(' · ') : null,
      input.validUntil ? `Valid until ${input.validUntil.slice(0, 10)}` : null,
    ]
      .filter(Boolean)
      .join('  ·  ');

    doc.font('Helvetica').fontSize(9).fillColor('#666666').text(meta, left, y, { width: contentWidth });
    y = doc.y + 16;

    if (daysDetail.length) {
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text('Itinerary', left, y);
      y = doc.y + 8;

      const maxDays = 14;
      for (const [i, day] of daysDetail.slice(0, maxDays).entries()) {
        if (y > doc.page.height - 140) {
          doc.addPage();
          y = doc.page.margins.top;
        }
        const dayTitle = day.title?.trim() || `Day ${i + 1}`;
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor('#111111')
          .text(`Day ${i + 1}: ${dayTitle}`, left, y, { width: contentWidth });
        y = doc.y + 3;

        const items = day.items.slice(0, 10);
        doc.font('Helvetica').fontSize(9).fillColor('#333333');
        if (!items.length) {
          y += 4;
          continue;
        }
        for (const item of items) {
          if (y > doc.page.height - 100) {
            doc.addPage();
            y = doc.page.margins.top;
          }
          const metaLine = formatItemMeta(item);
          const line = metaLine
            ? `• ${item.title}  (${metaLine})`
            : `• ${item.title}`;
          doc.text(line, left + 8, y, { width: contentWidth - 8 });
          y = doc.y + 2;
        }
        if (day.items.length > items.length) {
          doc
            .fillColor('#666666')
            .text(`  …and ${day.items.length - items.length} more`, left + 8, y, {
              width: contentWidth - 8,
            });
          y = doc.y + 2;
        }
        y += 6;
      }
      if (daysDetail.length > maxDays) {
        doc
          .fillColor('#666666')
          .font('Helvetica')
          .fontSize(9)
          .text(`…and ${daysDetail.length - maxDays} more days`, left, y);
        y = doc.y + 10;
      } else {
        y += 6;
      }
    }

    if (y > doc.page.height - 160) {
      doc.addPage();
      y = doc.page.margins.top;
    }

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text('Package pricing', left, y);
    y = doc.y + 8;

    const colDesc = left;
    const colQty = left + contentWidth * 0.55;
    const colUnit = left + contentWidth * 0.68;
    const colAmt = left + contentWidth * 0.82;

    doc.rect(left, y, contentWidth, 18).fill('#f3f4f6');
    doc
      .fillColor('#333333')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('Description', colDesc + 4, y + 5, { width: contentWidth * 0.5 })
      .text('Qty', colQty, y + 5, { width: 40 })
      .text('Unit', colUnit, y + 5, { width: 60 })
      .text('Amount', colAmt, y + 5, { width: right - colAmt, align: 'right' });
    y += 22;

    doc.font('Helvetica').fontSize(9).fillColor('#222222');
    for (const item of input.items) {
      if (y > doc.page.height - 120) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      const rowTop = y;
      doc.text(item.description || 'Line item', colDesc + 4, rowTop, {
        width: contentWidth * 0.5,
      });
      const rowBottom = Math.max(doc.y, rowTop + 12);
      doc.text(String(item.quantity), colQty, rowTop, { width: 40 });
      doc.text(input.formatMoney(item.unitSell, input.currency), colUnit, rowTop, { width: 60 });
      doc.text(input.formatMoney(item.lineSell, input.currency), colAmt, rowTop, {
        width: right - colAmt,
        align: 'right',
      });
      y = rowBottom + 6;
      doc
        .moveTo(left, y)
        .lineTo(right, y)
        .strokeColor('#e5e7eb')
        .lineWidth(0.5)
        .stroke();
      y += 4;
    }

    y += 8;
    if (input.taxTotal) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#555555')
        .text(`Tax: ${input.formatMoney(input.taxTotal, input.currency)}`, left, y, {
          width: contentWidth,
          align: 'right',
        });
      y = doc.y + 4;
    }
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(primary)
      .text(`Total: ${input.formatMoney(input.sellTotal, input.currency)}`, left, y, {
        width: contentWidth,
        align: 'right',
      });
    y = doc.y + 16;

    if (input.terms) {
      if (y > doc.page.height - 100) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111').text('Terms', left, y);
      y = doc.y + 4;
      doc.font('Helvetica').fontSize(9).fillColor('#444444').text(input.terms, left, y, {
        width: contentWidth,
      });
      y = doc.y + 12;
    }

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#888888')
      .text(footer, left, Math.max(y + 24, doc.page.height - 56), {
        width: contentWidth,
        align: 'center',
      });

    doc.end();
  });
}
