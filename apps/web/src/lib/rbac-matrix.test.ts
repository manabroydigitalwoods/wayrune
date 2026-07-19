import { describe, expect, it } from 'vitest';
import { CAP, type CapabilityKey } from './capabilities';
import {
  ROLE_PERMISSION_MAP,
  PARTNER_ROLE_PERMISSION_MAP,
  PLATFORM_ROLE_PERMISSION_MAP,
  hasPermission,
} from '@wayrune/rbac';

function can(permissions: readonly string[], cap: CapabilityKey): boolean {
  return CAP[cap].some((p) => hasPermission(permissions, p));
}

type Expect = {
  perms: readonly string[];
  allow: CapabilityKey[];
  deny: CapabilityKey[];
};

function check(label: string, { perms, allow, deny }: Expect) {
  it(`${label}: sees expected controls`, () => {
    const wronglyHidden = allow.filter((c) => !can(perms, c));
    expect(wronglyHidden, `should be visible: ${wronglyHidden.join(', ')}`).toEqual([]);
  });
  it(`${label}: hides unauthorized controls`, () => {
    const wronglyShown = deny.filter((c) => can(perms, c));
    expect(wronglyShown, `should be hidden: ${wronglyShown.join(', ')}`).toEqual([]);
  });
}

describe('agency role x capability matrix', () => {
  check('owner', {
    perms: ROLE_PERMISSION_MAP.owner,
    allow: ['leadWrite', 'tripWrite', 'quoteApprove', 'userManage', 'orgSettingsWrite', 'policyManage'],
    deny: ['platformCatalogWrite'],
  });
  check('admin', {
    perms: ROLE_PERMISSION_MAP.admin,
    allow: ['leadWrite', 'tripWrite', 'quoteApprove', 'userManage', 'orgSettingsWrite'],
    deny: ['platformCatalogWrite'],
  });
  check('sales_manager', {
    perms: ROLE_PERMISSION_MAP.sales_manager,
    allow: [
      'leadWrite',
      'leadAssign',
      'quoteWrite',
      'quoteApprove',
      'inventoryRiskApprove',
      'rateDriftApprove',
      'belowMarginApprove',
      'partyWrite',
      'networkWrite',
      'taskWrite',
    ],
    deny: ['userManage', 'orgSettingsWrite', 'policyManage', 'platformCatalogWrite'],
  });
  check('sales_executive', {
    perms: ROLE_PERMISSION_MAP.sales_executive,
    allow: ['leadWrite', 'quoteWrite', 'tripWrite', 'partyWrite', 'networkWrite'],
    deny: [
      'leadAssign',
      'quoteApprove',
      'inventoryRiskApprove',
      'rateDriftApprove',
      'userManage',
    ],
  });
  check('travel_consultant', {
    perms: ROLE_PERMISSION_MAP.travel_consultant,
    allow: ['inquiryWrite', 'tripWrite', 'itineraryEdit', 'quoteWrite', 'taskWrite'],
    deny: ['leadWrite', 'partyWrite', 'quoteApprove', 'userManage'],
  });
  check('finance', {
    perms: ROLE_PERMISSION_MAP.finance,
    allow: ['partnerFinanceWrite', 'settlementCreate', 'dashboardFinanceDocs'],
    deny: ['leadWrite', 'tripWrite', 'quoteWrite', 'partyWrite', 'userManage'],
  });
  check('operations', {
    perms: ROLE_PERMISSION_MAP.operations,
    allow: ['tripWrite', 'opsWrite', 'reservationsCreate', 'reservationsConfirm', 'reservationsCancel', 'incidentWrite', 'taskWrite'],
    deny: ['quoteWrite', 'partyWrite', 'userManage'],
  });

  it('auditor sees no write/action capabilities (read-only)', () => {
    const perms = ROLE_PERMISSION_MAP.auditor;
    const writeCaps: CapabilityKey[] = [
      'leadWrite', 'leadAssign', 'inquiryWrite', 'tripWrite', 'incidentWrite',
      'itineraryEdit', 'quoteWrite', 'quoteApprove', 'partyWrite', 'networkWrite',
      'settlementCreate', 'ratesWrite', 'taskWrite', 'userManage', 'orgSettingsWrite',
      'policyManage', 'reservationsCreate', 'inventoryManage', 'ratesManage',
      'opsWrite', 'profilePublish', 'platformCatalogWrite',
    ];
    const leaked = writeCaps.filter((c) => can(perms, c));
    expect(leaked, `auditor must not see: ${leaked.join(', ')}`).toEqual([]);
  });
});

describe('partner role x capability matrix', () => {
  check('partner owner', {
    perms: PARTNER_ROLE_PERMISSION_MAP.owner,
    allow: ['profilePublish', 'policyManage', 'partnerInventoryWrite', 'reservationsCreate', 'partnerFinanceWrite', 'ratesManage', 'inventoryManage', 'userManage'],
    deny: ['platformCatalogWrite', 'leadWrite'],
  });
  check('front_desk', {
    perms: PARTNER_ROLE_PERMISSION_MAP.front_desk,
    allow: ['reservationsCreate', 'reservationsConfirm', 'reservationsCancel', 'opsWrite', 'incidentWrite'],
    deny: ['ratesManage', 'inventoryManage', 'profilePublish', 'policyManage', 'userManage'],
  });
  check('housekeeping', {
    perms: PARTNER_ROLE_PERMISSION_MAP.housekeeping,
    allow: ['opsWrite', 'taskWrite'],
    deny: ['ratesManage', 'inventoryManage', 'profilePublish', 'userManage', 'networkWrite', 'partyWrite'],
  });
  check('reservation_manager', {
    perms: PARTNER_ROLE_PERMISSION_MAP.reservation_manager,
    allow: ['reservationsCreate', 'reservationsConfirm', 'reservationsCancel', 'ratesManage', 'inventoryManage', 'opsWrite', 'networkWrite', 'partnerFinanceWrite'],
    deny: ['profilePublish', 'policyManage', 'userManage'],
  });
  check('accountant', {
    perms: PARTNER_ROLE_PERMISSION_MAP.accountant,
    allow: ['partnerFinanceWrite', 'dashboardFinanceDocs'],
    deny: ['reservationsCreate', 'opsWrite', 'ratesManage', 'inventoryManage', 'partnerInventoryWrite', 'userManage'],
  });
});

describe('platform role x capability matrix', () => {
  check('platform_admin', {
    perms: PLATFORM_ROLE_PERMISSION_MAP.platform_admin,
    allow: ['platformCatalogWrite', 'userManage', 'orgSettingsWrite'],
    deny: ['tripWrite', 'leadWrite', 'reservationsCreate'],
  });
});
