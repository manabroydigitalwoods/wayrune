# Agency site theme example

Full Wayrune Presence theme: look + chrome + 5-page site + custom `trip-highlight` component.

Local stack: **React + Vite + Tailwind**. Deployed artifact is a built ZIP from `dist/` (no React on the server).

## Mental model

```text
pnpm dev     → React app reading site/   (local only, HMR)
pnpm build   → dist/ ZIP layout
pnpm deploy  → uploads dist/ to an org
```

Wayrune never runs your React/`src/` code — only the built package from `dist/`.

## Layout

```text
agency-site/
  site/                      # package source (schema + config + assets) → packaged
    theme.json
    tokens.json
    structure.json
    chrome/
    components/

  src/                       # LOCAL ONLY — production-style preview app
    app/                     # App shell + providers
    pages/                   # route pages (Home, Destinations, …)
    features/
      navigation/            # hash router, Link, mobile nav
      sections/              # module preview registry + renderers
      theme/                 # token → CSS variables
    components/
      layout/                # SiteShell, header/footer, banner
      ui/                    # shared UI primitives
    lib/
      site/                  # typed loaders for site/*
      utils/
    storage/                 # localStorage keys + preview prefs
    styles/

  dist/                      # generated ZIP layout (gitignored)
  scripts/build.mjs
```

## Create a new theme

From the monorepo (CLI must be built):

```bash
pnpm --filter @wayrune/presence-sdk build
wr init agency-site my-theme
# or: node packages/presence-sdk/dist/cli.js init agency-site my-theme
cd my-theme
```

This scaffolds the full `site/` + `src/` structure. Then:

1. Edit `site/theme.json` — change `key` and `name` (defaults to `agency-site`)
2. `pnpm install`
3. `pnpm dev` → **http://localhost:5179/**

Legacy: `wr init travel-agency` still scaffolds the same example (with a deprecation warning).

## Quickstart (this example)

```bash
pnpm --filter @wayrune/presence-sdk build
cd packages/presence-sdk/examples/agency-site
pnpm install
pnpm dev                 # http://localhost:5179
pnpm build               # writes dist/
pnpm run validate && pnpm run pack
```

Use `pnpm run pack` / `pnpm run validate` (plain `pnpm pack` is pnpm’s own command).

## What to edit

| Goal | Edit here | Live in `pnpm dev`? | Ships in ZIP? |
|------|-----------|---------------------|---------------|
| Colors / fonts | `site/tokens.json` | Yes | Yes |
| Theme CSS | `src/styles/theme-src.css` | Yes | Yes (via `pnpm build`) |
| Header / footer | `site/chrome/*.html` | Yes | Yes |
| Pages & sections | `site/structure.json` | Yes* | Yes |
| Custom component | `site/components/<name>/` | Yes* | Yes |
| Local React UI | `src/**` | Yes | **No** |

\*New section types also need a React preview in `src/features/sections/` + `registry.ts`.

**Rule:** `site/` = product truth. `src/` = local app so you can develop like a normal React site.

## Extending the local app

| Add… | Where |
|------|--------|
| New page route | `site/structure.json` + `src/pages/*Page.tsx` + `pages/routes.tsx` |
| New section type | `features/sections/modules/*` + register in `registry.ts` |
| Shared UI | `components/ui/` |
| Layout chrome | `components/layout/` (or edit `site/chrome/`) |
| Persist prefs | `storage/` |

Path aliases: `@/*` → `src/*`, `@site/*` → `site/*`.

## Designer path

1. Edit `site/tokens.json` and `src/styles/theme-src.css`
2. Edit `site/chrome/*.html`
3. See changes in `pnpm dev` (HMR)

## Developer path

1. Edit `site/structure.json` and `site/components/`
2. Mirror new modules in `src/features/sections` for local preview
3. Ship:

```bash
# API running, e.g. localhost:3001
wr auth login --api-base http://localhost:3001
# optional: --organization-slug <slug> --account my-org

pnpm run validate
pnpm deploy          # or: pnpm deploy:dry
```

## What uploads

Only `dist/` contents: `theme.json`, `tokens.json`, `styles/`, `chrome/`, `components/`, `site/structure.json`, preview.  
Everything under `src/` stays local.

More CLI detail: [packages/presence-sdk/README.md](../../README.md).
