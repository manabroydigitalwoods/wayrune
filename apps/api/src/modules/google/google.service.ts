import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { loadEnv } from '@wayrune/config';
import {
  GOOGLE_CONNECT_SCOPES,
  type BindGoogleLocationsSchema,
  type GoogleBusinessIngestSchema,
  type GoogleSheetsExportSchema,
  type GoogleSheetsImportSchema,
  type UpdateGoogleConnectionSettingsSchema,
} from '@wayrune/contracts';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/helpers';
import { LeadsService } from '../leads/leads.service';
import { InteractionsService } from '../interactions/interactions.service';
import { FilesService } from '../files/files.service';
import { decryptSecret, encryptSecret } from './google-crypto';

type BindLocationsInput = z.infer<typeof BindGoogleLocationsSchema>;
type UpdateSettingsInput = z.infer<typeof UpdateGoogleConnectionSettingsSchema>;
type GbpIngestInput = z.infer<typeof GoogleBusinessIngestSchema>;
type SheetsExportInput = z.infer<typeof GoogleSheetsExportSchema>;
type SheetsImportInput = z.infer<typeof GoogleSheetsImportSchema>;

const ALL_PRODUCT_SCOPES = [
  ...GOOGLE_CONNECT_SCOPES.business,
  ...GOOGLE_CONNECT_SCOPES.calendar,
  ...GOOGLE_CONNECT_SCOPES.drive,
  ...GOOGLE_CONNECT_SCOPES.sheets,
];

