import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { ZodError, ZodIssue } from 'zod';
import { loadEnv } from '@wayrune/config';
import { createLogger } from '@wayrune/observability';

const log = createLogger('exceptions');

/**
 * Duck-typed check instead of `instanceof ZodError`. `@wayrune/contracts`
 * (compiled CJS) and this file can resolve `zod`'s dual CJS/ESM builds to
 * distinct module instances under some bundler/test-runner setups, which
 * breaks `instanceof` across that boundary even though it's the same
 * package/version. Shape-checking `name` + `issues` is resolution-agnostic.
 */
function isZodError(exception: unknown): exception is ZodError {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    (exception as { name?: unknown }).name === 'ZodError' &&
    Array.isArray((exception as { issues?: unknown }).issues)
  );
}

@Catch()
export class ZodExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest<{ method?: string; url?: string; correlationId?: string }>();
    const env = loadEnv();

    if (isZodError(exception)) {
      const errors: Record<string, string> = {};
      for (const issue of exception.issues as ZodIssue[]) {
        const key = issue.path.map(String).join('.') || '_form';
        if (!errors[key]) errors[key] = issue.message;
      }
      log.warn('Validation failed', {
        path: request.url,
        method: request.method,
        correlationId: request.correlationId,
        detail: exception.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
      });
      return response.status(HttpStatus.BAD_REQUEST).json({
        type: 'https://httpstatuses.com/400',
        title: 'Validation failed',
        status: 400,
        detail: exception.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        errors,
        correlationId: request.correlationId,
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const detail = typeof res === 'string' ? res : (res as { message?: string | string[] }).message;
      const detailText = Array.isArray(detail) ? detail.join('; ') : detail;

      if (status >= 500) {
        log.error(exception.message, {
          path: request.url,
          method: request.method,
          status,
          correlationId: request.correlationId,
          err: { message: exception.message, stack: exception.stack },
        });
      } else {
        log.warn(exception.message, {
          path: request.url,
          method: request.method,
          status,
          detail: detailText,
          correlationId: request.correlationId,
        });
      }

      return response.status(status).json({
        type: `https://httpstatuses.com/${status}`,
        title: exception.name,
        status,
        detail: detailText,
        correlationId: request.correlationId,
      });
    }

    log.error('Unhandled exception', {
      path: request.url,
      method: request.method,
      correlationId: request.correlationId,
      err:
        exception instanceof Error
          ? {
              message: exception.message,
              stack: env.appEnv !== 'prod' ? exception.stack : undefined,
            }
          : { message: String(exception) },
    });

    return response.status(500).json({
      type: 'https://httpstatuses.com/500',
      title: 'Internal Server Error',
      status: 500,
      detail:
        env.isProd
          ? 'Unexpected error'
          : exception instanceof Error
            ? exception.message
            : 'Unexpected error',
      correlationId: request.correlationId,
    });
  }
}
