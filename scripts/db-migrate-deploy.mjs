#!/usr/bin/env node
/**
 * Apply pending migrations (reliable path). Repairs known historical checksums first.
 * Prefer this over `prisma migrate dev` — shadow replay still drifts on older hand-named FKs.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: 'inherit' });
  if (r.status) process.exit(r.status);
}

run('node', ['scripts/repair-migration-checksums.mjs']);
run('npx', ['prisma', 'migrate', 'deploy', '--schema=prisma/schema.prisma']);
