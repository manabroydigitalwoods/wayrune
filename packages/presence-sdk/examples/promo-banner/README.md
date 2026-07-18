# Promo banner component example

Standalone Presence component with the same layout pattern as the travel theme — **`component/`** instead of **`site/`**.

## Mental model

```text
pnpm dev     → React props playground (reads component/ + src/)
pnpm build   → dist/ ZIP layout
pnpm deploy  → uploads dist/ to org (Components library)
```

## Layout

```text
promo-banner/
  component/              # package source → packaged
    component.json
    index.html
    styles.css
    preview.svg
  src/                    # LOCAL ONLY
    mount.ts              # PresenceMount (built to dist/index.js)
    app/                  # playground shell
    features/preview/     # props editor + live mount
    styles/
  dist/                   # generated ZIP layout
  scripts/build.mjs
```

## Create a new component

```bash
pnpm --filter @wayrune/presence-sdk build
wr init component my-banner
# or: node packages/presence-sdk/dist/cli.js init component my-banner
cd my-banner
pnpm install
pnpm dev                 # http://localhost:5180
```

Rename `key` / `name` in `component/component.json` if needed (init sets them from the folder name).

## Quickstart (this example)

```bash
pnpm --filter @wayrune/presence-sdk build
cd packages/presence-sdk/examples/promo-banner
pnpm install
pnpm dev
pnpm build
pnpm run validate && pnpm run pack
```

## What to edit

| Goal | Edit | Ships? |
|------|------|--------|
| Manifest / schema / defaults | `component/component.json` | Yes |
| Markup shell | `component/index.html` | Yes |
| Styles | `component/styles.css` | Yes |
| Mount behavior | `src/mount.ts` | Yes (as `index.js`) |
| Playground UI | `src/app`, `src/features` | No |

## Deploy

```bash
node ../../dist/cli.js auth login --api-base http://localhost:3001
pnpm deploy
# pnpm deploy:dry
```

More: [packages/presence-sdk/README.md](../../README.md).
