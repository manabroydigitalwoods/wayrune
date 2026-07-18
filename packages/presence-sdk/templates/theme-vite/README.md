# Presence theme (Vite)

1. Build the SDK CLI once from the monorepo: `pnpm --filter @wayrune/presence-sdk build`
2. `pnpm install`
3. Edit `tokens.json` and `styles/theme.css` (optional `src/theme.ts`)
4. Optionally add `components/<key>/` packages and `site/structure.json`, then set `installSite` in `theme.json`
5. `pnpm build && pnpm run pack` (pack uses `@wayrune/presence-sdk` shared packer — includes `site/` + `components/` when present)
6. Upload `out/coastal-starter-theme.zip` from Digital Presence → Themes, or `wr deploy` from a full example

For a complete travel site with React/Tailwind preview and org deploy, see [`examples/agency-site`](../../examples/agency-site).

A theme ZIP can be look-only or a full site (components + pages). There is no separate site-kit package.
