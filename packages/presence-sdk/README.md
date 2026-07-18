# Wayrune theme & component packages

Build packages locally, ZIP them, then upload from **Digital Presence** — or deploy with the **Wayrune CLI** (`wr`). Wayrune hosts the files — it does **not** compile TSX or run package installs on the server. Use **pnpm** for all local theme/component workflows.

Canonical product & architecture: [docs/digital-presence.md](../../docs/digital-presence.md). Full packaging rules: [docs/presence-theme-packages.md](../../docs/presence-theme-packages.md).

| Package | Upload from | Sample in UI |
|---------|-------------|--------------|
| **Theme** (look, optional full site) | Themes → Upload theme ZIP **or** `wr deploy` | **Download sample** / **Use sample** |
| **Component** | Components → Upload ZIP **or** `wr deploy` | **Download sample** / **Use sample** |

A **theme** may include `components/` and `site/structure.json` so one ZIP installs the entire website. There is no separate site-kit package.

---

## Agency site quickstart (recommended)

End-to-end example with **React + Vite + Tailwind** local preview and CLI deploy to a specific org.

**Full develop guide:** [`examples/agency-site/README.md`](./examples/agency-site/README.md) (layout, create theme, what to edit, extend pages/sections, deploy).

```bash
pnpm --filter @wayrune/presence-sdk build
cd packages/presence-sdk/examples/agency-site
pnpm install
pnpm dev                 # http://localhost:5179 (site/ + src/)
pnpm build               # writes dist/ (ZIP layout)
```

Layout: `site/` = theme schema/config/chrome/components; `src/` = local production-style app (pages, features, components, storage); `dist/` = built package.

### Create a new theme

```bash
pnpm --filter @wayrune/presence-sdk build
node packages/presence-sdk/dist/cli.js init agency-site my-theme
# or: wr init agency-site my-theme
cd my-theme && pnpm install && pnpm dev
```

Then rename `key` / `name` in `site/theme.json` before deploy.

### Designer path

1. Edit `site/tokens.json` and `src/styles/theme-src.css`
2. Refresh `pnpm dev` (HMR)
3. Edit `site/chrome/header.html` / `footer.html`

### Developer path

1. Edit `site/structure.json` and `site/components/`
2. `pnpm run validate` → `pnpm run pack` (use `pnpm run pack`, not bare `pnpm pack`)
3. Deploy to an org:

```bash
wr auth login --api-base http://localhost:3001
wr auth list
pnpm deploy
# pnpm deploy:dry
```

Or scaffold a copy:

```bash
wr init agency-site my-agency-site
```

Legacy: `wr init travel-agency` still works (warns; same scaffold). Aliases: `wayrune`, `presence`.

---

## Standalone component quickstart

Same layout pattern as themes — use **`component/`** instead of **`site/`**.

**Full guide:** [`examples/promo-banner/README.md`](./examples/promo-banner/README.md).

```text
my-banner/
  component/     # package source (component.json, html, css, preview)
  src/           # local React playground + mount.ts
  dist/          # pnpm build → ZIP layout
```

```bash
pnpm --filter @wayrune/presence-sdk build
wr init component my-banner
cd my-banner && pnpm install && pnpm dev   # http://localhost:5180
pnpm build && pnpm deploy                 # → POST /presence/modules/upload-package
```

Or work in the example: `cd packages/presence-sdk/examples/promo-banner`.

---

## Wayrune CLI (`wr`)

Primary binary: **`wr`**. Aliases: `wayrune`, `presence` (same `dist/cli.js` from `@wayrune/presence-sdk`).

| Command | Purpose |
|---------|---------|
| `wr auth login` | Email/password → JWT; store named account in `~/.wayrune/config.json` (falls back to `~/.presence`) |
| `wr auth list` / `accounts` | Show accounts |
| `wr auth use <name>` | Default account |
| `wr auth logout` | Remove account |
| `wr validate [dir] [--type theme\|component]` | Auto-detect package kind; validate |
| `wr pack [dir] [-o out.zip] [--type …]` | ZIP theme or component package |
| `wr deploy [dir] [--type …]` | Validate → pack → upload (themes or modules endpoint) |
| `wr init agency-site [dir]` | Scaffold full theme (`site/` + `src/`) |
| `wr init component [dir]` | Scaffold standalone component (`component/` + `src/`) |

Project defaults: `presence.config.json` (`account`, `siteName`, `onConflict`, `confirmReplace`).

Deploy flags: `--account`, `--api-base`, `--site-name`, `--confirm-replace`, `--on-conflict`, `--dry-run`, `--type`.

Org is selected via the **named account** (JWT embeds `organizationId`). On 401, run `wr auth login` again.

Auto-detect: `theme.json` / `site/theme.json` → theme; `component.json` / `component/component.json` → component. Prefer `pnpm build` then validate/pack/deploy against `dist/`.

Catalog scripts (monorepo): `pnpm wr:catalog:validate` (legacy: `pnpm presence:catalog:*`).

---

## Theme package

### Layout

```text
my-theme/
  theme.json
  tokens.json
  styles/theme.css
  scripts/theme.js          # optional
  chrome/header.html        # optional (no <script>)
  chrome/footer.html
  assets/…
  preview.png               # optional
  components/               # optional bundled components
    my-block/
      component.json
      …
  site/                     # optional pages
    structure.json
```

### `theme.json`

```json
{
  "key": "sample-coastal",
  "name": "Sample Coastal",
  "version": "1.0.0",
  "description": "Teal travel theme starter",
  "stylesheets": ["styles/theme.css"],
  "preview": "preview.svg",
  "chrome": {
    "header": "chrome/header.html",
    "footer": "chrome/footer.html"
  },
  "menuLocations": [
    { "key": "primary", "label": "Primary", "description": "Header nav" },
    { "key": "footer", "label": "Footer", "description": "Footer links" }
  ],
  "components": [{ "path": "components/my-block", "key": "my-block" }],
  "site": "site/structure.json",
  "installSite": "create_site"
}
```

`preview` may be a package image path or an `https://` URL.

`installSite`: `none` | `create_site` | `update_primary` (default `create_site` when `site/` is present). Use `confirmReplace=true` for `update_primary`.

Site menus are edited in the builder (**Menus**). Themes declare `menuLocations`; sites store named menus and assignments. See [docs/presence-theme-packages.md](../../docs/presence-theme-packages.md#site-menus-navigator).

### `tokens.json` (parent themes)

Required color/font tokens for parent themes. See docs for the parent token set.

---

## Component package

Standalone component ZIPs still work for the library. Prefer authoring with `component/` + `src/` + `dist/` ([promo-banner example](./examples/promo-banner)). Bundling under a theme’s `components/` is preferred when shipping a full website.

---

## Vite author templates

| Template | Path |
|----------|------|
| Component (canonical) | [`examples/promo-banner`](./examples/promo-banner) |
| Component (flat Vite) | [`templates/component-vite`](./templates/component-vite) |
| Theme | [`templates/theme-vite`](./templates/theme-vite) |
| Full site example | [`examples/agency-site`](./examples/agency-site) |

Each: `pnpm install` → edit → `pnpm build && pnpm run pack` (or `wr deploy`) → upload the ZIP.

### Invariants

- No TSX on the server — only built HTML/CSS/JS in the ZIP
- Scoped CSS; package components run in sandboxed iframes
- `src/` preview code is never packed
- Theme package source lives in `site/`; standalone component source in `component/`
