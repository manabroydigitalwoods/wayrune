/** Typed logical keys (prefixed with `travel.` by the storage kit). No auth secrets. */
export const StorageKeys = {
  ui: {
    theme: 'ui.theme',
    themeCookie: 'travel.ui.theme',
    density: 'ui.density',
    fontScale: 'ui.fontScale',
    motion: 'ui.motion',
    glass: 'ui.glass',
    colorTheme: 'ui.colorTheme',
    highContrast: 'ui.highContrast',
    customAccent: 'ui.customAccent',
    sidebarCollapsedDefault: 'ui.sidebarCollapsedDefault',
    appearanceInitialized: 'ui.appearanceInitialized',
    sidebarCollapsed: 'ui.sidebarCollapsed',
    navBookmarks: 'ui.navBookmarks',
    /** Queue Standard deep-link pins (path + query), max 7. */
    navDeepPins: 'ui.navDeepPins',
    sidebarScrollTop: 'ui.sidebarScrollTop',
    floatingComposerLayout: 'ui.floatingComposerLayout.v3',
  },
  leads: {
    view: 'leads.view',
    columns: 'leads.columns',
    /** Per-device acquisition source tap counts for call intake suggestions. */
    acquisitionSourceUsage: 'leads.acquisitionSourceUsage',
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
  places: {
    columns: 'places.columns',
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
