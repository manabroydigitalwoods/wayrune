import { defineConfig, loadEnv as viteLoadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { existsSync, readFileSync } from 'fs';

function loadRootEnvFile(appEnv: string, root: string): Record<string, string> {
  const file = resolve(root, 'envs', `${appEnv}.env`);
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Map our APP_ENV (local|dev|prod) onto Vite's allowed modes. */
function viteModeFromAppEnv(appEnv: string): 'development' | 'production' {
  return appEnv === 'prod' ? 'production' : 'development';
}

export default defineConfig(({ mode }) => {
  const root = resolve(__dirname, '../..');
  const appEnv = process.env.APP_ENV || (mode === 'production' ? 'prod' : 'local');
  const viteMode = viteModeFromAppEnv(appEnv);
  const fileEnv = {
    ...viteLoadEnv(viteMode, root, ''),
    ...loadRootEnvFile(appEnv, root),
  };
  const apiTarget = fileEnv.API_PUBLIC_URL || 'http://localhost:3001';

  return {
    plugins: [react(), tailwindcss()],
    envDir: root,
    envPrefix: ['VITE_'],
    define: {
      'import.meta.env.VITE_APP_ENV': JSON.stringify(fileEnv.VITE_APP_ENV || appEnv),
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(fileEnv.VITE_API_BASE_URL || '/api/v1'),
    },
    server: {
      port: Number(fileEnv.WEB_PORT || 5173),
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        // Use TypeScript source so Vite gets ESM named exports (dist is CJS).
        '@travel/contracts': resolve(__dirname, '../../packages/contracts/src/index.ts'),
        '@travel/rbac': resolve(__dirname, '../../packages/rbac/src/index.ts'),
      },
    },
  };
});
