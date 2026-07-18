import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { newCorrelationId, runWithLogContext } from '@wayrune/observability';

export type RequestWithCorrelation = Request & {
  correlationId?: string;
  user?: { sub?: string; organizationId?: string };
};

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: RequestWithCorrelation, res: Response, next: NextFunction) {
    const incoming = req.header('x-correlation-id') || req.header('x-request-id');
    const correlationId = (incoming && incoming.trim()) || newCorrelationId();
    req.correlationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);

    runWithLogContext(
      {
        correlationId,
        organizationId: req.user?.organizationId,
        userId: req.user?.sub,
      },
      () => next(),
    );
  }
}
