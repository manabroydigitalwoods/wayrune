import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  apiUrl,
  loadGlobalConfig,
  normalizeApiBase,
  saveGlobalConfig,
} from './config.js';
import type { PresenceAccount } from './types.js';

function slugAccountName(email: string, organizationName: string): string {
  const base = `${organizationName}-${email.split('@')[0] || 'user'}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return base || 'default';
}

async function prompt(question: string, hidden = false): Promise<string> {
  if (!input.isTTY) {
    throw new Error('Interactive login requires a TTY. Pass --email and --password.');
  }
  if (!hidden) {
    const rl = createInterface({ input, output });
    try {
      return (await rl.question(question)).trim();
    } finally {
      rl.close();
    }
  }
  output.write(question);
  return await new Promise<string>((resolve, reject) => {
    const wasRaw = input.isRaw;
    input.setRawMode?.(true);
    let value = '';
    const onData = (chunk: Buffer) => {
      const s = chunk.toString('utf8');
      for (const ch of s) {
        if (ch === '\n' || ch === '\r') {
          input.off('data', onData);
          input.setRawMode?.(wasRaw ?? false);
          output.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          input.off('data', onData);
          input.setRawMode?.(wasRaw ?? false);
          reject(new Error('Cancelled'));
          return;
        }
        if (ch === '\u007f') {
          value = value.slice(0, -1);
          continue;
        }
        value += ch;
      }
    };
    input.on('data', onData);
  });
}

export async function authLogin(opts: {
  account?: string;
  apiBase?: string;
  email?: string;
  password?: string;
  organizationSlug?: string;
}): Promise<void> {
  const apiBase = normalizeApiBase(
    opts.apiBase || process.env.PRESENCE_API_BASE || 'http://localhost:3001',
  );
  const email = opts.email || (await prompt('Email: '));
  const password = opts.password || (await prompt('Password: ', true));
  if (!email || !password) throw new Error('Email and password are required');

  const loginPayload: Record<string, string> = { email, password };
  if (opts.organizationSlug) loginPayload.organizationSlug = opts.organizationSlug;

  const loginRes = await fetch(apiUrl(apiBase, '/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(loginPayload),
  });
  const loginBody = (await loginRes.json().catch(() => ({}))) as Record<string, unknown>;
  if (!loginRes.ok) {
    const msg =
      typeof loginBody.message === 'string'
        ? loginBody.message
        : Array.isArray(loginBody.message)
          ? loginBody.message.join('; ')
          : `Login failed (${loginRes.status})`;
    throw new Error(msg);
  }

  const accessToken = String(loginBody.accessToken || '');
  const organizationId = String(loginBody.organizationId || '');
  if (!accessToken || !organizationId) {
    throw new Error('Login response missing accessToken or organizationId');
  }

  let organizationName = organizationId;
  const meRes = await fetch(apiUrl(apiBase, '/auth/me'), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (meRes.ok) {
    const me = (await meRes.json()) as { organization?: { name?: string } };
    if (me.organization?.name) organizationName = me.organization.name;
  }

  const accountName = opts.account || slugAccountName(email, organizationName);
  const account: PresenceAccount = {
    apiBase,
    accessToken,
    organizationId,
    organizationName,
    email,
  };

  const config = loadGlobalConfig();
  config.accounts[accountName] = account;
  config.defaultAccount = accountName;
  saveGlobalConfig(config);

  console.log(`Logged in as ${email}`);
  console.log(`Account: ${accountName}`);
  console.log(`Organization: ${organizationName} (${organizationId})`);
  console.log(`API: ${apiBase}`);
  console.log(`Saved to ~/.wayrune/config.json`);
}

export function authLogout(account?: string): void {
  const config = loadGlobalConfig();
  const name = account || config.defaultAccount;
  if (!name || !config.accounts[name]) {
    throw new Error(name ? `Unknown account: ${name}` : 'No default account to logout');
  }
  delete config.accounts[name];
  if (config.defaultAccount === name) {
    config.defaultAccount = Object.keys(config.accounts)[0];
  }
  saveGlobalConfig(config);
  console.log(`Logged out account: ${name}`);
}

export function authList(): void {
  const config = loadGlobalConfig();
  const names = Object.keys(config.accounts);
  if (!names.length) {
    console.log('No accounts. Run: wr auth login');
    return;
  }
  for (const name of names) {
    const a = config.accounts[name]!;
    const mark = config.defaultAccount === name ? '*' : ' ';
    console.log(
      `${mark} ${name}  ${a.organizationName} (${a.organizationId})  ${a.email}  ${a.apiBase}`,
    );
  }
}

export function authUse(name: string): void {
  const config = loadGlobalConfig();
  if (!config.accounts[name]) throw new Error(`Unknown account: ${name}`);
  config.defaultAccount = name;
  saveGlobalConfig(config);
  console.log(`Default account: ${name}`);
}

export function resolveAccount(opts: {
  account?: string;
  apiBase?: string;
}): PresenceAccount {
  const config = loadGlobalConfig();
  const name = opts.account || config.defaultAccount;
  if (!name || !config.accounts[name]) {
    throw new Error(
      'No Wayrune account configured. Run: wr auth login\n' +
        'Or pass --account <name> after logging in.',
    );
  }
  const account = { ...config.accounts[name]! };
  if (opts.apiBase) account.apiBase = normalizeApiBase(opts.apiBase);
  return account;
}
