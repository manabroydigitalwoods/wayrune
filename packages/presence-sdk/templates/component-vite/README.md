# Presence component (Vite)

Canonical layout for new work: `component/` + `src/` + `dist/` — see [`examples/promo-banner`](../../examples/promo-banner). Prefer **pnpm** for install/build/pack/deploy.

This template keeps a flatter Vite lib build for quick experiments:

1. Build the SDK CLI: `pnpm --filter @wayrune/presence-sdk build`
2. `pnpm install`
3. Edit `src/main.ts` and `styles.css`
4. `pnpm build && pnpm run pack` (pack uses shared `packComponentDirectory`)
5. Upload `out/my-promo-banner.zip` from Digital Presence → Components, or `presence deploy`

The build must expose `window.PresenceMount` (IIFE). Do not upload TypeScript source.

```bash
presence init component my-banner   # preferred scaffold
cd my-banner && pnpm install && pnpm dev
```
