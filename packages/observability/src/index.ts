import { AsyncLocalStorage } from 'async_hooks';
import pino, { type Logger as PinoLogger, type LoggerOptions } from 'pino';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export type LogContext = {
  correlationId?: string;
  organizationId?: string;
  userId?: string;
  requestId?: string;
};

export type LoggerOptionsInput = {
  service: string;
  appEnv?: string;
  level?: LogLevel | string;
  pretty?: boolean;
  context?: LogContext;
};

export type AppLogger = {
  fatal: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
  trace: (message: string, meta?: Record<string, unknown>) => void;
  child: (bindings: Record<string, unknown>) => AppLogger;
  withContext: (ctx: LogContext) => AppLogger;
  /** Underlying pino instance for advanced use (nestjs-pino, etc.) */
  raw: PinoLogger;
};

const REDACT_PATHS = [
  'password',
  'passwordHash',
  'refreshToken',
  'accessToken',
  'authorization',
  'cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  'passportNumber',
  'passport_number',
  'bankAccount',
  'bankDetails',
  'secret',
  'token',
  '*.password',
  '*.passwordHash',
  '*.refreshToken',
  '*.accessToken',
  '*.authorization',
  '*.passportNumber',
];

const als = new AsyncLocalStorage<LogContext>();

export function getLogContext(): LogContext {
  return als.getStore() ?? {};
}

export function runWithLogContext<T>(ctx: LogContext, fn: () => T): T {
  const parent = getLogContext();
  return als.run({ ...parent, ...ctx }, fn);
}

export async function runWithLogContextAsync<T>(ctx: LogContext, fn: () => Promise<T>): Promise<T> {
  const parent = getLogContext();
  return als.run({ ...parent, ...ctx }, fn);
}

