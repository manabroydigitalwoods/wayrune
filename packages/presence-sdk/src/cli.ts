#!/usr/bin/env node
import { resolve } from 'node:path';
import { authList, authLogin, authLogout, authUse } from './cli/auth.js';
import { flagBool, flagString, parseArgs } from './cli/args.js';
import { BRAND } from './cli/brand.js';
import { detectPackageKind, resolvePackageRoot } from './cli/detect.js';
import { deployPackageDirectory } from './cli/deploy.js';
import { initAgencySite, initComponent } from './cli/init.js';
import { packComponentDirectory } from './cli/pack-component.js';
import { packThemeDirectory } from './cli/pack.js';
import {
  printComponentValidateResult,
  validateComponentDirectory,
} from './cli/validate-component.js';
import { printValidateResult, validateThemeDirectory } from './cli/validate.js';

const CLI = BRAND.cli.primary;

function usage(): void {
  console.log(`Wayrune CLI (${CLI}) — theme & component packages

Usage:
  ${CLI} auth login [--account name] [--api-base url] [--email e] [--password p]
                    [--organization-slug slug]
  ${CLI} auth logout [--account name]
  ${CLI} auth list
  ${CLI} auth use <name>
  ${CLI} accounts
  ${CLI} init agency-site [dir]
  ${CLI} init component [dir]
  ${CLI} validate [dir] [--type theme|component]
  ${CLI} pack [dir] [-o|--out path] [--type theme|component]
  ${CLI} deploy [dir] [--type theme|component] [--account name] [--api-base url]
                [--site-name name] [--confirm-replace] [--on-conflict overwrite|suffix]
                [--dry-run]

Aliases: ${BRAND.cli.long}, ${BRAND.cli.legacy} (same binary)
Legacy scaffold: ${CLI} init travel-agency [dir] → agency-site

Layouts:
  Theme:     site/ + src/ → pnpm build → dist/  (or flat theme.json root)
  Component: component/ + src/ → pnpm build → dist/  (or flat component.json root)

Config:
  ~/.wayrune/config.json      named accounts (JWT); falls back to ~/.presence
  ./presence.config.json      project defaults

Docs: packages/presence-sdk/README.md
`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === '-h' || argv[0] === '--help') {
    usage();
    return;
  }

  const { command, flags, positionals } = parseArgs(argv);
  const cmd = command[0];

  try {
    if (cmd === 'accounts' || (cmd === 'auth' && command[1] === 'list')) {
      authList();
      return;
    }
    if (cmd === 'auth') {
      const sub = command[1];
      if (sub === 'login') {
        await authLogin({
          account: flagString(flags, 'account'),
          apiBase: flagString(flags, 'api-base', 'apiBase'),
          email: flagString(flags, 'email'),
          password: flagString(flags, 'password'),
          organizationSlug: flagString(flags, 'organization-slug', 'organizationSlug'),
        });
        return;
      }
      if (sub === 'logout') {
        authLogout(flagString(flags, 'account'));
        return;
      }
      if (sub === 'use') {
        const name = positionals[0] || flagString(flags, 'account');
        if (!name) throw new Error(`Usage: ${CLI} auth use <name>`);
        authUse(name);
        return;
      }
      throw new Error(`Unknown auth command: ${sub || '(none)'}`);
    }

    if (cmd === 'init') {
      const kind = command[1] || positionals[0];
      const dir =
        command[2] ||
        positionals[kind === command[1] ? 0 : 1] ||
        (kind === 'component' ? 'my-component' : 'agency-site');
      if (kind === 'agency-site' || kind === 'travel-agency') {
        initAgencySite(dir, { legacyAlias: kind === 'travel-agency' });
        return;
      }
      if (kind === 'component') {
        initComponent(dir);
        return;
      }
      throw new Error(`Supported: ${CLI} init agency-site|component [dir]`);
    }

    const dir = resolve(positionals[0] || '.');
    const typeFlag = flagString(flags, 'type');

    if (cmd === 'validate') {
      const kind = detectPackageKind(dir, typeFlag);
      const root = resolvePackageRoot(dir, kind);
      if (kind === 'theme') {
        const result = validateThemeDirectory(root);
        printValidateResult(result);
        if (!result.ok) process.exitCode = 1;
      } else {
        const result = validateComponentDirectory(root);
        printComponentValidateResult(result);
        if (!result.ok) process.exitCode = 1;
      }
      return;
    }

    if (cmd === 'pack') {
      const kind = detectPackageKind(dir, typeFlag);
      const root = resolvePackageRoot(dir, kind);
      const out = flagString(flags, 'out', 'o');
      const packed =
        kind === 'theme'
          ? await packThemeDirectory({ dir: root, out })
          : await packComponentDirectory({ dir: root, out });
      console.log(`Wrote ${packed.outPath} (${(packed.bytes / 1024).toFixed(0)} KB) [${kind}]`);
      return;
    }

    if (cmd === 'deploy') {
      await deployPackageDirectory({
        dir,
        type: typeFlag,
        account: flagString(flags, 'account'),
        apiBase: flagString(flags, 'api-base', 'apiBase'),
        siteName: flagString(flags, 'site-name', 'siteName'),
        confirmReplace: flagBool(flags, 'confirm-replace', 'confirmReplace'),
        onConflict: flagString(flags, 'on-conflict', 'onConflict') as
          | 'overwrite'
          | 'suffix'
          | undefined,
        dryRun: flagBool(flags, 'dry-run', 'dryRun'),
      });
      return;
    }

    throw new Error(`Unknown command: ${cmd}\nRun ${CLI} --help`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

main();
