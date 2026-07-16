import { describe, expect, it, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import { z } from 'zod';
import { ZodExceptionFilter } from './zod-exception.filter';

function mockHost() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const response = { status };
  const request = { method: 'POST', url: '/api/v1/test', correlationId: 'corr_test' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('ZodExceptionFilter', () => {
  it('maps a real ZodError (incl. from .refine()) to a 400 with field errors', () => {
    const schema = z
      .object({ status: z.enum(['open', 'qualified', 'lost']), reason: z.string().optional() })
      .refine((v) => v.status !== 'lost' || Boolean(v.reason?.trim()), {
        message: 'Enter a reason for marking this inquiry lost',
        path: ['reason'],
      });

    let caught: unknown;
    try {
      schema.parse({ status: 'lost' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeTruthy();

    const { host, status, json } = mockHost();
    new ZodExceptionFilter().catch(caught, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 400,
        title: 'Validation failed',
        errors: { reason: 'Enter a reason for marking this inquiry lost' },
      }),
    );
  });

  it('still falls back to 500 for a duck-typed non-ZodError object', () => {
    const { host, status, json } = mockHost();
    new ZodExceptionFilter().catch(new Error('boom'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ status: 500 }));
  });
});