export function newCorrelationId() {
  return `corr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function resolveLogPretty(appEnv?: string, explicit?: boolean | string): boolean {
  if (explicit === true || explicit === 'true') return true;
  if (explicit === false || explicit === 'false') return false;
  return (appEnv ?? process.env.APP_ENV ?? 'local') === 'local';
}

export function resolveLogLevel(_appEnv?: string, explicit?: string): LogLevel {
  if (explicit && ['fatal', 'error', 'warn', 'info', 'debug', 'trace'].includes(explicit)) {
    return explicit as LogLevel;
  }
  // local defaults to info so successful HTTP access logs (debug) stay quiet
  return 'info';
}

/** Exported for tests — applies the same redact paths used in production. */
export function getRedactPaths() {
  return [...REDACT_PATHS];
}

export function buildPinoOptions(input: LoggerOptionsInput): LoggerOptions {
  const appEnv = input.appEnv ?? process.env.APP_ENV ?? 'local';
  const level = resolveLogLevel(appEnv, input.level);
  const pretty = resolveLogPretty(appEnv, input.pretty);

  const options: LoggerOptions = {
    level,
    base: {
      service: input.service,
      appEnv,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: REDACT_PATHS,
      censor: '[Redacted]',
    },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    mixin() {
      const ctx = getLogContext();
      const out: Record<string, string> = {};
      if (ctx.correlationId) out.correlationId = ctx.correlationId;
      if (ctx.organizationId) out.organizationId = ctx.organizationId;
      if (ctx.userId) out.userId = ctx.userId;
      if (ctx.requestId) out.requestId = ctx.requestId;
      return out;
    },
  };

  if (pretty) {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        // Compact local UX: one line, short clock, drop noisy base/http objects
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname,appEnv,req,res,service,responseTime',
        singleLine: true,
        messageFormat: '[{service}] {msg}',
      },
    };
  }

  return options;
}

function wrapPino(raw: PinoLogger): AppLogger {
  const log =
    (method: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace') =>
    (message: string, meta?: Record<string, unknown>) => {
      if (meta && Object.keys(meta).length) {
        raw[method](meta, message);
      } else {
        raw[method](message);
      }
    };

  return {
    fatal: log('fatal'),
    error: log('error'),
    warn: log('warn'),
    info: log('info'),
    debug: log('debug'),
    trace: log('trace'),
    child(bindings) {
      return wrapPino(raw.child(bindings));
    },
    withContext(ctx) {
      return wrapPino(
        raw.child({
          ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
          ...(ctx.organizationId ? { organizationId: ctx.organizationId } : {}),
          ...(ctx.userId ? { userId: ctx.userId } : {}),
          ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
        }),
      );
    },
    raw,
  };
}

let rootLogger: PinoLogger | null = null;

export function createRootLogger(input: LoggerOptionsInput): AppLogger {
  const options = buildPinoOptions(input);
  const raw = pino(options);
  if (input.context) {
    rootLogger = raw.child(input.context);
    return wrapPino(rootLogger);
  }
  rootLogger = raw;
  return wrapPino(raw);
}

/** Create a service logger (uses shared root options; creates root if needed). */
export function createLogger(service: string, overrides?: Partial<LoggerOptionsInput>): AppLogger {
  const appEnv = overrides?.appEnv ?? process.env.APP_ENV ?? 'local';
  const level = overrides?.level ?? process.env.LOG_LEVEL;
  const pretty =
    overrides?.pretty ??
    (process.env.LOG_PRETTY !== undefined ? process.env.LOG_PRETTY === 'true' : undefined);

  if (!rootLogger) {
    return createRootLogger({
      service: overrides?.service ?? service,
      appEnv,
      level,
      pretty,
      context: overrides?.context,
    });
  }

  return wrapPino(rootLogger.child({ service }));
}

/** Params compatible with nestjs-pino LoggerModule.forRoot */
export function nestPinoParams(input: {
  service?: string;
  appEnv?: string;
  level?: string;
  pretty?: boolean;
}) {
  const service = input.service ?? process.env.LOG_SERVICE_NAME ?? 'api';
  const appEnv = input.appEnv ?? process.env.APP_ENV ?? 'local';
  const options = buildPinoOptions({
    service,
    appEnv,
    level: input.level ?? process.env.LOG_LEVEL,
    pretty: input.pretty,
  });

  // nestjs-pino Params — keep loosely typed to avoid coupling to http IncomingMessage generics
  return {
    pinoHttp: {
      ...options,
      quietReqLogger: true,
      customProps: (req: { correlationId?: string } & Record<string, unknown>) => {
        const ctx = getLogContext();
        return {
          correlationId: req.correlationId ?? ctx.correlationId,
        };
      },
      customSuccessMessage: (
        req: { method?: string; url?: string },
        res: { statusCode?: number },
        responseTime: number,
      ) => `${req.method} ${req.url} → ${res.statusCode} (${Math.round(responseTime)}ms)`,
      customErrorMessage: (
        req: { method?: string; url?: string },
        res: { statusCode?: number },
        err: Error,
      ) => `${req.method} ${req.url} → ${res.statusCode} ${err.message}`,
      customLogLevel: (
        _req: unknown,
        res: { statusCode?: number },
        err?: Error,
      ): LogLevel | 'silent' => {
        if (err || (res.statusCode ?? 0) >= 500) return 'error';
        if ((res.statusCode ?? 0) >= 400) return 'warn';
        // Successful requests only at debug — set LOG_LEVEL=debug to see them
        return 'debug';
      },
      autoLogging: {
        ignore: (req: { url?: string }) => {
          const url = req.url ?? '';
          return url.includes('/health') || url.includes('/api/v1/health');
        },
      },
      serializers: {
        req(req: { method?: string; url?: string }) {
          return {
            method: req.method,
            url: req.url,
          };
        },
        res(res: { statusCode?: number }) {
          return { statusCode: res.statusCode };
        },
      },
    },
  } as Record<string, unknown>;
}
