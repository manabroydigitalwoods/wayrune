#!/usr/bin/env node
/**
 * Fail CI / local checks when hand-authored Prisma migrations look like Postgres.
 * Repo datasource is MySQL (`prisma/migrations/migration_lock.toml`).
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'prisma', 'migrations');

/** @type {Array<{ name: string; re: RegExp; hint: string }>} */
const FORBIDDEN = [
  {
    name: 'pg_constraint',
    re: /\bpg_constraint\b/i,
    hint: 'Postgres catalog — use plain ADD CONSTRAINT for MySQL',
  },
  {
    name: 'pg_catalog',
    re: /\bpg_catalog\b/i,
    hint: 'Postgres catalog',
  },
  {
    name: 'do_block',
    re: /\bDO\s+\$\$/i,
    hint: 'Postgres DO $$ block — not valid on MySQL',
  },
  {
    name: 'if_not_exists_column',
    re: /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i,
    hint: 'Postgres IF NOT EXISTS on ADD COLUMN — omit for MySQL',
  },
  {
    name: 'if_not_exists_index',
    re: /CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS/i,
    hint: 'Postgres IF NOT EXISTS on CREATE INDEX — omit for MySQL',
  },
  {
    name: 'serial',
    re: /\b(BIG)?SERIAL\b/i,
    hint: 'Postgres SERIAL — use AUTO_INCREMENT / INT for MySQL',
  },
  {
    name: 'jsonb',
    re: /\bJSONB\b/i,
    hint: 'Postgres JSONB — use JSON for MySQL',
  },
  {
    name: 'timestamptz',
    re: /\bTIMESTAMPTZ\b/i,
    hint: 'Postgres TIMESTAMPTZ — use DATETIME for MySQL',
  },
  {
    name: 'double_quoted_alter',
    re: /ALTER\s+TABLE\s+"/i,
    hint: 'Double-quoted identifiers — use backticks for MySQL',
  },
  {
    name: 'double_quoted_create_index',
    re: /CREATE\s+(UNIQUE\s+)?INDEX\s+"/i,
    hint: 'Double-quoted identifiers — use backticks for MySQL',
  },
  {
    name: 'text_id_column',
    // Prisma String ids/FKs in this repo are VARCHAR(191), not unbounded TEXT.
    re: /ADD\s+COLUMN\s+"[^"]+"\s+TEXT\b/i,
    hint: 'Quoted TEXT column (Postgres-ish) — prefer VARCHAR(191) with backticks',
  },
];

async function main() {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  /** @type {Array<{ file: string; rule: string; hint: string; line: number; sample: string }>} */
  const hits = [];

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const file = path.join(migrationsDir, ent.name, 'migration.sql');
    let sql;
    try {
      sql = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const lines = sql.split(/\r?\n/);
    for (const rule of FORBIDDEN) {
      lines.forEach((line, idx) => {
        if (rule.re.test(line)) {
          hits.push({
            file: path.relative(root, file),
            rule: rule.name,
            hint: rule.hint,
            line: idx + 1,
            sample: line.trim().slice(0, 160),
          });
        }
      });
    }
  }

  if (hits.length) {
    console.error(
      'MySQL migration check failed — Postgres-style SQL found.\n' +
        'This repo uses MySQL (see prisma/schema.prisma + migration_lock.toml).\n' +
        'Prefer `pnpm db:migrate` or hand-author with backticks / VARCHAR(191).\n',
    );
    for (const h of hits) {
      console.error(`${h.file}:${h.line} [${h.rule}] ${h.hint}`);
      console.error(`  ${h.sample}`);
    }
    process.exit(1);
  }

  console.log('MySQL migration check passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
