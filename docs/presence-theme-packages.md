# Presence theme packages

Product boundaries and architectural invariants: see [Digital Presence](./digital-presence.md).

## Taxonomy

| Layer | UI label | What it is | DB |
|-------|----------|------------|-----|
| **Theme** (+ child) | Themes | Look & feel; optionally full site (components + pages) | `PresenceTheme` |
| **Component** | Components | Library building block (hero, form, …) | `PresenceModuleDefinition` |
| **Section** | Section | Instance of a component on a page | `PresenceSection` |
| **Starter** | Starters | Prefab site/page layouts | `PresenceSiteTemplate` / `PresencePageTemplate` |

### Ownership rules

1. **Themes** own appearance (parent → child cascade like WordPress). A theme ZIP may also ship bundled components and multi-page structure — one package for a complete website. **System themes** embed a default multi-page site (from matching starters) in `manifestJson.defaultSiteStructure`.
2. **Components** own what can be added in the library (standalone ZIP still supported).
3. **Sections** own content on a page (props + tree).
4. **Starters** bootstrap pages/sites; they recommend themes but are not themes. Creating a site from a full-site theme uses the theme structure unless you pick a starter override.

Create site: `POST /presence/sites/from-theme` (theme built-in pages) or `POST /presence/sites/from-template` (starter override).

API paths may still say `/modules` and `*Template` for compatibility; product copy uses the labels above.

## Parent / child themes

- A **parent** theme is a full design system (`tokensJson`, optional package files).
- A **child** theme sets `parentThemeId` / `theme.json` → `parent` and overrides only what it needs.
- Effective tokens = `{ ...parent.tokens, ...child.tokens }` (single parent level in v1).
- Customizing a system theme should **create a child**, not mutate the system row.
- UI: **Child theme** on a parent card; **Duplicate** creates an independent copy.

## Built package ZIP

Authors build locally (React/Vite/etc.), then upload from Digital Presence **or** deploy with the Wayrune CLI (`wr`):

- **Themes** → Upload theme ZIP, or `wr deploy` (auto-detects theme) to a named org account
- **Components** → Upload component ZIP, or `wr init component` + `wr deploy` (→ `/presence/modules/upload-package`)

Authoring layouts (local):

- Theme: `site/` + `src/` → `dist/` — see [agency-site example](../packages/presence-sdk/examples/agency-site/)
- Component: `component/` + `src/` → `dist/` — see [promo-banner example](../packages/presence-sdk/examples/promo-banner/)

CLI overview: [packages/presence-sdk/README.md](../packages/presence-sdk/README.md).

Presence hosts files and mounts component JS in a **sandboxed iframe**. Server does **not** compile TSX or run package installs. Local authoring uses **pnpm**.

### Style isolation (ERP ↔ public site)

| Surface | Isolation |
|---------|-----------|
| **Public site HTML** | Separate document (`html.presence-public`). Never loads ERP/React CSS. Theme ZIP CSS is `@scope`d under `html.presence-public`. |
| **Local subdomains** | `*.{SITE_BASE_DOMAIN}` serves only Presence HTML; ERP stays on `localhost`. |
| **Builder live canvas** | Theme `packageCss` is scoped to `.presence-live` with `contain: style`. ERP shell styles do not apply inside the canvas host vars. |
| **Package components** | Always `iframe[sandbox]` + `srcdoc` (no shared CSSOM with the host page). |
| **Preview mode** | Full public URL in an iframe — same isolation as the live site. |

Theme authors should prefer `.presence-*` / token vars (`--presence-primary` or scoped `--primary`). Avoid bare `body`/`html` rules when possible; the platform remaps them under the scope host.

### Theme layout

```text
my-theme/
  theme.json
  tokens.json
  styles/theme.css
  scripts/theme.js          # optional
  chrome/header.html        # optional (no <script>)
  chrome/footer.html
  assets/…
  preview.png
  components/               # optional — each subfolder = component package
    promo-banner/
      component.json
      …
  site/                     # optional — full site structure
    structure.json
```

