import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export type TemplateSectionDef = {
  ref: string;
  parentRef: string | null;
  slotKey: string | null;
  type: string;
  moduleKey: string | null;
  propsJson: Record<string, unknown>;
  position: number;
};

/** Normalize flat or tree-ish section defs into portable template rows. */
export function normalizeTemplateSections(rawSections: unknown[]): TemplateSectionDef[] {
  const rows: TemplateSectionDef[] = [];
  for (let i = 0; i < rawSections.length; i += 1) {
    const section = asRecord(rawSections[i]);
    const ref =
      (typeof section.ref === 'string' && section.ref) ||
      (typeof section.id === 'string' && section.id) ||
      `s${i}`;
    const parentRef =
      (typeof section.parentRef === 'string' && section.parentRef) ||
      (typeof section.parentId === 'string' && section.parentId) ||
      null;
    const moduleKey =
      (typeof section.moduleKey === 'string' && section.moduleKey) ||
      (typeof section.type === 'string' && section.type) ||
      null;
    rows.push({
      ref,
      parentRef,
      slotKey: typeof section.slotKey === 'string' ? section.slotKey : null,
      type: String(section.type || moduleKey || 'rich_text'),
      moduleKey,
      propsJson: asRecord(section.propsJson),
      position: typeof section.position === 'number' ? section.position : i,
    });
  }
  return rows;
}

/** Serialize live page sections for templates / site kits (stable refs, no DB ids). */
export function serializeSectionsForTemplate(
  sections: Array<{
    id: string;
    type: string;
    propsJson: unknown;
    position: number;
    slotKey: string | null;
    parentId: string | null;
    moduleDefinitionId: string | null;
    moduleDefinition?: { key: string } | null;
  }>,
): Array<Record<string, unknown>> {
  const idToRef = new Map(sections.map((s, i) => [s.id, `s${i}`]));
  return sections.map((section, i) => {
    const ref = idToRef.get(section.id) || `s${i}`;
    const parentRef = section.parentId ? idToRef.get(section.parentId) || null : null;
    const moduleKey = section.moduleDefinition?.key || section.type;
    return {
      ref,
      parentRef,
      slotKey: section.slotKey,
      type: section.type,
      moduleKey,
      propsJson: asRecord(section.propsJson),
      position: section.position,
    };
  });
}

/**
 * Create PresenceSection rows from template defs, restoring parent/slot/module/frame.
 * Parents are created before children via multi-pass.
 */
export async function materializeSections(input: {
  tx: Tx;
  pageId: string;
  organizationId: string;
  rawSections: unknown[];
  moduleKeyRemap?: Map<string, string>;
}): Promise<void> {
  const defs = normalizeTemplateSections(input.rawSections);
  if (!defs.length) return;

  const moduleKeys = [
    ...new Set(defs.map((d) => d.moduleKey).filter((k): k is string => Boolean(k))),
  ];
  const modules = moduleKeys.length
    ? await input.tx.presenceModuleDefinition.findMany({
        where: {
          key: { in: moduleKeys },
          OR: [{ isSystem: true }, { organizationId: input.organizationId }],
        },
        select: { id: true, key: true, organizationId: true, isSystem: true },
      })
    : [];

  // Prefer org-owned module over system when keys collide.
  const moduleByKey = new Map<string, string>();
  for (const mod of modules) {
    const existing = moduleByKey.get(mod.key);
    if (!existing || (!mod.isSystem && mod.organizationId === input.organizationId)) {
      moduleByKey.set(mod.key, mod.id);
    }
  }
  if (input.moduleKeyRemap) {
    for (const [from, to] of input.moduleKeyRemap) {
      const targetId = moduleByKey.get(to);
      if (targetId) moduleByKey.set(from, targetId);
    }
  }

  const refToId = new Map<string, string>();
  const pending = [...defs].sort((a, b) => a.position - b.position);
  let guard = pending.length + 2;

  while (pending.length && guard > 0) {
    guard -= 1;
    let progressed = false;
    for (let i = 0; i < pending.length; i += 1) {
      const def = pending[i]!;
      if (def.parentRef && !refToId.has(def.parentRef)) continue;

      const lookupKey = def.moduleKey || def.type;
      const moduleDefinitionId = lookupKey ? moduleByKey.get(lookupKey) ?? null : null;

      const created = await input.tx.presenceSection.create({
        data: {
          pageId: input.pageId,
          type: def.type,
          propsJson: def.propsJson as Prisma.InputJsonValue,
          position: def.position,
          slotKey: def.slotKey,
          parentId: def.parentRef ? refToId.get(def.parentRef) ?? null : null,
          moduleDefinitionId,
        },
      });
      refToId.set(def.ref, created.id);
      pending.splice(i, 1);
      progressed = true;
      break;
    }
    if (!progressed) {
      // Orphaned parentRef — create remaining as roots
      for (const def of pending) {
        const lookupKey = def.moduleKey || def.type;
        const moduleDefinitionId = lookupKey ? moduleByKey.get(lookupKey) ?? null : null;
        await input.tx.presenceSection.create({
          data: {
            pageId: input.pageId,
            type: def.type,
            propsJson: def.propsJson as Prisma.InputJsonValue,
            position: def.position,
            slotKey: def.slotKey,
            parentId: null,
            moduleDefinitionId,
          },
        });
      }
      pending.length = 0;
    }
  }
}
