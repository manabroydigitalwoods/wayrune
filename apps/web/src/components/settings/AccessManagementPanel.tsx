import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Pencil,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  Checkbox,
  Combobox,
  EmptyState,
  Input,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
  toastError,
  toastSuccess,
  type ComboboxOption,
} from '@wayrune/ui';
import { api } from '../../api';
import { useAuth } from '../../auth';

type Risk = 'low' | 'medium' | 'high' | 'critical';

type RoleRow = {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  memberCount: number;
  allowedForOrgKind: boolean;
  manageable: boolean;
  permissions: string[];
};

type MemberRow = {
  id: string;
  membershipId: string;
  fullName: string;
  email: string;
  isOwner: boolean;
  isActive: boolean;
  roles: { id: string; key: string; name: string }[];
  propertyScopes: string[];
};

type PermMeta = { key: string; description: string; risk: Risk; scope: string };

type CatalogGroup = {
  group: string;
  permissions: { key: string; description: string; risk: Risk; scope: string; assignable: boolean }[];
};

type PermCatalog = { orgKind: string; groups: CatalogGroup[]; assignable: string[] };

type PropertyRow = { id: string; name: string; assetKind: string; isActive: boolean };

type InviteRow = {
  id: string;
  email: string;
  fullName: string | null;
  status: string;
  roles: { id: string; name: string }[];
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
};

type InviteCreated = {
  id: string;
  email: string;
  status: string;
  roles: { id: string; name: string }[];
  expiresAt: string;
  acceptPath: string;
  acceptToken: string;
};

type EffectiveResp = {
  name?: string;
  granted: string[];
  effective: string[];
  implied?: string[];
  permissions: PermMeta[];
  roles?: { id: string; key: string; name: string }[];
  propertyScopes?: string[];
};

type PermissionDiff = { added: string[]; removed: string[]; unchanged: string[] };

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  createdAt: string;
  metadataJson?: {
    name?: string;
    roleName?: string;
    diff?: PermissionDiff;
    before?: string[];
    after?: string[];
    removedFromMembers?: number;
  } | null;
};

const RISK_TONE: Record<Risk, string> = {
  low: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300',
  high: 'border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-300',
  critical: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300',
};

function RiskBadge({ risk }: { risk: Risk }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none',
        RISK_TONE[risk],
      )}
    >
      {risk}
    </span>
  );
}

function humanRole(name: string) {
  return name.replace(/\b\w/g, (c) => c.toUpperCase());
}

export type TeamAccessTab = 'members' | 'roles' | 'permissions' | 'activity';

export function AccessManagementPanel({
  active,
  forcedTab,
  hideTabBar = false,
}: {
  active: boolean;
  forcedTab?: TeamAccessTab;
  hideTabBar?: boolean;
}) {
  const { me } = useAuth();
  const [tab, setTab] = useState<TeamAccessTab>(forcedTab ?? 'members');
  const [loaded, setLoaded] = useState(false);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [catalog, setCatalog] = useState<PermCatalog | null>(null);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);

  const reloadRoles = useCallback(() => api<RoleRow[]>('/access/roles').then(setRoles), []);
  const reloadMembers = useCallback(() => api<MemberRow[]>('/access/members').then(setMembers), []);
  const reloadAudit = useCallback(
    () => api<AuditRow[]>('/access/audit').then(setAudit).catch(() => setAudit([])),
    [],
  );
  const reloadInvites = useCallback(
    () => api<InviteRow[]>('/access/invites').then(setInvites).catch(() => setInvites([])),
    [],
  );

  useEffect(() => {
    if (!active || loaded) return;
    setLoaded(true);
    Promise.all([
      reloadRoles(),
      reloadMembers(),
      api<PermCatalog>('/access/permission-catalog').then(setCatalog),
      api<PropertyRow[]>('/access/properties')
        .then(setProperties)
        .catch(() => setProperties([])),
      reloadAudit(),
      reloadInvites(),
    ]).catch((e) => toastError(e instanceof Error ? e.message : 'Could not load access settings'));
  }, [active, loaded, reloadRoles, reloadMembers, reloadAudit, reloadInvites]);

  useEffect(() => {
    if (forcedTab) setTab(forcedTab);
  }, [forcedTab]);

  const propertyName = useCallback(
    (id: string) => properties.find((p) => p.id === id)?.name ?? id,
    [properties],
  );

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as TeamAccessTab)}>
      {hideTabBar ? null : (
        <TabsList>
          <TabsTrigger value="members">Members ({members.length})</TabsTrigger>
          <TabsTrigger value="roles">Roles ({roles.length})</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
      )}

      <TabsContent value="members" className="mt-3">
        <MembersTab
          members={members}
          roles={roles}
          properties={properties}
          invites={invites}
          propertyName={propertyName}
          currentUserId={me?.id}
          onChanged={reloadMembers}
          onInvitesChanged={reloadInvites}
          afterMutation={reloadAudit}
        />
      </TabsContent>

      <TabsContent value="roles" className="mt-3">
        <RolesTab
          roles={roles}
          catalog={catalog}
          onChanged={async () => {
            await Promise.all([reloadRoles(), reloadMembers()]);
          }}
          afterMutation={reloadAudit}
        />
      </TabsContent>

      <TabsContent value="permissions" className="mt-3">
        <PermissionsCatalogTab catalog={catalog} roles={roles} />
      </TabsContent>

      <TabsContent value="activity" className="mt-3">
        <ActivityTab audit={audit} propertyName={propertyName} />
      </TabsContent>
    </Tabs>
  );
}

