import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { Worker, Queue } from 'bullmq';
import nodemailer from 'nodemailer';
import { bootstrapEnv, findMonorepoRoot, loadEnv } from '@wayrune/config';
import {
  createRootLogger,
  runWithLogContextAsync,
} from '@wayrune/observability';
import {
  resolveCsvAttachmentsFromPayload,
  runFinanceReportPackDeliveries,
} from './finance-report-pack-delivery';
import { runOrgFxAutoRefresh } from './org-fx-auto-refresh';
import { runUnreadSlaAutomations } from './unread-sla-automation';

bootstrapEnv();
const env = loadEnv(true);
const logger = createRootLogger({
  // Always worker — shared envs may set LOG_SERVICE_NAME=api for the API process
  service: 'worker',
  appEnv: env.appEnv,
  level: env.logLevel,
  pretty: env.logPretty,
});

const prisma = new PrismaClient();
const uploadRoot = resolve(findMonorepoRoot(), env.uploadDir);

function smtpConfigured() {
  return Boolean(env.smtpHost);
}

async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string | null;
  inReplyTo?: string;
  attachments?: {
    filename: string;
    path?: string;
    content?: Buffer;
    contentType?: string;
  }[];
}) {
  if (!smtpConfigured()) {
    logger.info('Email skipped — SMTP_HOST not configured', {
      to: input.to,
      subject: input.subject,
      attachmentCount: input.attachments?.length ?? 0,
    });
    return { skipped: true as const };
  }
  const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: env.smtpUser
      ? { user: env.smtpUser, pass: env.smtpPass }
      : undefined,
  });
  const from = input.from || env.emailFrom || env.smtpUser || 'noreply@localhost';
  await transporter.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html || `<p>${input.text.replace(/\n/g, '<br/>')}</p>`,
    replyTo: input.replyTo || undefined,
    inReplyTo: input.inReplyTo || undefined,
    references: input.inReplyTo || undefined,
    attachments: input.attachments,
  });
  return { skipped: false as const };
}

async function hubspotFindContactIdByEmail(
  accessToken: string,
  email: string | null,
): Promise<string | null> {
  if (!email) return null;
  const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filterGroups: [
        { filters: [{ propertyName: 'email', operator: 'EQ', value: email }] },
      ],
      limit: 1,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { results?: Array<{ id?: string }> };
  return data.results?.[0]?.id ?? null;
}

