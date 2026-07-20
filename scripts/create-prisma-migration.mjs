#!/usr/bin/env node
/**
 * Create a new Prisma migration from the live database → schema.prisma.
 * Avoids `migrate dev` shadow replay (broken on older MySQL migration history).
 *
 * Usage:
 *   node scripts/create-prisma-migration.mjs <name>
 *   pnpm db:migrate:create add_widget_column
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nameArg = process.argv[2];

if (!nameArg || !/^[a-z][a-z0-9_]*$/i.test(nameArg)) {
  console.error(
    'Usage: pnpm db:migrate:create <snake_case_name>\n' +
      'Creates prisma/migrations/<timestamp>_<name>/migration.sql from live DB → schema.',
  );
  process.exit(1);
}

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(root, '.env');
  if (!existsSync(envPath)) return null;
  const text = readFileSync(envPath, 'utf8');
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
}

const databaseUrl = loadDatabaseUrl();
if (!databaseUrl) {
  console.error('DATABASE_URL is required (env or .env)');
  process.exit(1);
}

const stamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, '')
  .slice(0, 14);
const folder = `${stamp}_${nameArg}`;
const dir = path.join(root, 'prisma/migrations', folder);

const diff = spawnSync(
  'npx',
  [
    'prisma',
    'migrate',
    'diff',
    '--from-url',
    databaseUrl,
    '--to-schema-datamodel',
    'prisma/schema.prisma',
    '--script',
  ],
  { cwd: root, encoding: 'utf8' },
);

if (diff.status !== 0) {
  console.error(diff.stderr || diff.stdout);
  process.exit(diff.status || 1);
}

const sql = (diff.stdout || '').trim();
if (!sql || sql === '-- This is an empty migration.') {
  console.log('No schema drift vs live database — nothing to create.');
  process.exit(0);
}

mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, 'migration.sql'), `${sql}\n`);
console.log(`Created ${path.relative(root, dir)}/migration.sql`);
console.log('Review the SQL, then: pnpm db:migrate:deploy');