function PermissionsCatalogTab({
  catalog,
  roles,
}: {
  catalog: PermCatalog | null;
  roles: RoleRow[];
}) {
  if (!catalog) {
    return (
      <div className="space-y-2" role="status" aria-busy="true">
        <span className="sr-only">Loading</span>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Permission keys available for this organization. Assign them to roles on the Roles page.
      </p>
      <div className="space-y-3">
        {catalog.groups.map((group) => (
          <div key={group.group} className="rounded-xl border p-3 glass-well">
            <h3 className="text-sm font-semibold">{group.group}</h3>
            <ul className="mt-2 space-y-2">
              {group.permissions.map((perm) => {
                const roleCount = roles.filter((r) => r.permissions.includes(perm.key)).length;
                return (
                  <li key={perm.key} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{perm.key}</code>
                      <p className="mt-1 text-muted-foreground">{perm.description}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                      {roleCount} role{roleCount === 1 ? '' : 's'}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------- Members ------------------------------- */

function MembersTab({
  members,
  roles,
  properties,
  invites,
  propertyName,
  currentUserId,
  onChanged,
  onInvitesChanged,
  afterMutation,
}: {
  members: MemberRow[];
  roles: RoleRow[];
  properties: PropertyRow[];
  invites: InviteRow[];
  propertyName: (id: string) => string;
  currentUserId?: string;
  onChanged: () => Promise<void> | void;
  onInvitesChanged: () => Promise<void> | void;
  afterMutation: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [effectiveFor, setEffectiveFor] = useState<string | null>(null);
  const [effective, setEffective] = useState<EffectiveResp | null>(null);
  const [scopeEditor, setScopeEditor] = useState<{ membershipId: string; selected: string[] } | null>(
    null,
  );

  const assignableRoles = useMemo(
    () => roles.filter((r) => r.allowedForOrgKind && (r.isSystem ? true : r.manageable)),
    [roles],
  );

  async function assignRole(membershipId: string, roleId: string) {
    setBusy(membershipId);
    try {
      await api(`/access/members/${membershipId}/roles`, {
        method: 'POST',
        body: JSON.stringify({ roleId }),
      });
      toastSuccess('Role assigned');
      await onChanged();
      afterMutation();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not assign role');
    } finally {
      setBusy(null);
    }
  }

  async function removeRole(membershipId: string, roleId: string) {
    setBusy(membershipId);
    try {
      await api(`/access/members/${membershipId}/roles/${roleId}`, { method: 'DELETE' });
      toastSuccess('Role removed');
      await onChanged();
      afterMutation();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not remove role');
    } finally {
      setBusy(null);
    }
  }

  async function toggleEffective(membershipId: string) {
    if (effectiveFor === membershipId) {
      setEffectiveFor(null);
      setEffective(null);
      return;
    }
    setEffectiveFor(membershipId);
    setEffective(null);
    try {
      setEffective(await api<EffectiveResp>(`/access/members/${membershipId}/effective`));
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not load effective access');
    }
  }

  async function saveScopes() {
    if (!scopeEditor) return;
    setBusy(scopeEditor.membershipId);
    try {
      await api(`/access/members/${scopeEditor.membershipId}/property-scopes`, {
        method: 'PUT',
        body: JSON.stringify({ partnerAssetIds: scopeEditor.selected }),
      });
      toastSuccess('Property access updated');
      setScopeEditor(null);
      await onChanged();
      afterMutation();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update property access');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <InviteSection
        assignableRoles={assignableRoles}
        invites={invites}
        onChanged={onInvitesChanged}
        afterMutation={afterMutation}
      />
      {members.length === 0 ? (
        <EmptyState
          title="No members yet"
          description="Invite someone to give them access to this organization."
        />
      ) : (
        <ul className="space-y-2">
          {members.map((m) => {
        const memberRoleIds = new Set(m.roles.map((r) => r.id));
        const addable = assignableRoles.filter((r) => !memberRoleIds.has(r.id));
        const options: ComboboxOption[] = addable.map((r) => ({
          value: r.id,
          label: humanRole(r.name),
          icon: r.isSystem ? Shield : ShieldCheck,
        }));
        const isSelf = m.id === currentUserId;
        return (
          <li key={m.membershipId} className="rounded-xl border p-3 glass-well">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {m.fullName}
                  {isSelf ? <span className="ml-1 text-xs text-muted-foreground">(you)</span> : null}
                  {m.isOwner ? <Badge className="ml-2 align-middle">Owner</Badge> : null}
                  {!m.isActive ? (
                    <Badge variant="secondary" className="ml-2 align-middle">
                      Inactive
                    </Badge>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void toggleEffective(m.membershipId)}>
                {effectiveFor === m.membershipId ? 'Hide access' : 'View access'}
              </Button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {m.roles.length === 0 ? (
                <span className="text-xs text-muted-foreground">No roles</span>
              ) : (
                m.roles.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1 rounded-full border bg-background/60 px-2 py-0.5 text-xs"
                  >
                    {humanRole(r.name)}
                    <button
                      type="button"
                      aria-label={`Remove ${r.name}`}
                      className="text-muted-foreground hover:text-red-500 disabled:opacity-40"
                      disabled={busy === m.membershipId}
                      onClick={() => void removeRole(m.membershipId, r.id)}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))
              )}
              {options.length > 0 ? (
                <div className="min-w-[180px]">
                  <Combobox
                    options={options}
                    value=""
                    onChange={(v) => v && void assignRole(m.membershipId, v)}
                    searchable
                    placeholder="+ Add role"
                    searchPlaceholder="Search roles…"
                  />
                </div>
              ) : null}
            </div>

            {properties.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <Building2 className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Properties:</span>
                {m.propertyScopes.length === 0 ? (
                  <span className="text-muted-foreground">All (org-wide)</span>
                ) : (
                  m.propertyScopes.map((id) => (
                    <Badge key={id} variant="secondary">
                      {propertyName(id)}
                    </Badge>
                  ))
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() =>
                    setScopeEditor({ membershipId: m.membershipId, selected: [...m.propertyScopes] })
                  }
                >
                  <Pencil className="mr-1 size-3" /> Edit
                </Button>
              </div>
            ) : null}

            {scopeEditor?.membershipId === m.membershipId ? (
              <div className="mt-2 rounded-lg border p-2">
                <p className="mb-1 text-xs text-muted-foreground">
                  Leave all unchecked for org-wide access to every property.
                </p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {properties.map((p) => {
                    const checked = scopeEditor.selected.includes(p.id);
                    return (
                      <label key={p.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) =>
                            setScopeEditor((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    selected:
                                      c === true
                                        ? [...prev.selected, p.id]
                                        : prev.selected.filter((x) => x !== p.id),
                                  }
                                : prev,
                            )
                          }
                        />
                        <span className="truncate">{p.name}</span>
                        <span className="text-[10px] uppercase text-muted-foreground">
                          {p.assetKind}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" disabled={busy === m.membershipId} onClick={() => void saveScopes()}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setScopeEditor(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            {effectiveFor === m.membershipId ? (
              <EffectiveView data={effective} propertyName={propertyName} />
            ) : null}
          </li>
        );
          })}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------- Invites ------------------------------ */

const INVITE_STATUS_TONE: Record<string, string> = {
  pending: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300',
  accepted: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  revoked: 'border-muted bg-muted/40 text-muted-foreground',
  expired: 'border-muted bg-muted/40 text-muted-foreground',
};

function InviteSection({
  assignableRoles,
  invites,
  onChanged,
  afterMutation,
}: {
  assignableRoles: RoleRow[];
  invites: InviteRow[];
  onChanged: () => Promise<void> | void;
  afterMutation: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);

  const roleOptions: ComboboxOption[] = assignableRoles
    .filter((r) => !selectedRoles.includes(r.id))
    .map((r) => ({ value: r.id, label: humanRole(r.name), icon: r.isSystem ? Shield : ShieldCheck }));

  const pending = invites.filter((i) => i.status === 'pending');
  const inactive = invites.filter((i) => i.status !== 'pending');

  function resetForm() {
    setEmail('');
    setFullName('');
    setSelectedRoles([]);
  }

  function copyLink(link: string) {
    void navigator.clipboard?.writeText(link).then(
      () => toastSuccess('Invite link copied'),
      () => toastError('Could not copy link'),
    );
  }

  async function sendInvite() {
    if (!email.trim()) return toastError('Enter an email address');
    if (selectedRoles.length === 0) return toastError('Select at least one role');
    setBusy(true);
    try {
      const res = await api<InviteCreated>('/access/invites', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          fullName: fullName.trim() || undefined,
          roleIds: selectedRoles,
        }),
      });
      const link = `${window.location.origin}${res.acceptPath}`;
      setLastLink(link);
      toastSuccess(`Invitation sent to ${res.email}`);
      resetForm();
      await onChanged();
      afterMutation();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not send invitation');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      await api(`/access/invites/${id}`, { method: 'DELETE' });
      toastSuccess('Invitation revoked');
      await onChanged();
      afterMutation();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not revoke invitation');
    }
  }

  async function resend(invite: InviteRow) {
    setBusy(true);
    try {
      const res = await api<InviteCreated>('/access/invites', {
        method: 'POST',
        body: JSON.stringify({
          email: invite.email,
          fullName: invite.fullName || undefined,
          roleIds: invite.roles.map((r) => r.id),
        }),
      });
      const link = `${window.location.origin}${res.acceptPath}`;
      setLastLink(link);
      toastSuccess(`New invitation link generated for ${res.email}`);
      await onChanged();
      afterMutation();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not resend invitation');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border p-3 glass-well">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Invite members</p>
          <p className="text-xs text-muted-foreground">
            Send a tokenised link to add someone with a preset role set.
          </p>
        </div>
        <Button
          size="sm"
          variant={open ? 'ghost' : 'default'}
          onClick={() => {
            setOpen((v) => !v);
            setLastLink(null);
          }}
        >
          {open ? 'Close' : <><UserPlus className="mr-1 size-4" /> Invite</>}
        </Button>
      </div>

      {open ? (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">Email</span>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="person@example.com"
              />
            </div>
            <div className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">Full name (optional)</span>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Only used for new accounts"
              />
            </div>
          </div>

          <div className="space-y-1.5 text-sm">
            <span className="text-muted-foreground">Roles</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {selectedRoles.map((id) => {
                const role = assignableRoles.find((r) => r.id === id);
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full border bg-background/60 px-2 py-0.5 text-xs"
                  >
                    {humanRole(role?.name ?? id)}
                    <button
                      type="button"
                      aria-label="Remove role"
                      className="text-muted-foreground hover:text-red-500"
                      onClick={() => setSelectedRoles((prev) => prev.filter((x) => x !== id))}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                );
              })}
              {roleOptions.length > 0 ? (
                <div className="min-w-[180px]">
                  <Combobox
                    options={roleOptions}
                    value=""
                    onChange={(v) => v && setSelectedRoles((prev) => [...prev, v])}
                    searchable
                    placeholder="+ Add role"
                    searchPlaceholder="Search roles…"
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => void sendInvite()}>
              Send invitation
            </Button>
            <Button size="sm" variant="ghost" onClick={resetForm}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      {lastLink ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border bg-background/50 p-2 text-xs">
          <span className="truncate font-mono">{lastLink}</span>
          <Button size="sm" variant="ghost" className="ml-auto h-6 px-2" onClick={() => copyLink(lastLink)}>
            <Copy className="mr-1 size-3" /> Copy
          </Button>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Pending invitations</p>
          <ul className="space-y-1.5">
            {pending.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
              >
                <div className="min-w-0">
                  <span className="font-medium">{inv.email}</span>
                  <span className="text-muted-foreground">
                    {' · '}
                    {inv.roles.map((r) => humanRole(r.name)).join(', ') || 'no roles'}
                    {' · expires '}
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2"
                    disabled={busy}
                    onClick={() => void resend(inv)}
                  >
                    Resend
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-red-500"
                    onClick={() => void revoke(inv.id)}
                  >
                    Revoke
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {inactive.length > 0 ? (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            {inactive.length} past invitation{inactive.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-1.5 space-y-1">
            {inactive.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-2 px-1">
                <span className="truncate">{inv.email}</span>
                <span
                  className={cn(
                    'rounded-full border px-1.5 py-0.5 text-[10px]',
                    INVITE_STATUS_TONE[inv.status] ?? INVITE_STATUS_TONE.expired,
                  )}
                >
                  {inv.status}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/* -------------------------------- Roles -------------------------------- */

function RolesTab({
  roles,
  catalog,
  onChanged,
  afterMutation,
}: {
  roles: RoleRow[];
  catalog: PermCatalog | null;
  onChanged: () => Promise<void> | void;
  afterMutation: () => void;
}) {
  const [editor, setEditor] = useState<
    | { mode: 'create' | 'edit'; id?: string; name: string; cloneFromRoleId: string; selected: string[] }
    | null
  >(null);
  const [testFor, setTestFor] = useState<string | null>(null);
  const [testData, setTestData] = useState<EffectiveResp | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggleTest(roleId: string) {
    if (testFor === roleId) {
      setTestFor(null);
      setTestData(null);
      return;
    }
    setTestFor(roleId);
    setTestData(null);
    try {
      setTestData(await api<EffectiveResp>(`/access/roles/${roleId}/effective`));
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not load role access');
    }
  }

  async function deleteRole(role: RoleRow) {
    if (!window.confirm(`Delete role "${humanRole(role.name)}"? This removes it from all members.`)) {
      return;
    }
    try {
      await api(`/access/roles/${role.id}`, { method: 'DELETE' });
      toastSuccess('Role deleted');
      await onChanged();
      afterMutation();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not delete role');
    }
  }

  async function saveEditor() {
    if (!editor) return;
    if (!editor.name.trim()) {
      toastError('Role name is required');
      return;
    }
    setBusy(true);
    try {
      if (editor.mode === 'create') {
        await api('/access/roles', {
          method: 'POST',
          body: JSON.stringify({
            name: editor.name.trim(),
            cloneFromRoleId: editor.cloneFromRoleId || undefined,
            permissions: editor.selected,
          }),
        });
        toastSuccess('Role created');
      } else {
        await api(`/access/roles/${editor.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: editor.name.trim(), permissions: editor.selected }),
        });
        toastSuccess('Role updated');
      }
      setEditor(null);
      await onChanged();
      afterMutation();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save role');
    } finally {
      setBusy(false);
    }
  }

  function startCreate() {
    setEditor({ mode: 'create', name: '', cloneFromRoleId: '', selected: [] });
  }

  function startClone(role: RoleRow) {
    setEditor({
      mode: 'create',
      name: `${role.name} copy`,
      cloneFromRoleId: role.id,
      selected: [...role.permissions],
    });
  }

  function startEdit(role: RoleRow) {
    setEditor({ mode: 'edit', id: role.id, name: role.name, cloneFromRoleId: '', selected: [...role.permissions] });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={startCreate}>
          <Plus className="mr-1 size-4" /> New role
        </Button>
      </div>

      {editor ? (
        <RoleEditor
          editor={editor}
          setEditor={setEditor}
          catalog={catalog}
          roles={roles}
          busy={busy}
          onSave={() => void saveEditor()}
          onCancel={() => setEditor(null)}
        />
      ) : null}

      <ul className="space-y-2">
        {roles.map((r) => (
          <li key={r.id} className="rounded-xl border p-3 glass-well">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {humanRole(r.name)}
                  <Badge variant={r.isSystem ? 'secondary' : 'default'} className="ml-2 align-middle">
                    {r.isSystem ? 'System' : 'Custom'}
                  </Badge>
                  {!r.allowedForOrgKind ? (
                    <Badge variant="secondary" className="ml-1 align-middle">
                      Unavailable here
                    </Badge>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.permissions.length} permission{r.permissions.length === 1 ? '' : 's'} ·{' '}
                  {r.memberCount} member{r.memberCount === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => void toggleTest(r.id)}>
                  {testFor === r.id ? 'Hide' : 'Test'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Clone into a new custom role"
                  onClick={() => startClone(r)}
                >
                  <Copy className="size-3.5" />
                </Button>
                {!r.isSystem && r.manageable ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => startEdit(r)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500"
                      onClick={() => void deleteRole(r)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
            {testFor === r.id ? <EffectiveView data={testData} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoleEditor({
  editor,
  setEditor,
  catalog,
  roles,
  busy,
  onSave,
  onCancel,
}: {
  editor: { mode: 'create' | 'edit'; id?: string; name: string; cloneFromRoleId: string; selected: string[] };
  setEditor: (
    e: { mode: 'create' | 'edit'; id?: string; name: string; cloneFromRoleId: string; selected: string[] } | null,
  ) => void;
  catalog: PermCatalog | null;
  roles: RoleRow[];
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const selected = new Set(editor.selected);

  const cloneOptions: ComboboxOption[] = [
    { value: '', label: 'Start blank' },
    ...roles.map((r) => ({ value: r.id, label: humanRole(r.name), icon: r.isSystem ? Shield : ShieldCheck })),
  ];

  function toggle(key: string, on: boolean) {
    setEditor({
      ...editor,
      selected: on ? [...editor.selected, key] : editor.selected.filter((k) => k !== key),
    });
  }

  function toggleGroup(group: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  return (
    <div className="rounded-xl border p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Role name</label>
          <Input
            value={editor.name}
            onChange={(e) => setEditor({ ...editor, name: e.target.value })}
            placeholder="e.g. Regional Manager"
          />
        </div>
        {editor.mode === 'create' ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Clone permissions from
            </label>
            <Combobox
              options={cloneOptions}
              value={editor.cloneFromRoleId}
              onChange={(v) => {
                const src = roles.find((r) => r.id === v);
                setEditor({
                  ...editor,
                  cloneFromRoleId: v,
                  selected: src ? [...src.permissions] : editor.selected,
                });
              }}
              searchable
              searchPlaceholder="Search roles…"
            />
          </div>
        ) : null}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        You can only grant permissions you hold. Permissions unavailable for this organization or above
        your access are disabled.
      </p>

      <div className="mt-2 max-h-80 space-y-1 overflow-auto rounded-lg border p-2">
        {catalog?.groups.map((g) => {
          const open = openGroups.has(g.group);
          const selectedCount = g.permissions.filter((p) => selected.has(p.key)).length;
          return (
            <div key={g.group} className="rounded-md">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left text-sm font-medium hover:bg-muted/50"
                onClick={() => toggleGroup(g.group)}
              >
                <span className="flex items-center gap-1">
                  {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  {g.group}
                </span>
                <span className="text-xs text-muted-foreground">
                  {selectedCount}/{g.permissions.length}
                </span>
              </button>
              {open ? (
                <div className="grid gap-1 py-1 pl-5 sm:grid-cols-2">
                  {g.permissions.map((p) => (
                    <label
                      key={p.key}
                      className={cn(
                        'flex items-start gap-2 rounded-md px-1 py-0.5 text-xs',
                        !p.assignable && 'opacity-50',
                      )}
                      title={p.assignable ? p.description : 'You cannot grant this permission'}
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={selected.has(p.key)}
                        disabled={!p.assignable}
                        onCheckedChange={(c) => toggle(p.key, c === true)}
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1">
                          <span className="truncate font-mono text-[11px]">{p.key}</span>
                          <RiskBadge risk={p.risk} />
                        </span>
                        <span className="block truncate text-muted-foreground">{p.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" disabled={busy} onClick={onSave}>
          <Check className="mr-1 size-4" />
          {editor.mode === 'create' ? 'Create role' : 'Save changes'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{editor.selected.length} selected</span>
      </div>
    </div>
  );
}

/* ------------------------------ Effective ------------------------------ */

function EffectiveView({
  data,
  propertyName,
}: {
  data: EffectiveResp | null;
  propertyName?: (id: string) => string;
}) {
  if (!data) {
    return (
      <div className="mt-2 space-y-2" role="status" aria-busy="true">
        <span className="sr-only">Loading</span>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    );
  }
  const grantedSet = new Set(data.granted);
  const grouped = new Map<string, PermMeta[]>();
  for (const p of data.permissions) {
    const arr = grouped.get(p.risk) ?? [];
    arr.push(p);
    grouped.set(p.risk, arr);
  }
  return (
    <div className="mt-2 rounded-lg border bg-background/50 p-2">
      <p className="mb-1 text-xs text-muted-foreground">
        {data.effective.length} effective permission{data.effective.length === 1 ? '' : 's'}
        {data.implied && data.implied.length
          ? ` (${data.implied.length} inherited via implications)`
          : ''}
      </p>
      {propertyName && data.propertyScopes ? (
        <p className="mb-1 text-xs">
          <span className="text-muted-foreground">Properties: </span>
          {data.propertyScopes.length === 0
            ? 'All (org-wide)'
            : data.propertyScopes.map(propertyName).join(', ')}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {data.permissions.map((p) => (
          <span
            key={p.key}
            className={cn(
              'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px]',
              RISK_TONE[p.risk],
              !grantedSet.has(p.key) && 'opacity-60',
            )}
            title={`${p.description}${grantedSet.has(p.key) ? '' : ' (inherited)'}`}
          >
            {p.key}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ Activity ------------------------------- */

const ACTION_LABEL: Record<string, string> = {
  'role.create': 'Created role',
  'role.update': 'Updated role',
  'role.delete': 'Deleted role',
  'membership.role.assign': 'Assigned role',
  'membership.role.remove': 'Removed role',
  'membership.scope.set': 'Updated property access',
};

function ActivityTab({
  audit,
  propertyName,
}: {
  audit: AuditRow[];
  propertyName: (id: string) => string;
}) {
  if (audit.length === 0) {
    return <EmptyState title="No activity" description="Role and membership changes will appear here." />;
  }
  return (
    <ul className="space-y-1.5">
      {audit.map((row) => {
        const meta = row.metadataJson ?? {};
        const diff = meta.diff;
        return (
          <li key={row.id} className="rounded-lg border px-3 py-2 text-xs glass-well">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {ACTION_LABEL[row.action] ?? row.action}
                {meta.name || meta.roleName ? (
                  <span className="text-muted-foreground"> · {meta.name ?? meta.roleName}</span>
                ) : null}
              </span>
              <span className="text-muted-foreground">
                {new Date(row.createdAt).toLocaleString()}
              </span>
            </div>
            {diff && (diff.added.length || diff.removed.length) ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {diff.added.map((k) => (
                  <span
                    key={`a-${k}`}
                    className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1 py-0.5 font-mono text-[10px] text-emerald-600 dark:text-emerald-300"
                  >
                    +{k}
                  </span>
                ))}
                {diff.removed.map((k) => (
                  <span
                    key={`r-${k}`}
                    className="rounded border border-red-500/40 bg-red-500/10 px-1 py-0.5 font-mono text-[10px] text-red-600 dark:text-red-300"
                  >
                    −{k}
                  </span>
                ))}
              </div>
            ) : null}
            {row.action === 'membership.scope.set' && meta.after ? (
              <div className="mt-1 flex items-center gap-1 text-muted-foreground">
                <AlertTriangle className="size-3" />
                {meta.after.length === 0
                  ? 'Set to org-wide (all properties)'
                  : `Scoped to ${meta.after.map(propertyName).join(', ')}`}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