async function processEvent(
  eventType: string,
  payload: Record<string, unknown>,
  organizationId: string,
  correlationId?: string,
  meta?: { outboxId?: string; attempts?: number },
) {
  const jobLog = logger.withContext({
    correlationId,
    organizationId,
  });
  jobLog.info('Processing job', {
    eventType,
    outboxId: meta?.outboxId,
    attempts: meta?.attempts,
  });

  switch (eventType) {
    case 'notification.email': {
      const userId = String(payload.userId || '');
      const user = userId
        ? await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, fullName: true },
          })
        : null;
      const to =
        (typeof payload.toEmail === 'string' && payload.toEmail) ||
        user?.email ||
        '';
      if (!to) {
        jobLog.warn('notification.email missing recipient', { userId });
        break;
      }
      const title = String(payload.title || 'Notification');
      const body = String(payload.body || '');
      const linkPath =
        typeof payload.linkPath === 'string' && payload.linkPath
          ? payload.linkPath
          : '';
      const text = linkPath ? `${body}\n\nOpen: ${linkPath}` : body;
      const result = await sendEmail({
        to,
        subject: title,
        text,
        replyTo:
          typeof payload.replyTo === 'string' ? payload.replyTo : null,
      });
      jobLog.info(result.skipped ? 'Email skipped (no SMTP)' : 'Email sent', {
        eventType,
        to,
      });
      break;
    }
    case 'quote.email': {
      const to = String(payload.toEmail || '');
      if (!to) {
        jobLog.warn('quote.email missing toEmail');
        break;
      }
      const versionId = String(payload.quotationVersionId || '');
      const subject = String(payload.subject || 'Your travel quotation');
      const body = String(
        payload.body ||
          'Please find attached our travel proposal. Reply to this email if you have any questions.',
      );
      const storageKey =
        typeof payload.storageKey === 'string' ? payload.storageKey : '';
      const fileName =
        typeof payload.fileName === 'string' && payload.fileName
          ? payload.fileName
          : 'proposal.pdf';
      const mimeType =
        typeof payload.mimeType === 'string' && payload.mimeType
          ? payload.mimeType
          : 'application/pdf';

      let attachments:
        | { filename: string; path: string; contentType: string }[]
        | undefined;
      if (storageKey) {
        const absolutePath = join(uploadRoot, storageKey);
        if (!existsSync(absolutePath)) {
          throw new Error(
            `quote.email PDF missing on disk: ${storageKey} (document ${String(payload.documentId || '')})`,
          );
        }
        attachments = [
          {
            filename: fileName,
            path: absolutePath,
            contentType: mimeType,
          },
        ];
      } else if (payload.documentId) {
        const doc = await prisma.document.findFirst({
          where: {
            id: String(payload.documentId),
            organizationId,
            deletedAt: null,
          },
          select: { storageKey: true, name: true, mimeType: true },
        });
        if (!doc?.storageKey) {
          throw new Error(
            `quote.email document not found: ${String(payload.documentId)}`,
          );
        }
        const absolutePath = join(uploadRoot, doc.storageKey);
        if (!existsSync(absolutePath)) {
          throw new Error(
            `quote.email PDF missing on disk: ${doc.storageKey}`,
          );
        }
        attachments = [
          {
            filename: doc.name || fileName,
            path: absolutePath,
            contentType: doc.mimeType || mimeType,
          },
        ];
      }

      const result = await sendEmail({
        to,
        subject,
        text: body,
        attachments,
      });
      jobLog.info(result.skipped ? 'Quote email skipped (no SMTP)' : 'Quote email sent', {
        to,
        quotationVersionId: versionId,
        attached: Boolean(attachments?.length),
        fileName: attachments?.[0]?.filename,
      });
      break;
    }
    case 'trip.vouchers.email': {
      const to = String(payload.toEmail || '');
      if (!to) {
        jobLog.warn('trip.vouchers.email missing toEmail');
        break;
      }
      const subject = String(payload.subject || 'Your hotel vouchers');
      const body = String(
        payload.body ||
          'Please find attached your hotel voucher(s). Reply to this email if you have any questions.',
      );
      const rawAttachments = Array.isArray(payload.attachments)
        ? payload.attachments
        : [];
      const attachments: {
        filename: string;
        path: string;
        contentType: string;
      }[] = [];
      for (const item of rawAttachments) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const storageKey =
          typeof row.storageKey === 'string' ? row.storageKey : '';
        const documentId =
          typeof row.documentId === 'string' ? row.documentId : '';
        let key = storageKey;
        let fileName =
          typeof row.fileName === 'string' && row.fileName
            ? row.fileName
            : 'voucher.pdf';
        let mimeType =
          typeof row.mimeType === 'string' && row.mimeType
            ? row.mimeType
            : 'application/pdf';
        if (!key && documentId) {
          const doc = await prisma.document.findFirst({
            where: { id: documentId, organizationId, deletedAt: null },
            select: { storageKey: true, name: true, mimeType: true },
          });
          if (!doc?.storageKey) {
            throw new Error(
              `trip.vouchers.email document not found: ${documentId}`,
            );
          }
          key = doc.storageKey;
          fileName = doc.name || fileName;
          mimeType = doc.mimeType || mimeType;
        }
        if (!key) continue;
        const absolutePath = join(uploadRoot, key);
        if (!existsSync(absolutePath)) {
          throw new Error(
            `trip.vouchers.email PDF missing on disk: ${key}`,
          );
        }
        attachments.push({
          filename: fileName,
          path: absolutePath,
          contentType: mimeType,
        });
      }
      if (!attachments.length) {
        throw new Error('trip.vouchers.email has no PDF attachments');
      }
      const result = await sendEmail({
        to,
        subject,
        text: body,
        attachments,
      });
      jobLog.info(
        result.skipped
          ? 'Voucher email skipped (no SMTP)'
          : 'Voucher email sent',
        {
          to,
          tripId: payload.tripId,
          attachmentCount: attachments.length,
        },
      );
      break;
    }
    case 'finance.report-pack.email': {
      const to = String(payload.toEmail || '');
      if (!to) {
        jobLog.warn('finance.report-pack.email missing toEmail');
        break;
      }
      const subject = String(payload.subject || 'Finance report');
      const body = String(
        payload.body || 'Please find attached your finance report CSV.',
      );
      const attachments = resolveCsvAttachmentsFromPayload(payload, uploadRoot);
      if (!attachments.length) {
        throw new Error('finance.report-pack.email has no CSV attachments');
      }
      const result = await sendEmail({
        to,
        subject,
        text: body,
        attachments,
      });
      jobLog.info(
        result.skipped
          ? 'Finance report pack email skipped (no SMTP)'
          : 'Finance report pack email sent',
        {
          to,
          packId: payload.packId,
          attachmentCount: attachments.length,
        },
      );
      break;
    }
    case 'pdf.generation':
      jobLog.info('Branded proposal PDF stored', {
        documentId: payload.documentId,
        mimeType: payload.mimeType,
      });
      break;
    case 'outbound.email.reply': {
      const to = String(payload.to || '');
      if (!to) {
        jobLog.warn('outbound.email.reply missing recipient');
        break;
      }
      const result = await sendEmail({
        to,
        subject: String(payload.subject || 'Re: your enquiry'),
        text: String(payload.text || ''),
        html: typeof payload.html === 'string' ? payload.html : undefined,
        inReplyTo: typeof payload.inReplyTo === 'string' ? payload.inReplyTo : undefined,
      });
      jobLog.info(result.skipped ? 'Email reply skipped (no SMTP)' : 'Email reply sent', { to });
      break;
    }
    case 'hubspot.contact.upsert': {
      const leadId = String(payload.leadId || '');
      if (!leadId) {
        jobLog.warn('hubspot.contact.upsert missing leadId');
        break;
      }
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { settingsJson: true },
      });
      const settings =
        org?.settingsJson && typeof org.settingsJson === 'object'
          ? (org.settingsJson as Record<string, unknown>)
          : {};
      const integrations =
        settings.integrations && typeof settings.integrations === 'object'
          ? (settings.integrations as Record<string, unknown>)
          : {};
      const hubspot =
        integrations.hubspot && typeof integrations.hubspot === 'object'
          ? (integrations.hubspot as Record<string, unknown>)
          : {};
      const accessToken = typeof hubspot.accessToken === 'string' ? hubspot.accessToken : '';
      if (!hubspot.enabled || !accessToken) {
        jobLog.info('hubspot.contact.upsert skipped — integration not configured');
        break;
      }
      const lead = await prisma.lead.findFirst({
        where: { id: leadId, organizationId },
        select: { email: true, phone: true, contactName: true, title: true },
      });
      if (!lead) {
        jobLog.warn('hubspot.contact.upsert lead not found', { leadId });
        break;
      }
      if (!lead.email && !lead.phone) {
        jobLog.info('hubspot.contact.upsert skipped — lead has no email/phone', { leadId });
        break;
      }
      const [firstName, ...rest] = (lead.contactName || lead.title || '').trim().split(/\s+/);
      const properties: Record<string, string> = {};
      if (lead.email) properties.email = lead.email;
      if (lead.phone) properties.phone = lead.phone;
      if (firstName) properties.firstname = firstName;
      if (rest.length) properties.lastname = rest.join(' ');

      const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties }),
        signal: AbortSignal.timeout(15_000),
      });
      // HubSpot returns 409 when the contact already exists by email — fall back to a search+update.
      if (res.status === 409) {
        const existingId = await hubspotFindContactIdByEmail(accessToken, lead.email);
        if (existingId) {
          const patchRes = await fetch(
            `https://api.hubapi.com/crm/v3/objects/contacts/${existingId}`,
            {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ properties }),
              signal: AbortSignal.timeout(15_000),
            },
          );
          if (!patchRes.ok) {
            throw new Error(`HubSpot contact PATCH failed: ${patchRes.status}`);
          }
        }
      } else if (!res.ok) {
        throw new Error(`HubSpot contact upsert failed: ${res.status}`);
      }
      jobLog.info('HubSpot contact synced', { leadId });
      break;
    }
    case 'HoldExpired':
    case 'inventory.hold.expire':
      jobLog.info('Hold expiry acknowledged', { holdId: payload.entityId ?? payload.holdId });
      break;
    case 'outbound.webhook': {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { settingsJson: true },
      });
      const settings =
        org?.settingsJson && typeof org.settingsJson === 'object'
          ? (org.settingsJson as Record<string, unknown>)
          : {};
      const integrations =
        settings.integrations && typeof settings.integrations === 'object'
          ? (settings.integrations as Record<string, unknown>)
          : {};
      const webhookUrl =
        typeof integrations.webhookUrl === 'string' ? integrations.webhookUrl.trim() : '';
      if (!webhookUrl) {
        jobLog.info('outbound.webhook skipped — no webhookUrl configured');
        break;
      }
      const body = {
        event: payload.event || 'interaction.ingested',
        organizationId,
        interactionId: payload.interactionId,
        channel: payload.channel,
        summary: payload.summary,
        partyId: payload.partyId,
      };
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) {
        throw new Error(`outbound.webhook POST failed: ${res.status}`);
      }
      jobLog.info('outbound.webhook delivered', { webhookUrl, status: res.status });
      break;
    }
    default:
      jobLog.warn('Unknown event type', { eventType });
  }
}