@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => LeadsService)) private leads: LeadsService,
    @Inject(forwardRef(() => InteractionsService)) private interactions: InteractionsService,
    @Inject(forwardRef(() => FilesService)) private files: FilesService,
  ) {}

  private oauthConfigured() {
    const env = loadEnv();
    return Boolean(env.googleOauthClientId && env.googleOauthClientSecret);
  }

  private connectRedirectUri() {
    const env = loadEnv();
    return `${env.oauthRedirectBase.replace(/\/$/, '')}/api/v1/integrations/google/callback`;
  }

  /** Start Connect Google consent (offline + product scopes). Separate from SSO login. */
  buildConnectUrl(user: AuthUser, extras?: { includeCalendar?: boolean; includeDrive?: boolean }) {
    if (!this.oauthConfigured()) {
      throw new BadRequestException('Google OAuth is not configured on the server');
    }
    const env = loadEnv();
    const scopes = new Set<string>(GOOGLE_CONNECT_SCOPES.business);
    if (extras?.includeCalendar !== false) {
      for (const s of GOOGLE_CONNECT_SCOPES.calendar) scopes.add(s);
    }
    if (extras?.includeDrive !== false) {
      for (const s of GOOGLE_CONNECT_SCOPES.drive) scopes.add(s);
      for (const s of GOOGLE_CONNECT_SCOPES.sheets) scopes.add(s);
    }
    const state = Buffer.from(
      JSON.stringify({
        organizationId: user.organizationId,
        userId: user.sub,
        t: Date.now(),
      }),
    ).toString('base64url');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', env.googleOauthClientId);
    url.searchParams.set('redirect_uri', this.connectRedirectUri());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', [...scopes].join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('state', state);
    return { url: url.toString() };
  }

  async handleConnectCallback(code: string | undefined, state: string | undefined) {
    if (!code) throw new BadRequestException('Missing OAuth code');
    if (!state) throw new BadRequestException('Missing OAuth state');
    let parsed: { organizationId?: string; userId?: string };
    try {
      parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as {
        organizationId?: string;
        userId?: string;
      };
    } catch {
      throw new BadRequestException('Invalid OAuth state');
    }
    if (!parsed.organizationId || !parsed.userId) {
      throw new BadRequestException('Invalid OAuth state');
    }

    const env = loadEnv();
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.googleOauthClientId,
        client_secret: env.googleOauthClientSecret,
        redirect_uri: this.connectRedirectUri(),
        grant_type: 'authorization_code',
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => '');
      this.logger.warn(`Google connect token exchange failed: ${tokenRes.status} ${text.slice(0, 200)}`);
      throw new BadRequestException('Google token exchange failed');
    }
    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (!tokenData.access_token) throw new BadRequestException('Google token exchange failed');

    const existing = await this.prisma.googleConnection.findUnique({
      where: { organizationId: parsed.organizationId },
    });
    const refreshPlain =
      tokenData.refresh_token ||
      (existing ? decryptSecret(existing.refreshTokenEnc) : null);
    if (!refreshPlain) {
      throw new BadRequestException(
        'Google did not return a refresh token. Disconnect any prior grant and try Connect again with consent.',
      );
    }

    let email: string | null = null;
    try {
      const ui = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (ui.ok) {
        const profile = (await ui.json()) as { email?: string };
        email = profile.email ?? null;
      }
    } catch {
      /* non-fatal */
    }

    const scopes = (tokenData.scope || ALL_PRODUCT_SCOPES.join(' ')).split(/\s+/).filter(Boolean);
    const expiry = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    const row = await this.prisma.googleConnection.upsert({
      where: { organizationId: parsed.organizationId },
      create: {
        organizationId: parsed.organizationId,
        connectedByUserId: parsed.userId,
        googleAccountEmail: email,
        refreshTokenEnc: encryptSecret(refreshPlain),
        accessTokenEnc: encryptSecret(tokenData.access_token),
        tokenExpiry: expiry,
        scopesJson: scopes,
        status: 'connected',
        calendarId: 'primary',
      },
      update: {
        connectedByUserId: parsed.userId,
        googleAccountEmail: email ?? undefined,
        refreshTokenEnc: encryptSecret(refreshPlain),
        accessTokenEnc: encryptSecret(tokenData.access_token),
        tokenExpiry: expiry,
        scopesJson: scopes,
        status: 'connected',
        lastError: null,
      },
    });

    return {
      organizationId: row.organizationId,
      googleAccountEmail: row.googleAccountEmail,
      scopes,
    };
  }

  async status(user: AuthUser) {
    const row = await this.prisma.googleConnection.findUnique({
      where: { organizationId: user.organizationId },
    });
    if (!row) {
      return {
        connected: false,
        oauthConfigured: this.oauthConfigured(),
      };
    }
    const scopes = Array.isArray(row.scopesJson) ? (row.scopesJson as string[]) : [];
    return {
      connected: row.status === 'connected',
      oauthConfigured: this.oauthConfigured(),
      googleAccountEmail: row.googleAccountEmail,
      status: row.status,
      scopes,
      locations: Array.isArray(row.locationsJson) ? row.locationsJson : [],
      calendarId: row.calendarId,
      driveRootFolderId: row.driveRootFolderId,
      useDriveAsFileStorage: row.useDriveAsFileStorage,
      syncFollowUpsToCalendar: row.syncFollowUpsToCalendar,
      lastSyncAt: row.lastSyncAt,
      lastError: row.lastError,
      capabilities: {
        business: scopes.some((s) => s.includes('business')),
        calendar: scopes.some((s) => s.includes('calendar')),
        drive: scopes.some((s) => s.includes('drive')),
        sheets: scopes.some((s) => s.includes('spreadsheets')),
      },
    };
  }

  async disconnect(user: AuthUser) {
    const row = await this.prisma.googleConnection.findUnique({
      where: { organizationId: user.organizationId },
    });
    if (!row) return { disconnected: true };
    try {
      const refresh = decryptSecret(row.refreshTokenEnc);
      const env = loadEnv();
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(10_000),
      }).catch(() => undefined);
      void env;
    } catch {
      /* still delete local row */
    }
    await this.prisma.googleConnection.delete({ where: { id: row.id } });
    return { disconnected: true };
  }

  async updateSettings(user: AuthUser, input: UpdateSettingsInput) {
    const row = await this.requireConnection(user.organizationId);
    return this.prisma.googleConnection.update({
      where: { id: row.id },
      data: {
        ...(input.calendarId !== undefined ? { calendarId: input.calendarId } : {}),
        ...(input.syncFollowUpsToCalendar !== undefined
          ? { syncFollowUpsToCalendar: input.syncFollowUpsToCalendar }
          : {}),
        ...(input.driveRootFolderId !== undefined
          ? { driveRootFolderId: input.driveRootFolderId }
          : {}),
        ...(input.useDriveAsFileStorage !== undefined
          ? { useDriveAsFileStorage: input.useDriveAsFileStorage }
          : {}),
      },
    });
  }

  private async requireConnection(organizationId: string) {
    const row = await this.prisma.googleConnection.findUnique({ where: { organizationId } });
    if (!row || row.status !== 'connected') {
      throw new BadRequestException('Connect Google first in Integrations');
    }
    return row;
  }

  /** Refresh access token using stored refresh token. */
  async getAccessToken(organizationId: string): Promise<string> {
    const row = await this.requireConnection(organizationId);
    if (
      row.accessTokenEnc &&
      row.tokenExpiry &&
      row.tokenExpiry.getTime() > Date.now() + 60_000
    ) {
      return decryptSecret(row.accessTokenEnc);
    }
    const env = loadEnv();
    const refresh = decryptSecret(row.refreshTokenEnc);
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.googleOauthClientId,
        client_secret: env.googleOauthClientSecret,
        refresh_token: refresh,
        grant_type: 'refresh_token',
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenRes.ok) {
      await this.prisma.googleConnection.update({
        where: { id: row.id },
        data: { status: 'error', lastError: `token_refresh_${tokenRes.status}` },
      });
      throw new BadRequestException('Google access token refresh failed — reconnect Google');
    }
    const data = (await tokenRes.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new BadRequestException('Google access token refresh failed');
    const expiry = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
    await this.prisma.googleConnection.update({
      where: { id: row.id },
      data: {
        accessTokenEnc: encryptSecret(data.access_token),
        tokenExpiry: expiry,
        status: 'connected',
        lastError: null,
      },
    });
    return data.access_token;
  }

  // ─── Phase 1: Google Business Profile ─────────────────────────────────

  async listLocations(user: AuthUser) {
    const access = await this.getAccessToken(user.organizationId);
    const accountsRes = await fetch(
      'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
      {
        headers: { Authorization: `Bearer ${access}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!accountsRes.ok) {
      const text = await accountsRes.text().catch(() => '');
      this.logger.warn(`GBP accounts list failed: ${accountsRes.status} ${text.slice(0, 200)}`);
      // Soft empty — UI can still bind via manual ingest / webhook while API access is pending
      return {
        locations: [],
        warning:
          accountsRes.status === 403
            ? 'Business Profile API not enabled or app not approved yet. You can still ingest via webhook.'
            : `Could not list locations (${accountsRes.status})`,
      };
    }
    const accountsPayload = (await accountsRes.json()) as {
      accounts?: Array<{ name?: string; accountName?: string }>;
    };
    const locations: Array<{ name: string; title: string; storeCode?: string }> = [];
    for (const account of accountsPayload.accounts ?? []) {
      if (!account.name) continue;
      const locRes = await fetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storeCode`,
        {
          headers: { Authorization: `Bearer ${access}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!locRes.ok) continue;
      const locPayload = (await locRes.json()) as {
        locations?: Array<{ name?: string; title?: string; storeCode?: string }>;
      };
      for (const loc of locPayload.locations ?? []) {
        if (!loc.name) continue;
        locations.push({
          name: loc.name,
          title: loc.title || loc.name,
          storeCode: loc.storeCode,
        });
      }
    }
    return { locations };
  }

  async bindLocations(user: AuthUser, input: BindLocationsInput) {
    const row = await this.requireConnection(user.organizationId);
    return this.prisma.googleConnection.update({
      where: { id: row.id },
      data: { locationsJson: input.locations as unknown as Prisma.InputJsonValue },
    });
  }

  /**
   * Ingest GBP message or review → Interaction (never Lead).
   * Used by webhook proxy and by syncReviews.
   */
  async ingestBusinessTouch(organizationId: string, input: GbpIngestInput) {
    await this.requireConnection(organizationId);
    const ratingBit =
      input.kind === 'review' && input.rating ? `★${input.rating} ` : '';
    return this.leads.ingestInboundTouch(organizationId, {
      channel: 'google_business',
      summary: `${ratingBit}${input.summary}`.trim(),
      contactName: input.contactName,
      email: input.email,
      phone: input.phone,
      acquisitionKey: 'google_business',
      idempotencyKey: `gbp:${input.kind}:${input.externalId}`,
      rawPayload: {
        direction: 'inbound',
        source: 'google_business',
        kind: input.kind,
        locationName: input.locationName,
        rating: input.rating,
        externalId: input.externalId,
        text: input.summary,
      },
    });
  }

  /** Poll Google reviews for bound locations and ingest new ones. */
  async syncReviews(user: AuthUser) {
    const row = await this.requireConnection(user.organizationId);
    const locations = Array.isArray(row.locationsJson)
      ? (row.locationsJson as Array<{ name: string; title?: string }>)
      : [];
    if (!locations.length) {
      throw new BadRequestException('Bind at least one Business Profile location first');
    }
    const access = await this.getAccessToken(user.organizationId);
    let ingested = 0;
    const errors: string[] = [];
    for (const loc of locations) {
      // Reviews API: accounts/.../locations/.../reviews
      const url = `https://mybusiness.googleapis.com/v4/${loc.name}/reviews`;
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${access}` },
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) {
          errors.push(`${loc.name}: HTTP ${res.status}`);
          continue;
        }
        const payload = (await res.json()) as {
          reviews?: Array<{
            reviewId?: string;
            comment?: string;
            starRating?: string;
            reviewer?: { displayName?: string };
          }>;
        };
        const starMap: Record<string, number> = {
          ONE: 1,
          TWO: 2,
          THREE: 3,
          FOUR: 4,
          FIVE: 5,
        };
        for (const review of payload.reviews ?? []) {
          if (!review.reviewId) continue;
          const rating = review.starRating ? starMap[review.starRating] : undefined;
          await this.ingestBusinessTouch(user.organizationId, {
            kind: 'review',
            locationName: loc.name,
            summary: review.comment?.trim() || `New ${rating ?? ''}★ review`,
            contactName: review.reviewer?.displayName ?? null,
            externalId: review.reviewId,
            rating,
          });
          ingested += 1;
        }
      } catch (err) {
        errors.push(`${loc.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await this.prisma.googleConnection.update({
      where: { id: row.id },
      data: {
        lastSyncAt: new Date(),
        lastError: errors.length ? errors.slice(0, 3).join('; ') : null,
      },
    });
    return { ingested, errors };
  }

  async replyToBusinessInteraction(user: AuthUser, interactionId: string, text: string) {
    const interaction = await this.prisma.interaction.findFirst({
      where: {
        id: interactionId,
        organizationId: user.organizationId,
        channel: 'google_business',
      },
    });
    if (!interaction) throw new NotFoundException('Interaction not found');
    const raw = (interaction.rawPayloadJson ?? {}) as Record<string, unknown>;
    const externalId = typeof raw.externalId === 'string' ? raw.externalId : null;
    const locationName = typeof raw.locationName === 'string' ? raw.locationName : null;
    const kind = raw.kind === 'review' ? 'review' : 'message';
    const trimmed = text.trim();

    // Stay on the same conversation (do not ingestInboundTouch — that creates orphan threads)
    const outbound = await this.interactions.create(user, {
      channel: 'google_business',
      acquisitionSourceKey: interaction.acquisitionSourceKey,
      partyId: interaction.partyId,
      leadId: interaction.leadId,
      inquiryId: interaction.inquiryId,
      conversationId: interaction.conversationId,
      outcome: 'pending',
      unread: false,
      summary: trimmed.slice(0, 240),
      staffUserId: user.sub,
      rawPayloadJson: {
        direction: 'outbound',
        source: 'google_business',
        inReplyTo: interactionId,
        kind,
        text: trimmed,
      },
    });

    if (kind === 'review' && locationName && externalId) {
      try {
        const access = await this.getAccessToken(user.organizationId);
        await fetch(
          `https://mybusiness.googleapis.com/v4/${locationName}/reviews/${externalId}/reply`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${access}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ comment: trimmed }),
            signal: AbortSignal.timeout(15_000),
          },
        );
      } catch (err) {
        this.logger.warn(
          `GBP review reply API failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { queued: true, interactionId: outbound.id, demo: !locationName || !externalId };
  }

  // ─── Phase 2: Calendar ────────────────────────────────────────────────

  async syncTaskToCalendar(
    organizationId: string,
    task: { id: string; title: string; description?: string | null; dueAt?: Date | null },
  ) {
    const row = await this.prisma.googleConnection.findUnique({
      where: { organizationId },
    });
    if (!row || row.status !== 'connected' || !row.syncFollowUpsToCalendar || !task.dueAt) {
      return { synced: false as const };
    }
    const scopes = Array.isArray(row.scopesJson) ? (row.scopesJson as string[]) : [];
    if (!scopes.some((s) => s.includes('calendar'))) return { synced: false as const };

    try {
      const access = await this.getAccessToken(organizationId);
      const calendarId = encodeURIComponent(row.calendarId || 'primary');
      const start = task.dueAt;
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${access}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary: task.title,
            description: task.description || `Wayrune task ${task.id}`,
            start: { dateTime: start.toISOString() },
            end: { dateTime: end.toISOString() },
            extendedProperties: {
              private: { codepoetryTaskId: task.id },
            },
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(`Calendar create failed: ${res.status} ${text.slice(0, 200)}`);
        return { synced: false as const, error: `http_${res.status}` };
      }
      const event = (await res.json()) as { id?: string; htmlLink?: string };
      return { synced: true as const, eventId: event.id, htmlLink: event.htmlLink };
    } catch (err) {
      this.logger.warn(
        `Calendar sync error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { synced: false as const };
    }
  }

  /** All-day (or timed) event for a Travel Request date window. */
  async syncTravelRequestWindow(
    organizationId: string,
    inquiry: {
      id: string;
      inquiryNumber: string;
      startDate?: Date | null;
      endDate?: Date | null;
    },
  ) {
    const row = await this.prisma.googleConnection.findUnique({
      where: { organizationId },
    });
    if (!row || row.status !== 'connected' || !row.syncFollowUpsToCalendar || !inquiry.startDate) {
      return { synced: false as const };
    }
    const scopes = Array.isArray(row.scopesJson) ? (row.scopesJson as string[]) : [];
    if (!scopes.some((s) => s.includes('calendar'))) return { synced: false as const };

    try {
      const access = await this.getAccessToken(organizationId);
      const calendarId = encodeURIComponent(row.calendarId || 'primary');
      const startDay = inquiry.startDate.toISOString().slice(0, 10);
      const endExclusive = inquiry.endDate
        ? new Date(inquiry.endDate.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        : new Date(inquiry.startDate.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${access}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary: `Travel request ${inquiry.inquiryNumber}`,
            description: `Wayrune travel request ${inquiry.id}`,
            start: { date: startDay },
            end: { date: endExclusive },
            extendedProperties: {
              private: { codepoetryInquiryId: inquiry.id },
            },
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(`TR calendar create failed: ${res.status} ${text.slice(0, 200)}`);
        return { synced: false as const, error: `http_${res.status}` };
      }
      const event = (await res.json()) as { id?: string; htmlLink?: string };
      return { synced: true as const, eventId: event.id, htmlLink: event.htmlLink };
    } catch (err) {
      this.logger.warn(
        `TR calendar sync error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { synced: false as const };
    }
  }

  // ─── Phase 3: Drive + Sheets ──────────────────────────────────────────

  async ensureDriveFolder(organizationId: string): Promise<string> {
    const row = await this.requireConnection(organizationId);
    if (row.driveRootFolderId) return row.driveRootFolderId;
    const access = await this.getAccessToken(organizationId);
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    const res = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `${org?.name || 'Agency'} — Wayrune`,
        mimeType: 'application/vnd.google-apps.folder',
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new BadRequestException(`Could not create Drive folder (${res.status})`);
    }
    const folder = (await res.json()) as { id?: string };
    if (!folder.id) throw new BadRequestException('Drive folder create returned no id');
    await this.prisma.googleConnection.update({
      where: { id: row.id },
      data: { driveRootFolderId: folder.id },
    });
    return folder.id;
  }

  async uploadBufferToDrive(
    organizationId: string,
    input: { fileName: string; mimeType: string; buffer: Buffer },
  ) {
    const folderId = await this.ensureDriveFolder(organizationId);
    const access = await this.getAccessToken(organizationId);
    const metadata = {
      name: input.fileName,
      parents: [folderId],
    };
    const boundary = `cp_${Date.now()}`;
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      ),
      Buffer.from(
        `--${boundary}\r\nContent-Type: ${input.mimeType}\r\nContent-Transfer-Encoding: binary\r\n\r\n`,
      ),
      input.buffer,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new BadRequestException(`Drive upload failed (${res.status}): ${text.slice(0, 200)}`);
    }
    return (await res.json()) as { id: string; name: string; webViewLink?: string };
  }

  async saveDocumentToDrive(user: AuthUser, documentId: string) {
    const { buffer, mimeType, fileName } = await this.files.readBuffer(
      user.organizationId,
      documentId,
    );
    const uploaded = await this.uploadBufferToDrive(user.organizationId, {
      fileName,
      mimeType,
      buffer,
    });
    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        driveFileId: uploaded.id,
        driveWebViewLink: uploaded.webViewLink ?? null,
        storageProvider: 'drive',
      },
    });
    return { driveFileId: uploaded.id, webViewLink: uploaded.webViewLink, name: uploaded.name };
  }

  /** Whether this org stores new uploads in Google Drive. */
  async isDriveFileStorageEnabled(organizationId: string): Promise<boolean> {
    const row = await this.prisma.googleConnection.findUnique({
      where: { organizationId },
      select: { status: true, useDriveAsFileStorage: true, scopesJson: true },
    });
    if (!row || row.status !== 'connected' || !row.useDriveAsFileStorage) return false;
    const scopes = Array.isArray(row.scopesJson) ? (row.scopesJson as string[]) : [];
    return scopes.some((s) => s.includes('drive'));
  }

  async downloadDriveFile(organizationId: string, driveFileId: string): Promise<Buffer> {
    const access = await this.getAccessToken(organizationId);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${access}` },
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!res.ok) {
      throw new BadRequestException(`Drive download failed (${res.status})`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  async exportInteractionsSheet(user: AuthUser, input: SheetsExportInput) {
    await this.requireConnection(user.organizationId);
    const since = new Date();
    since.setDate(since.getDate() - (input.windowDays ?? 30));
    const rows = await this.prisma.interaction.findMany({
      where: { organizationId: user.organizationId, occurredAt: { gte: since } },
      include: { party: { select: { displayName: true, email: true, phone: true } } },
      orderBy: { occurredAt: 'desc' },
      take: 500,
    });
    const access = await this.getAccessToken(user.organizationId);
    const title = input.title?.trim() || `Inbox export ${new Date().toISOString().slice(0, 10)}`;
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties: { title } }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!createRes.ok) {
      throw new BadRequestException(`Sheets create failed (${createRes.status})`);
    }
    const sheet = (await createRes.json()) as {
      spreadsheetId?: string;
      spreadsheetUrl?: string;
    };
    if (!sheet.spreadsheetId) throw new BadRequestException('Sheets create returned no id');

    const values: string[][] = [
      ['Occurred at', 'Channel', 'Outcome', 'Customer', 'Email', 'Phone', 'Summary'],
      ...rows.map((r) => [
        r.occurredAt.toISOString(),
        r.channel,
        r.outcome,
        r.party?.displayName || '',
        r.party?.email || '',
        r.party?.phone || '',
        (r.summary || '').slice(0, 500),
      ]),
    ];
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/Sheet1!A1:G${values.length}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${access}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values }),
        signal: AbortSignal.timeout(30_000),
      },
    );

    // Move sheet into agency Drive folder when possible
    try {
      const folderId = await this.ensureDriveFolder(user.organizationId);
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${sheet.spreadsheetId}?addParents=${folderId}&removeParents=root`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${access}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
    } catch {
      /* non-fatal */
    }

    return {
      spreadsheetId: sheet.spreadsheetId,
      spreadsheetUrl:
        sheet.spreadsheetUrl ||
        `https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}`,
      rowCount: rows.length,
    };
  }

  /**
   * Import Sheet rows as Interactions (not Leads).
   * Expected columns: Occurred at, Channel, Outcome, Customer, Email, Phone, Summary
   * (same shape as export). Header row should be skipped via range starting at A2.
   */
  async importInteractionsSheet(user: AuthUser, input: SheetsImportInput) {
    await this.requireConnection(user.organizationId);
    const access = await this.getAccessToken(user.organizationId);
    const range = encodeURIComponent(input.range || 'Sheet1!A2:G');
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${input.spreadsheetId}/values/${range}`,
      {
        headers: { Authorization: `Bearer ${access}` },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!res.ok) {
      throw new BadRequestException(`Sheets read failed (${res.status})`);
    }
    const payload = (await res.json()) as { values?: string[][] };
    let imported = 0;
    for (const [idx, row] of (payload.values ?? []).entries()) {
      const summary = (row[6] || row[0] || '').trim();
      if (!summary) continue;
      const email = (row[4] || '').trim() || null;
      const phone = (row[5] || '').trim() || null;
      const contactName = (row[3] || '').trim() || null;
      await this.leads.ingestInboundTouch(user.organizationId, {
        channel: 'import',
        summary,
        contactName,
        email,
        phone,
        acquisitionKey: 'google_sheets',
        idempotencyKey: `gsheets:${input.spreadsheetId}:${idx}:${summary.slice(0, 40)}:${email ?? ''}:${phone ?? ''}`,
        rawPayload: {
          direction: 'inbound',
          source: 'google_sheets',
          spreadsheetId: input.spreadsheetId,
          row,
        },
      });
      imported += 1;
    }
    return { imported };
  }
}
