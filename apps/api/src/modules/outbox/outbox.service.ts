import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { loadEnv } from '@wayrune/config';
import { createLogger, getLogContext, newCorrelationId } from '@wayrune/observability';
import { PrismaService } from '../../prisma/prisma.service';

const log = createLogger('outbox');

@Injectable()
export class OutboxService {
  private queue: Queue | null = null;

  constructor(private prisma: PrismaService) {
    try {
      const env = loadEnv();
      this.queue = new Queue('outbox-dispatch', {
        connection: { url: env.redisUrl },
      });
    } catch {
      this.queue = null;
    }
  }

  async enqueue(input: {
    organizationId: string;
    eventType: string;
    payload: Record<string, unknown>;
    correlationId?: string;
  }) {
    const correlationId =
      input.correlationId ?? getLogContext().correlationId ?? newCorrelationId();

    const event = await this.prisma.outboxEvent.create({
      data: {
        organizationId: input.organizationId,
        eventType: input.eventType,
        payloadJson: input.payload as Prisma.InputJsonValue,
        correlationId,
      },
    });

    log.debug('Outbox event enqueued', {
      outboxId: event.id,
      eventType: input.eventType,
      organizationId: input.organizationId,
      correlationId,
    });

    if (this.queue) {
      try {
        await this.queue.add(
          input.eventType,
          {
            outboxId: event.id,
            organizationId: input.organizationId,
            eventType: input.eventType,
            payload: input.payload,
            correlationId: event.correlationId,
          },
          { jobId: event.id, removeOnComplete: true },
        );
      } catch (err) {
        log.warn('Outbox queue publish failed; worker will poll', {
          outboxId: event.id,
          eventType: input.eventType,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return event;
  }
}