async function expireInventoryHolds() {
  const now = new Date();
  const due = await prisma.inventoryHold.findMany({
    where: { status: 'active', expiresAt: { lte: now } },
    take: 50,
  });
  for (const hold of due) {
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.inventoryHold.findFirst({
        where: { id: hold.id, status: 'active' },
      });
      if (!fresh) return;
      await tx.inventoryHold.update({
        where: { id: hold.id },
        data: { status: 'expired', releasedAt: now },
      });
      if (fresh.resourceType === 'dining_capacity') {
        await tx.diningCapacity.updateMany({
          where: { id: fresh.resourceId },
          data: { held: { decrement: Number(fresh.quantity) || 1 } },
        });
      }
      if (fresh.resourceType === 'experience_slot') {
        await tx.experienceSlot.updateMany({
          where: { id: fresh.resourceId },
          data: { held: { decrement: Number(fresh.quantity) || 1 } },
        });
      }
    });
    logger.info('Inventory hold expired', { holdId: hold.id, organizationId: hold.organizationId });
  }
}

function readNotifySettings(settingsJson: unknown) {
  const settings =
    settingsJson && typeof settingsJson === 'object'
      ? (settingsJson as Record<string, unknown>)
      : {};
  const n =
    settings.notifications && typeof settings.notifications === 'object'
      ? (settings.notifications as Record<string, unknown>)
      : {};
  return {
    settings,
    n,
    digestEnabled: n.digestEnabled === true,
    digestCadence: n.digestCadence === 'weekly' ? ('weekly' as const) : ('daily' as const),
    lastDigestAt:
      typeof n.lastDigestAt === 'string' && n.lastDigestAt
        ? new Date(n.lastDigestAt)
        : null,
    emailFromName:
      typeof n.emailFromName === 'string' && n.emailFromName.trim()
        ? n.emailFromName.trim()
        : null,
    emailReplyTo:
      typeof n.emailReplyTo === 'string' && n.emailReplyTo.trim()
        ? n.emailReplyTo.trim()
        : null,
  };
}

