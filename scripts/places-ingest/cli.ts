#!/usr/bin/env node
/**
 * Ingest datasets/places/*_places_v1.csv into system Places.
 *
 * Usage:
 *   pnpm places:ingest --dir datasets/places
 *   pnpm places:ingest --dir datasets/places --dry-run
 *   pnpm places:ingest --file datasets/places/sikkim_places_v1.csv
 */
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { bootstrapEnv } from '@wayrune/config';
import { formatIngestReport, ingestPlacesCatalog } from './ingest';

bootstrapEnv();

function parseArgs(argv: string[]) {
  const args = argv.slice(2).filter((a) => a !== '--');
  let dir: string | undefined;
  let file: string | undefined;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--dry-run') dryRun = true;
    else if (a === '--dir') dir = args[++i];
    else if (a.startsWith('--dir=')) dir = a.slice('--dir='.length);
    else if (a === '--file') file = args[++i];
    else if (a.startsWith('--file=')) file = a.slice('--file='.length);
    else if (a === '--help' || a === '-h') {
      console.log(`Usage:
  pnpm places:ingest --dir datasets/places [--dry-run]
  pnpm places:ingest --file datasets/places/sikkim_places_v1.csv [--dry-run]`);
      process.exit(0);
    }
  }
  if (!dir && !file) dir = 'datasets/places';
  return {
    dir: dir ? resolve(process.cwd(), dir) : undefined,
    file: file ? resolve(process.cwd(), file) : undefined,
    dryRun,
  };
}

async function main() {
  const options = parseArgs(process.argv);
  const prisma = new PrismaClient();
  try {
    const { counters, notes } = await ingestPlacesCatalog(prisma, options);
    console.log(formatIngestReport(counters, notes, options.dryRun));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
