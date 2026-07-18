import { Injectable } from '@nestjs/common';
import { PresenceDataSourceQuerySchema, type PresenceDataSourceQuery } from '@wayrune/contracts';
import { PrismaService } from '../../../prisma/prisma.service';
import { interpolate, interpolateProps } from './interpolate';
import { evaluateRules } from './rules';
import { normalizeDataSource, querySource } from './sources';
import type { DataSourceResult, ResolveContext } from './types';
import { resolveVariables } from './variables';

export type { ResolveContext, DataSourceResult };

@Injectable()
export class PresenceContentEngineService {
  constructor(private prisma: PrismaService) {}

  resolveVariables(ctx: ResolveContext) {
    return resolveVariables(ctx);
  }

  interpolate(template: string, vars: Record<string, unknown>, opts?: { escape?: boolean }) {
    return interpolate(template, vars, opts);
  }

  interpolateProps(props: Record<string, unknown>, vars: Record<string, unknown>) {
    return interpolateProps(props, vars);
  }

  evaluateRules(ctx: ResolveContext, props: Record<string, unknown>) {
    return evaluateRules(ctx, props);
  }

  normalizeDataSource(props: Record<string, unknown>): PresenceDataSourceQuery | null {
    return normalizeDataSource(props);
  }

  async querySource(
    ctx: ResolveContext,
    query: PresenceDataSourceQuery,
  ): Promise<DataSourceResult> {
    const parsed = PresenceDataSourceQuerySchema.safeParse(query);
    if (!parsed.success) {
      return { items: [], meta: { source: query.source, total: 0 } };
    }
    return querySource(this.prisma, ctx, parsed.data);
  }

  /**
   * Prepare section props for render: rules → variables → data source items.
   * Returns null when the section should be omitted (schedule / rules).
   */
  async resolveSectionProps(
    ctx: ResolveContext,
    props: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const afterRules = this.evaluateRules(ctx, props);
    if (!afterRules) return null;

    const vars = this.resolveVariables(ctx);
    let next = this.interpolateProps(afterRules, vars);

    const ds = this.normalizeDataSource(next);
    if (ds) {
      const result = await this.querySource(ctx, ds);
      if (result.items.length) {
        next = { ...next, items: result.items, dataSourceMeta: result.meta };
      }
    }

    return next;
  }
}
