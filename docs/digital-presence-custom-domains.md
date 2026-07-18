# Custom domains (Digital Presence)

Product boundaries and architectural invariants: see [Digital Presence](./digital-presence.md).

Organization identity stores an optional org-level `customDomain`. Each **website** gets a default **platform host** on create; you can optionally connect your own hostname via `PresenceSite.primaryDomain` (unique globally).

## Platform hosts (HubSpot-style)

Every website gets a default URL on the platform edge:

| Site | Default host |
|------|----------------|
| **Primary** | `{publicCode}.{SITE_BASE_DOMAIN}` — e.g. `10001.codepoetry.app` |
| **Additional** | `{platformSlug}.{publicCode}.{SITE_BASE_DOMAIN}` — e.g. `yftkcn4k.10001.codepoetry.app` |

`publicCode` is the org’s numeric id (same as support/widget URLs). Non-primary sites receive a random `platformSlug` on create. Connect a **custom domain** in **Settings** to replace the platform host when you are ready.

## Resolution order (public renderer)

1. **Custom domain** — Host matches `PresenceSite.primaryDomain` → that website (published).
2. **Platform host** — `{publicCode}.base` or `{slug}.{publicCode}.base` → org + website.
3. **Legacy org subdomain** — `{subdomain}.{SITE_BASE_DOMAIN}` → Primary website.
4. **Org custom domain** — `Organization.customDomain` → Primary website.

Public renderer: `GET /api/v1/presence/public?path=/` using the `Host` header (or `X-Forwarded-Host` / `?host=` for local / tunnels).

UI: **Websites** → select a site → **Settings** → Custom domain.

## Local development (real subdomains)

Browsers resolve `*.localhost` to `127.0.0.1` (no `/etc/hosts` needed).

1. In `envs/local.env`:

```bash
SITE_BASE_DOMAIN=codepoetry.localhost
```

2. Restart `./dev` (API + Vite) so both pick up the domain.

3. Open the ERP at `http://localhost:5173`, then click a site host in **Websites**, or visit directly:

| Site | Local URL |
|------|-----------|
| Primary | `http://10001.codepoetry.localhost:5173` |
| Additional | `http://{slug}.10001.codepoetry.localhost:5173/destinations` |

Vite serves presence HTML for those Host headers and proxies `/api` (including media) with `X-Forwarded-Host` so resolution matches production. Draft sites are previewable locally.

**Preview** (query override, no subdomain):  
`/api/v1/presence/public?host=10001.codepoetry.localhost&path=/&preview=1`

## Live / production

1. Set `SITE_BASE_DOMAIN=codepoetry.app` (or your apex).
2. Point DNS: `*.codepoetry.app` (and apex if needed) at the platform edge that terminates TLS and forwards `Host` / `X-Forwarded-Host` to the API public renderer.
3. Custom domains: CNAME (or ALIAS) to the platform edge, then enter the hostname in **Settings**.

## Manual DNS setup (custom domain)

1. Create a **CNAME** (or ALIAS) from your hostname to the platform edge.
2. Enter the hostname in Settings (e.g. `www.example.com`) — no `https://`.
3. Publish the website when ready.

## Deferred

- Domain ownership verification (TXT / HTTP challenge)
- Automated certificate provisioning (ACME)
- Self-serve DNS wizard in Settings → Digital presence

Do not confuse `publicCode` (numeric, public URLs) with the cuid used in JWT and FKs.
