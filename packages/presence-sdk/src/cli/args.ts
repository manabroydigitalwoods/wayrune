export type ParsedArgs = {
  command: string[];
  flags: Record<string, string | boolean>;
  positionals: string[];
};

/** Minimal argv parser: `wr auth login --account x --dry-run dir` */
export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  const command: string[] = [];
  let i = 0;

  // Collect command words until first flag or leftover positional after known pattern
  while (i < argv.length) {
    const a = argv[i]!;
    if (a.startsWith('-')) break;
    command.push(a);
    i += 1;
    // auth / accounts take subcommands
    if (command[0] === 'auth' && command.length === 1) continue;
    if (command[0] === 'auth' && command.length === 2) break;
    if (command[0] === 'init' && command.length === 1) continue;
    if (command[0] === 'init' && command.length >= 2) break;
    if (command[0] !== 'auth' && command[0] !== 'init') break;
  }

  while (i < argv.length) {
    const a = argv[i]!;
    if (a === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
        i += 1;
        continue;
      }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i += 1;
      }
      continue;
    }
    if (a.startsWith('-') && a.length === 2) {
      const key = a.slice(1);
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i += 1;
      }
      continue;
    }
    positionals.push(a);
    i += 1;
  }

  return { command, flags, positionals };
}

export function flagString(flags: Record<string, string | boolean>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = flags[k];
    if (typeof v === 'string') return v;
  }
  return undefined;
}

export function flagBool(flags: Record<string, string | boolean>, ...keys: string[]): boolean {
  for (const k of keys) {
    const v = flags[k];
    if (v === true || v === 'true' || v === '1' || v === 'yes') return true;
  }
  return false;
}