function digestDue(cadence: 'daily' | 'weekly', last: Date | null, now: Date) {
  if (!last) return true;
  const ms = now.getTime() - last.getTime();
  const day = 24 * 60 * 60 * 1000;
  return cadence === 'weekly' ? ms >= 7 * day : ms >= day;
}

/** Opt-in daily/weekly ops digest for org owners (B-PLT-02). */
async function runNotificationDigests() {
  const now = new Date();
  const orgs = await prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, settingsJson: true },
    take: 200,
  });

  for (const org of orgs) {
    const flags = readNotifySettings(org.settingsJson);
    if (!flags.digestEnabled) continue;
    if (!digestDue(flags.digestCadence, flags.lastDigestAt, now)) continue;

    const [openIncidents, overdueTasks, overduePayments, unread] = await Promise.all([
      prisma.serviceIncident.count({
        where: {
          organizationId: org.id,
          status: { in: ['open', 'investigating'] },
        },
      }),
      prisma.task.count({
        where: {
          organizationId: org.id,
          deletedAt: null,
          status: { not: 'done' },
          dueAt: { lt: now },
        },
      }),
      prisma.tripPayment.count({
        where: {
          organizationId: org.id,
          status: { in: ['scheduled', 'partial', 'overdue'] },
          dueAt: { lt: now },
        },
      }),
      prisma.notification.count({
        where: { organizationId: org.id, readAt: null },
      }),
    ]);

    const body = [
      `${openIncidents} open incident${openIncidents === 1 ? '' : 's'}`,
      `${overdueTasks} overdue task${overdueTasks === 1 ? '' : 's'}`,
      `${overduePayments} overdue payment${overduePayments === 1 ? '' : 's'}`,
      `${unread} unread notification${unread === 1 ? '' : 's'}`,
    ].join(' · ');

    const owners = await prisma.organizationMembership.findMany({
      where: {
        organizationId: org.id,
        isActive: true,
        deletedAt: null,
        isOwner: true,
      },
      select: { userId: true },
    });

    for (const owner of owners) {
      const n = await prisma.notification.create({
        data: {
          organizationId: org.id,
          userId: owner.userId,
          title: `${flags.digestCadence === 'weekly' ? 'Weekly' : 'Daily'} ops digest`,
          body,
          linkPath: '/',
          channel: 'both',
        },
      });
      await prisma.outboxEvent.create({
        data: {
          organizationId: org.id,
          eventType: 'notification.email',
          payloadJson: {
            notificationId: n.id,
            userId: owner.userId,
            title: n.title,
            body: n.body,
            linkPath: '/',
            fromName: flags.emailFromName || org.name || 'Wayrune',
            replyTo: flags.emailReplyTo,
          },
        },
      });
    }

    await prisma.organization.update({
      where: { id: org.id },
      data: {
        settingsJson: {
          ...flags.settings,
          notifications: {
            ...flags.n,
            lastDigestAt: now.toISOString(),
          },
        },
      },
    });

    logger.info('Notification digest sent', {
      organizationId: org.id,
      owners: owners.length,
      cadence: flags.digestCadence,
    });
  }
}

