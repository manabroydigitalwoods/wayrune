/** Typed logical keys (prefixed with `travel.` by the storage kit). No auth secrets. */
export const StorageKeys = {
  ui: {
    theme: 'ui.theme',
    themeCookie: 'travel.ui.theme',
    sidebarCollapsed: 'ui.sidebarCollapsed',
    navBookmarks: 'ui.navBookmarks',
    sidebarScrollTop: 'ui.sidebarScrollTop',
    floatingComposerLayout: 'ui.floatingComposerLayout',
  },
  leads: {
    view: 'leads.view',
    columns: 'leads.columns',
  },
  parties: {
    columns: 'parties.columns',
  },
  tasks: {
    columns: 'tasks.columns',
  },
  inquiries: {
    columns: 'inquiries.columns',
  },
  trips: {
    columns: 'trips.columns',
  },
  movementBoard: {
    columns: 'movementBoard.columns',
    view: 'movementBoard.view',
  },
  financeAging: {
    columns: 'financeAging.columns',
  },
  financePortfolio: {
    columns: 'financePortfolio.columns',
    presets: 'financePortfolio.presets',
  },
  suppliers: {
    columns: 'suppliers.columns',
  },
  rates: {
    hotelColumns: 'rates.hotelColumns',
    transferColumns: 'rates.transferColumns',
  },
  presence: {
    columns: 'presence.columns',
    builderUi: 'presence.builderUi',
  },
  onboarding: {
    checklistDismissed: 'onboarding.checklistDismissed',
    firstQuoteWalkthroughDismissed: 'onboarding.firstQuoteWalkthroughDismissed',
  },
} as const;

export const LegacyStorageKeys = {
  theme: 'travel-ui-theme',
  leadsView: 'travel.leads.view',
  leadsColumns: 'travel.leads.columns',
} as const;
