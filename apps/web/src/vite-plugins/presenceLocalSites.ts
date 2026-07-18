import type { Plugin, ProxyOptions } from 'vite';
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

export type PresenceLocalSitesOptions = {
  apiTarget: string;
  siteBaseDomain: string;
  /** When true, draft sites render (local only). */
  previewDrafts?: boolean;
};

function hostnameOf(hostHeader: string | undefined): string {
  return (hostHeader || '').split(':')[0]?.toLowerCase() || '';
}

function isPresenceSiteHost(host: string, siteBaseDomain: string): boolean {
  const base = siteBaseDomain.toLowerCase().replace(/^\./, '');
  if (!host || !base) return false;
  if (host === 'localhost' || host === '127.0.0.1') return false;
  return host === base || host.endsWith(`.${base}`);
}

/** Vite/public assets — do not treat as Presence page paths. */
function shouldPassThroughToVite(pathname: string): boolean {
  if (pathname === '/widget.js') return true;
  if (pathname.startsWith('/api')) return true;
  if (
    pathname.startsWith('/@') ||
    pathname.startsWith('/node_modules') ||
    pathname.startsWith('/src/') ||
    pathname.startsWith('/__vite')
  ) {
    return true;
  }
  // Static files from apps/web/public (and Vite-transformed assets).
  return /\.(?:js|mjs|cjs|css|map|ico|png|jpe?g|gif|webp|svg|woff2?|ttf|eot|json|txt|webmanifest)$/i.test(
    pathname,
  );
}

/**
 * Serves Digital Presence public HTML when the browser Host is a platform
 * subdomain (e.g. `10001.codepoetry.localhost` or `slug.10001.codepoetry.localhost`).
 * ERP stays on `localhost:5173`; sites open on real-looking local subdomains.
 */
export function presenceLocalSitesPlugin(opts: PresenceLocalSitesOptions): Plugin {
  const base = opts.siteBaseDomain.trim().replace(/^\./, '');
  const preview = opts.previewDrafts !== false;

  return {
    name: 'presence-local-sites',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const host = hostnameOf(req.headers.host);
        if (!isPresenceSiteHost(host, base)) {
          next();
          return;
        }

        const rawUrl = req.url || '/';
        const parsed = new URL(rawUrl, `http://${host}`);
        const path = parsed.pathname || '/';
        // Let Vite serve public/widget.js, HMR, and the /api proxy.
        if (shouldPassThroughToVite(path)) {
          next();
          return;
        }

        const api = new URL(opts.apiTarget);
        const qs = new URLSearchParams({
          host,
          path,
          ...(preview ? { preview: '1' } : {}),
        });
        const targetPath = `/api/v1/presence/public?${qs.toString()}`;

        const lib = api.protocol === 'https:' ? https : http;
        const upstream = lib.request(
          {
            hostname: api.hostname,
            port: api.port || (api.protocol === 'https:' ? 443 : 80),
            path: targetPath,
            method: 'GET',
            headers: {
              Accept: 'text/html',
              'X-Forwarded-Host': host,
              Host: api.host,
            },
          },
          (up) => {
            res.statusCode = up.statusCode || 502;
            const type = up.headers['content-type'] || 'text/html; charset=utf-8';
            res.setHeader('Content-Type', type);
            if (up.headers['cache-control']) {
              res.setHeader('Cache-Control', String(up.headers['cache-control']));
            }
            up.pipe(res);
          },
        );
        upstream.on('error', (err) => {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(
            `Presence site proxy error: ${err.message}\nIs the API running at ${opts.apiTarget}?`,
          );
        });
        upstream.end();
      });
    },
  };
}

/** Preserve browser Host for presence media resolution behind Vite's /api proxy. */
export function presenceApiProxyOptions(apiTarget: string): ProxyOptions {
  return {
    target: apiTarget,
    changeOrigin: true,
    configure(proxy) {
      proxy.on('proxyReq', (proxyReq, req) => {
        const forwarded = hostnameOf(
          (req.headers['x-forwarded-host'] as string | undefined) || req.headers.host,
        );
        if (forwarded) {
          proxyReq.setHeader('x-forwarded-host', forwarded);
        }
      });
    },
  };
}
