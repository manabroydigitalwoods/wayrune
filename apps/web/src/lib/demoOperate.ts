/** Detect labeled demo operate suppliers (client badge). */

export const DEMO_OPERATE_NOTES = 'Demo data — not for live booking' as const;

export function isDemoOperateSupplier(input: {
  name?: string | null;
  notes?: string | null;
  profileJson?: Record<string, unknown> | null;
}): boolean {
  const name = input.name?.trim() || '';
  if (name.includes('[Demo]')) return true;
  if (input.notes?.includes(DEMO_OPERATE_NOTES)) return true;
  const profile = input.profileJson;
  if (profile && typeof profile === 'object' && !Array.isArray(profile)) {
    if (profile.demoOperate === true) return true;
  }
  return false;
}
