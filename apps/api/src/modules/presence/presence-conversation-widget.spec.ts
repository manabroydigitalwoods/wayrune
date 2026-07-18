import { describe, expect, it } from 'vitest';
import {
  isPresenceWidgetPathAllowed,
  matchPresencePathPatterns,
  resolvePresenceWidgetPlacement,
} from '@wayrune/contracts';

describe('presence-conversation-widget paths', () => {
  it('matches * and ** wildcards', () => {
    expect(matchPresencePathPatterns('/trips/asia', ['/trips/*'])).toBe(true);
    expect(matchPresencePathPatterns('/trips/asia/tokyo', ['/trips/*'])).toBe(false);
    expect(matchPresencePathPatterns('/trips/asia/tokyo', ['/trips/**'])).toBe(true);
    expect(matchPresencePathPatterns('/contact', ['/contact'])).toBe(true);
  });

  it('exclude wins over include', () => {
    expect(
      isPresenceWidgetPathAllowed('/trips/private/x', {
        includePaths: ['/trips/**'],
        excludePaths: ['/trips/private/**'],
      }),
    ).toBe(false);
    expect(
      isPresenceWidgetPathAllowed('/trips/asia', {
        includePaths: ['/trips/**'],
        excludePaths: ['/trips/private/**'],
      }),
    ).toBe(true);
  });

  it('uses widget position and paths; page hide still works', () => {
    const base = resolvePresenceWidgetPlacement({
      siteSettingsJson: { conversationWidget: { widgetId: 'w1' } },
      pageSeoJson: {},
      path: '/trips/asia',
      widget: {
        enabled: true,
        position: 'bottom-left',
        includePaths: ['/trips/**'],
        excludePaths: [],
      },
    });
    expect(base.show).toBe(true);
    expect(base.position).toBe('bottom-left');
    expect(base.widgetId).toBe('w1');

    const excluded = resolvePresenceWidgetPlacement({
      siteSettingsJson: { conversationWidget: { widgetId: 'w1' } },
      path: '/preview/x',
      widget: {
        enabled: true,
        position: 'bottom-right',
        includePaths: [],
        excludePaths: ['/preview/**'],
      },
    });
    expect(excluded.show).toBe(false);

    const hidden = resolvePresenceWidgetPlacement({
      siteSettingsJson: { conversationWidget: { widgetId: 'w1' } },
      pageSeoJson: { conversationWidget: { hidden: true } },
      path: '/',
      widget: { enabled: true, position: 'bottom-right', includePaths: [], excludePaths: [] },
    });
    expect(hidden.show).toBe(false);
  });
});
