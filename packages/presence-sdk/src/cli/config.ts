import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { PresenceGlobalConfig, PresenceProjectConfig } from './types.js';

const WAYRUNE_DIR = join(homedir(), '.wayrune');
const LEGACY_PRESENCE_DIR = join(homedir(), '.presence');

export function globalConfigPath(): string {
  const preferred = join(WAYRUNE_DIR, 'config.json');
  if (existsSync(preferred)) return preferred;
  const legacy = join(LEGACY_PRESENCE_DIR, 'config.json');
  if (existsSync(legacy)) return legacy;
  return preferred;
}

export function loadGlobalConfig(): PresenceGlobalConfig {
  const path = globalConfigPath();
  if (!existsSync(path)) return { accounts: {} };
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as PresenceGlobalConfig;
    return {
      defaultAccount: typeof raw.defaultAccount === 'string' ? raw.defaultAccount : undefined,
      accounts: raw.accounts && typeof raw.accounts === 'object' ? raw.accounts : {},
    };
  } catch {
    return { accounts: {} };
  }
}

export function saveGlobalConfig(config: PresenceGlobalConfig): void {
  const path = join(WAYRUNE_DIR, 'config.json');
  mkdirSync(WAYRUNE_DIR, { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export function loadProjectConfig(dir: string): PresenceProjectConfig {
  const path = join(dir, 'presence.config.json');
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PresenceProjectConfig;
  } catch {
    return {};
  }
}

export function normalizeApiBase(raw: string): string {
  return raw.replace(/\/+$/, '').replace(/\/api\/v1$/i, '');
}

export function apiUrl(apiBase: string, path: string): string {
  const base = normalizeApiBase(apiBase);
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}/api/v1${p}`;
}