async function pollOutbox() {
  const pending = await prisma.outboxEvent.findMany({
    where: { status: 'pending', availableAt: { lte: new Date() } },
    take: 20,
    orderBy: { createdAt: 'asc' },
  });

  for (const event of pending) {
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { status: 'processing', attempts: { increment: 1 } },
    });

    try {
      await runWithLogContextAsync(
        {
          correlationId: event.correlationId ?? undefined,
          organizationId: event.organizationId,
        },
        async () => {
          await processEvent(
            event.eventType,
            event.payloadJson as Record<string, unknown>,
            event.organizationId,
            event.correlationId ?? undefined,
            { outboxId: event.id, attempts: event.attempts + 1 },
          );
        },
      );
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'completed', processedAt: new Date(), lastError: null },
      });
      logger.info('Outbox job completed', {
        outboxId: event.id,
        eventType: event.eventType,
        correlationId: event.correlationId,
        organizationId: event.organizationId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: event.attempts >= 5 ? 'failed' : 'pending',
          lastError: message,
          availableAt: new Date(Date.now() + Math.min(60_000, 2 ** event.attempts * 1000)),
        },
      });
      logger.error('Outbox processing failed', {
        outboxId: event.id,
        eventType: event.eventType,
        correlationId: event.correlationId,
        organizationId: event.organizationId,
        attempts: event.attempts + 1,
        err: err instanceof Error ? { message: err.message, stack: err.stack } : { message },
      });
    }
  }
}

