/** Allowlisted client friction telemetry (no vanity dashboards). */

export const CLIENT_AUDIT_ACTIONS = [
  'match_alt_use',
  'use_previous_trip',
  'operate_demo_install',
  'replace_demo',
] as const;

export type ClientAuditAction = (typeof CLIENT_AUDIT_ACTIONS)[number];

export function isClientAuditAction(action: string): action is ClientAuditAction {
  return (CLIENT_AUDIT_ACTIONS as readonly string[]).includes(action);
}
