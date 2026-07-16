import { describe, expect, it } from 'vitest';
import {
  buildPinoOptions,
  getRedactPaths,
  resolveLogLevel,
  resolveLogPretty,
  runWithLogContext,
  getLogContext,
} from './index';

describe('resolveLogLevel / resolveLogPretty', () => {
  it('defaults local to info + pretty', () => {
    expect(resolveLogLevel('local')).toBe('info');
    expect(resolveLogPretty('local')).toBe(true);
  });

  it('defaults prod to info + json', () => {
    expect(resolveLogLevel('prod')).toBe('info');
    expect(resolveLogPretty('prod')).toBe(false);
  });

  it('honors explicit overrides', () => {
    expect(resolveLogLevel('prod', 'debug')).toBe('debug');
    expect(resolveLogPretty('prod', true)).toBe(true);
    expect(resolveLogPretty('local', false)).toBe(false);
  });
});

describe('redaction paths', () => {
  it('includes sensitive fields', () => {
    const paths = getRedactPaths();
    expect(paths).toContain('password');
    expect(paths).toContain('passwordHash');
    expect(paths).toContain('refreshToken');
    expect(paths).toContain('passportNumber');
    expect(paths).toContain('req.headers.authorization');
  });
});

describe('buildPinoOptions', () => {
  it('sets redact and base fields', () => {
    const opts = buildPinoOptions({ service: 'api', appEnv: 'prod', pretty: false });
    expect(opts.level).toBe('info');
    expect(opts.base).toMatchObject({ service: 'api', appEnv: 'prod' });
    expect(opts.redact).toBeDefined();
    expect(opts.transport).toBeUndefined();
  });

  it('enables compact single-line pretty transport for local', () => {
    const opts = buildPinoOptions({ service: 'api', appEnv: 'local', pretty: true });
    expect(opts.transport).toMatchObject({
      target: 'pino-pretty',
      options: {
        singleLine: true,
        ignore: expect.stringContaining('req,res'),
      },
    });
  });
});

describe('ALS log context', () => {
  it('propagates correlation id inside runWithLogContext', () => {
    expect(getLogContext().correlationId).toBeUndefined();
    runWithLogContext({ correlationId: 'corr_test' }, () => {
      expect(getLogContext().correlationId).toBe('corr_test');
    });
    expect(getLogContext().correlationId).toBeUndefined();
  });
});