async function main() {
  logger.info('Worker starting', { appEnv: env.appEnv, redisUrl: env.redisUrl ? '[set]' : '[missing]' });

  try {
    const bullWorker = new Worker(
      'outbox-dispatch',
      async (job) => {
        const data = job.data as {
          outboxId: string;
          eventType: string;
          payload: Record<string, unknown>;
          organizationId: string;
          correlationId?: string;
        };
        await runWithLogContextAsync(
          {
            correlationId: data.correlationId,
            organizationId: data.organizationId,
          },
          async () => {
            await processEvent(
              data.eventType,
              data.payload,
              data.organizationId,
              data.correlationId,
              { outboxId: data.outboxId, attempts: job.attemptsMade + 1 },
            );
            await prisma.outboxEvent.updateMany({
              where: { id: data.outboxId },
              data: { status: 'completed', processedAt: new Date() },
            });
          },
        );
      },
      { connection: { url: env.redisUrl } },
    );
    bullWorker.on('failed', (job, err) => {
      logger.error('Bull job failed', {
        jobId: job?.id,
        outboxId: (job?.data as { outboxId?: string } | undefined)?.outboxId,
        correlationId: (job?.data as { correlationId?: string } | undefined)?.correlationId,
        message: err.message,
        stack: err.stack,
      });
    });
  } catch (err) {
    logger.warn('BullMQ worker unavailable; relying on outbox poller', {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    const q = new Queue('outbox-dispatch', { connection: { url: env.redisUrl } });
    await q.close();
  } catch {
    /* optional */
  }

  setInterval(() => {
    pollOutbox().catch((err) =>
      logger.error('Poll failed', { message: err instanceof Error ? err.message : String(err) }),
    );
  }, 3000);

  setInterval(() => {
    expireInventoryHolds().catch((err) =>
      logger.error('Hold expiry failed', {
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }, 15_000);

  setInterval(() => {
    runNotificationDigests().catch((err) =>
      logger.error('Notification digest failed', {
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }, 60 * 60 * 1000);

  setInterval(() => {
    runFinanceReportPackDeliveries({
      prisma,
      sendEmail,
      log: logger,
    }).catch((err) =>
      logger.error('Finance report pack delivery failed', {
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }, 60 * 60 * 1000);

  setInterval(() => {
    runOrgFxAutoRefresh({ prisma, log: logger }).catch((err) =>
      logger.error('Org FX auto-refresh failed', {
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }, 60 * 60 * 1000);

  setInterval(() => {
    runUnreadSlaAutomations({ prisma, log: logger }).catch((err) =>
      logger.error('Unread SLA automation failed', {
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }, 15 * 60 * 1000);

  await pollOutbox();
  await expireInventoryHolds();
  await runNotificationDigests();
  await runFinanceReportPackDeliveries({
    prisma,
    sendEmail,
    log: logger,
  });
  await runOrgFxAutoRefresh({ prisma, log: logger }).catch((err) =>
    logger.error('Org FX auto-refresh failed', {
      message: err instanceof Error ? err.message : String(err),
    }),
  );
  await runUnreadSlaAutomations({ prisma, log: logger }).catch((err) =>
    logger.error('Unread SLA automation failed', {
      message: err instanceof Error ? err.message : String(err),
    }),
  );
}

main().catch((err) => {
  logger.fatal('Worker crashed', {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