`theme.json` optional fields:

- `components`: `[{ "path": "components/promo-banner", "key": "…" }]` (or auto-discover)
- `site`: path to structure (default `site/structure.json`)
- `installSite`: `none` | `create_site` | `update_primary`  
  Default: `create_site` if structure exists, else `none`.  
  `update_primary` requires form field `confirmReplace=true`.
- `menuLocations`: `[{ "key": "primary", "label": "Primary", "description": "Header nav" }, …]` — locations the theme’s chrome consumes. Sites build named menus and assign them to these keys.

Also accept form fields `onConflict=overwrite|suffix`.

### Site menus (navigator)

Named menus live on the **site** (`menusJson` / `menuAssignmentsJson`); themes only declare **locations**.

```json
// site/structure.json (or PresenceSite fields)
{
  "navigation": [{ "label": "Home", "path": "/" }],
  "menus": {
    "primary": {
      "id": "primary",
      "name": "Primary",
      "items": [
        { "id": "mi1", "label": "Home", "path": "/" },
        {
          "id": "mi2",
          "label": "Trips",
          "path": "/trips",
          "children": [{ "id": "mi2a", "label": "Asia", "path": "/trips/asia" }]
        }
      ]
    },
    "footer": { "id": "footer", "name": "Footer", "items": [] }
  },
  "menuAssignments": { "primary": "primary", "footer": "footer" }
}
```

- Prefer `path` on menu items (legacy `href` is normalized to `path` on import).
- One-level children only (dropdown). Flat Primary items are also written to `navigationJson` for older clients.
- Runtime header/footer resolve `location → menu → items`. Package `chrome/header.html` cannot Liquid-bind menus yet; when a package header is present, Primary nav is injected as a sibling `.site-nav--injected` (Phase 2: Liquid `{{ menu.primary }}`).

Export a live site as a full theme: **Pages → Export theme** (`POST /presence/sites/:siteId/export-theme`).

### Component layout

```text
my-component/
  component.json
  index.html
  styles.css
  index.js
  preview.png
  assets/…
```

### Card thumbnails

Set `"preview"` in `theme.json` / `component.json` to a package-relative image or an `https://` URL.

### `mount` contract (component JS)

```js
window.PresenceMount = function (el, props, ctx) { /* … */ };
```

### Limits

- Max uncompressed size: 5 MB; max 100 files
- Allowed: `.json`, `.html`, `.css`, `.js`, `.mjs`, `.map`, images, fonts, `.md`
- Reject source (`.tsx`/`.jsx`/`.ts`) and nested ZIPs
- CSS: no remote `@import` / `url(https://…)`
- HTML: no `<script>` (JS only via declared entry scripts)

### APIs

| Endpoint | Behavior |
|----------|----------|
| `POST /presence/themes/upload-package` | theme ZIP (look + optional components/site) |
| `POST /presence/themes/:themeId/export` | download look-only theme ZIP |
| `POST /presence/sites/:siteId/export-theme` | full theme (look + used components + structure) |
| `POST /presence/modules/upload-package` | standalone component ZIP |
| `POST /presence/themes/:themeId/create-child` | child theme |

## Freeform responsive frames

Root freeform sections may store `frame.tablet` / `frame.mobile` / `frame.mobileScale`. Builder device preview edits the active breakpoint; public pages emit media queries.

## Marketplace

Publishing snapshots package rows including hosted `files[]`. Install rematerializes binaries into the installing org so JS URLs stay valid.

## Author tooling

- Package: [`packages/presence-sdk`](../packages/presence-sdk)
- Example: [`packages/presence-sdk/examples/promo-banner`](../packages/presence-sdk/examples/promo-banner)
- Vite templates: [`templates/component-vite`](../packages/presence-sdk/templates/component-vite), [`templates/theme-vite`](../packages/presence-sdk/templates/theme-vite)

From the product UI: **Themes / Components → Upload → Download sample**.
