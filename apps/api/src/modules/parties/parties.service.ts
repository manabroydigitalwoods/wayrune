import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AssignPartyRoleSchema,
  CreatePartyAddressSchema,
  CreatePartyContactSchema,
  CreatePartySchema,
  ImportPartyCsvSchema,
  UpdatePartySchema,
} from '@wayrune/contracts';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildPartyListWhere, partyListCountSelect } from './party-list';
import { evaluatePartyCreditStatus } from './party-credit-limit';
import {
  partyImportCommitError,
} from './party-import';

type CreatePartyInput = z.infer<typeof CreatePartySchema>;
type UpdatePartyInput = z.infer<typeof UpdatePartySchema>;
type ImportPartyCsvInput = z.infer<typeof ImportPartyCsvSchema>;

@Injectable()
export class PartiesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    input: CreatePartyInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    const party = await db.party.create({
      data: {
        organizationId,
        type: input.type,
        displayName: input.displayName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        taxId: input.taxId ?? null,
        businessType: input.businessType ?? null,
        notes: input.notes ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    // When composed inside a caller's transaction, the caller owns the audit
    // trail (so it is recorded only after the whole unit of work commits).
    if (!tx) {
      await this.audit.record({
        organizationId,
        actorUserId: userId,
        action: 'party.create',
        entityType: 'party',
        entityId: party.id,
      });
    }
    return party;
  }

  /**
   * Match an existing individual client by email/phone in the org, or create a
   * new one. Mirrors the party resolution in `LeadsService.convertToClient`.
   * Transaction-aware; never audits (the caller audits after commit).
   */
  async matchOrCreate(
    organizationId: string,
    userId: string,
    contact: { name: string; email?: string | null; phone?: string | null },
    tx?: Prisma.TransactionClient,
  ): Promise<{ party: Awaited<ReturnType<PartiesService['create']>>; created: boolean }> {
    const db = tx ?? this.prisma;
    const email = contact.email?.trim().toLowerCase() || null;
    const phone = contact.phone?.trim() || null;

    const existing =
      email || phone
        ? await db.party.findFirst({
            where: {
              organizationId,
              deletedAt: null,
              OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
            },
          })
        : null;
    if (existing) return { party: existing, created: false };

    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { settingsJson: true },
    });
    const settings = (org?.settingsJson ?? {}) as Record<string, unknown>;
    const privacy = (settings.privacy ?? {}) as Record<string, unknown>;
    const marketingDefault = privacy.marketingConsentDefault === true;

    const party = await db.party.create({
      data: {
        organizationId,
        type: 'individual',
        displayName: contact.name,
        email,
        phone,
        marketingOptIn: marketingDefault,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    return { party, created: true };
  }

  async list(
    organizationId: string,
    opts?: { q?: string; page?: number; pageSize?: number; type?: string; b2b?: boolean },
  ) {
    const page = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? 20;
    const where = buildPartyListWhere(organizationId, {
      q: opts?.q,
      type: opts?.type,
      b2b: opts?.b2b,
    });
    const [items, total] = await Promise.all([
      this.prisma.party.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          contacts: true,
          _count: { select: partyListCountSelect },
        },
      }),
      this.prisma.party.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(organizationId: string, id: string) {
    const party = await this.prisma.party.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        contacts: true,
        addresses: true,
        contextRoles: true,
        trips: {
          where: { deletedAt: null },
          orderBy: { updatedAt: 'desc' },
          take: 20,
          select: {
            id: true,
            tripNumber: true,
            title: true,
            status: true,
            startDate: true,
            endDate: true,
            updatedAt: true,
          },
        },
        inquiries: {
          where: { deletedAt: null },
          orderBy: { updatedAt: 'desc' },
          take: 10,
          select: {
            id: true,
            inquiryNumber: true,
            status: true,
            updatedAt: true,
            engagementConversationId: true,
          },
        },
        engagementConversations: {
          orderBy: { lastInteractionAt: 'desc' },
          take: 10,
          select: {
            id: true,
            status: true,
            subject: true,
            lastInteractionAt: true,
            unreadCount: true,
            journeyPathJson: true,
          },
        },
      },
    });
    if (!party) throw new NotFoundException('Party not found');
    return party;
  }

  async creditStatus(
    organizationId: string,
    partyId: string,
    opts?: { orgCurrency?: string; pendingAmount?: number },
  ) {
    await this.requireParty(organizationId, partyId);
    return evaluatePartyCreditStatus(this.prisma, organizationId, partyId, {
      orgCurrency: opts?.orgCurrency,
      pendingAmount: opts?.pendingAmount,
    });
  }

  async update(
    organizationId: string,
    userId: string,
    id: string,
    input: UpdatePartyInput,
  ) {
    const existing = await this.requireParty(organizationId, id);
    let metadataJson: Prisma.InputJsonValue | undefined =
      input.metadataJson as Prisma.InputJsonValue | undefined;
    if (input.markupPercent !== undefined) {
      const prior =
        existing.metadataJson &&
        typeof existing.metadataJson === 'object' &&
        !Array.isArray(existing.metadataJson)
          ? { ...(existing.metadataJson as Record<string, unknown>) }
          : {};
      const merged =
        input.metadataJson &&
        typeof input.metadataJson === 'object' &&
        !Array.isArray(input.metadataJson)
          ? { ...prior, ...(input.metadataJson as Record<string, unknown>) }
          : prior;
      if (input.markupPercent == null) {
        delete merged.markupPercent;
      } else {
        merged.markupPercent = input.markupPercent;
      }
      metadataJson = merged as Prisma.InputJsonValue;
    }
    const party = await this.prisma.party.update({
      where: { id },
      data: {
        type: input.type,
        displayName: input.displayName,
        email: input.email,
        phone: input.phone,
        taxId: input.taxId,
        businessType: input.businessType,
        creditLimit: input.creditLimit,
        paymentTerms: input.paymentTerms,
        notes: input.notes,
        ...(metadataJson !== undefined ? { metadataJson } : {}),
        updatedBy: userId,
      },
    });
    await this.audit.record({
      organizationId,
      actorUserId: userId,
      action: 'party.update',
      entityType: 'party',
      entityId: party.id,
    });
    return party;
  }

  async addContact(
    organizationId: string,
    partyId: string,
    input: z.infer<typeof CreatePartyContactSchema>,
  ) {
    await this.requireParty(organizationId, partyId);
    return this.prisma.partyContact.create({
      data: {
        partyId,
        fullName: input.fullName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        title: input.title ?? null,
        isPrimary: input.isPrimary ?? false,
      },
    });
  }

  async addAddress(
    organizationId: string,
    partyId: string,
    input: z.infer<typeof CreatePartyAddressSchema>,
  ) {
    await this.requireParty(organizationId, partyId);
    return this.prisma.address.create({
      data: {
        partyId,
        label: input.label,
        line1: input.line1,
        line2: input.line2 ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        postalCode: input.postalCode ?? null,
        country: input.country ?? null,
      },
    });
  }

  async assignRole(
    organizationId: string,
    partyId: string,
    input: z.infer<typeof AssignPartyRoleSchema>,
  ) {
    await this.requireParty(organizationId, partyId);
    return this.prisma.partyContextRole.upsert({
      where: {
        partyId_role_entityType_entityId: {
          partyId,
          role: input.role,
          entityType: input.entityType,
          entityId: input.entityId,
        },
      },
      create: {
        partyId,
        role: input.role,
        entityType: input.entityType,
        entityId: input.entityId,
      },
      update: {},
    });
  }

  async importCsv(organizationId: string, userId: string, input: ImportPartyCsvInput) {
    const results: Array<{
      displayName: string;
      status: 'created' | 'skipped';
      id?: string;
      reason?: string;
    }> = [];

    for (const row of input.rows) {
      const email = row.email?.trim() || null;
      if (email) {
        const existing = await this.prisma.party.findFirst({
          where: { organizationId, deletedAt: null, email },
          select: { id: true },
        });
        if (existing) {
          results.push({
            displayName: row.name,
            status: 'skipped',
            id: existing.id,
            reason: 'email_exists',
          });
          continue;
        }
      }
      const party = await this.create(organizationId, userId, {
        type: row.type || 'individual',
        displayName: row.name.trim(),
        email,
        phone: row.phone ?? null,
      });
      results.push({ displayName: row.name, status: 'created', id: party.id });
    }

    const created = results.filter((r) => r.status === 'created').length;
    const skipped = results.length - created;
    const commitError = partyImportCommitError({ imported: created, skipped });
    if (commitError) throw new BadRequestException(commitError);

    return { imported: created, skipped, results };
  }

  private async requireParty(organizationId: string, id: string) {
    const party = await this.prisma.party.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!party) throw new NotFoundException('Party not found');
    return party;
  }
}
