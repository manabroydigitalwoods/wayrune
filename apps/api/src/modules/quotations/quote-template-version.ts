/** Plan quote-template create vs supersede (name-matched versioning). */

export function normalizeTemplateName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function templateNamesMatch(a: string, b: string): boolean {
  return normalizeTemplateName(a).toLowerCase() === normalizeTemplateName(b).toLowerCase();
}

export type ActiveTemplateRef = {
  id: string;
  name: string;
  versionNumber: number;
};

export type TemplateCreatePlan =
  | { kind: 'create'; versionNumber: 1; supersedesId: null }
  | {
      kind: 'supersede';
      versionNumber: number;
      supersedesId: string;
      previousVersionNumber: number;
      previousName: string;
    };

/**
 * Decide whether saving `name` creates a brand-new family or supersedes an active template.
 * Explicit `supersedeTemplateId` wins; otherwise match by normalized name among actives.
 * `asNew` forces a new family even when the name collides.
 */
export function planQuoteTemplateCreate(opts: {
  name: string;
  activeTemplates: ActiveTemplateRef[];
  supersedeTemplateId?: string | null;
  asNew?: boolean;
}): TemplateCreatePlan {
  const name = normalizeTemplateName(opts.name);
  if (!name) {
    throw new Error('Template name is required');
  }

  if (opts.asNew) {
    return { kind: 'create', versionNumber: 1, supersedesId: null };
  }

  if (opts.supersedeTemplateId) {
    const target = opts.activeTemplates.find((t) => t.id === opts.supersedeTemplateId);
    if (!target) {
      throw new Error('Template to supersede not found or not active');
    }
    return {
      kind: 'supersede',
      versionNumber: target.versionNumber + 1,
      supersedesId: target.id,
      previousVersionNumber: target.versionNumber,
      previousName: target.name,
    };
  }

  const match = opts.activeTemplates.find((t) => templateNamesMatch(t.name, name));
  if (!match) {
    return { kind: 'create', versionNumber: 1, supersedesId: null };
  }

  return {
    kind: 'supersede',
    versionNumber: match.versionNumber + 1,
    supersedesId: match.id,
    previousVersionNumber: match.versionNumber,
    previousName: match.name,
  };
}

export type TemplateChainRow = {
  id: string;
  name: string;
  versionNumber: number;
  status: string;
  supersedesId: string | null;
};

/**
 * Order a linear supersedes chain oldest → newest.
 * `byId` maps every known row; `childByParentId` maps parent id → next version.
 */
export function orderTemplateVersionChain(
  seedId: string,
  byId: Map<string, TemplateChainRow>,
  childByParentId: Map<string, TemplateChainRow>,
): TemplateChainRow[] {
  const seed = byId.get(seedId);
  if (!seed) return [];

  let root = seed;
  const seen = new Set<string>();
  while (root.supersedesId && !seen.has(root.id)) {
    seen.add(root.id);
    const prev = byId.get(root.supersedesId);
    if (!prev) break;
    root = prev;
  }

  const chain: TemplateChainRow[] = [];
  let node: TemplateChainRow | undefined = root;
  const fwdSeen = new Set<string>();
  while (node && !fwdSeen.has(node.id)) {
    fwdSeen.add(node.id);
    chain.push(node);
    node = childByParentId.get(node.id);
  }
  return chain;
}

export type TemplateRestorePlan = {
  versionNumber: number;
  supersedesId: string | null;
  activeTipId: string | null;
};

/**
 * Restore copies source content into a new active tip that supersedes the current active
 * (or the source itself when the family has no active tip).
 */
export function planQuoteTemplateRestore(opts: {
  sourceId: string;
  sourceStatus: string;
  sourceVersionNumber: number;
  activeTip: { id: string; versionNumber: number } | null;
}): TemplateRestorePlan {
  if (opts.activeTip && opts.activeTip.id === opts.sourceId) {
    throw new Error('Already the active version');
  }
  if (opts.sourceStatus === 'active' && !opts.activeTip) {
    throw new Error('Already the active version');
  }
  if (opts.activeTip) {
    return {
      versionNumber: opts.activeTip.versionNumber + 1,
      supersedesId: opts.activeTip.id,
      activeTipId: opts.activeTip.id,
    };
  }
  return {
    versionNumber: opts.sourceVersionNumber + 1,
    supersedesId: opts.sourceId,
    activeTipId: null,
  };
}

/** Active or superseded versions may be applied to a trip (without restoring). */
export function isTemplateApplicable(status: string): boolean {
  return status === 'active' || status === 'superseded';
}

/**
 * Gate apply-from-template: allow active + superseded; reject draft/archived/etc.
 * Returns null when OK, otherwise an error message.
 */
export function templateApplyBlockedReason(status: string): string | null {
  if (isTemplateApplicable(status)) return null;
  return 'This template version cannot be applied — pick an active or prior (superseded) version';
}
