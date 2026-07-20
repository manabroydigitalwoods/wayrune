#!/usr/bin/env node
/**
 * Sync `_prisma_migrations.checksum` for known edited historical migrations.
 * Needed after fixing shadow-replay bugs in already-applied SQL files.
 *
 * Usage: node scripts/repair-migration-checksums.mjs
 * Reads DATABASE_URL from env / .env (same as Prisma CLI).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Migrations whose SQL was corrected after first apply (shadow replay). */
const REPAIRED = [
  '20260714020000_finance_full',
  '20260717010000_org_identity_presence',
];

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const text = readFileSync(path.join(root, '.env'), 'utf8');
    const m = text.match(/^DATABASE_URL=(.*)$/m);
    if (!m) return null;
    let v = m[1].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    return v;
  } catch {
    return null;
  }
}

function parseMysqlUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, '').split('?')[0],
  };
}

async function sha256File(filePath) {
  const buf = await readFile(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

async function main() {
  const databaseUrl = loadDatabaseUrl();
  if (!databaseUrl?.startsWith('mysql')) {
    console.error('DATABASE_URL (mysql) is required');
    process.exit(1);
  }

  const cfg = parseMysqlUrl(databaseUrl);
  const updates = [];
  for (const name of REPAIRED) {
    const file = path.join(root, 'prisma/migrations', name, 'migration.sql');
    const checksum = await sha256File(file);
    updates.push({ name, checksum });
  }

  const statements = updates
    .map(
      (u) =>
        `UPDATE \`_prisma_migrations\` SET \`checksum\`='${u.checksum}' WHERE \`migration_name\`='${u.name}';`,
    )
    .join('\n');

  const result = spawnSync(
    'mysql',
    [
      `-h${cfg.host}`,
      `-P${cfg.port}`,
      `-u${cfg.user}`,
      `-p${cfg.password}`,
      cfg.database,
      '-e',
      statements,
    ],
    { encoding: 'utf8' },
  );

  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || 'mysql failed');
    process.exit(result.status || 1);
  }

  for (const u of updates) {
    console.log(`checksum repaired: ${u.name}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
