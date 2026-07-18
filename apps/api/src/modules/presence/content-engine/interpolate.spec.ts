import { describe, expect, it } from 'vitest';
import { interpolate, interpolateProps } from './interpolate';

describe('content-engine interpolate', () => {
  it('replaces nested paths and escapes HTML', () => {
    const out = interpolate('Hello {{ organization.name }} <{{ phone }}>', {
      organization: { name: 'Acme <Co>' },
      phone: '999',
    });
    expect(out).toBe('Hello Acme &lt;Co&gt; <999>');
  });

  it('interpolates string props and skips dataSource', () => {
    const next = interpolateProps(
      {
        title: 'Call {{ whatsapp }}',
        dataSource: { source: 'trips' },
        items: [{ title: '{{ whatsapp }}' }],
      },
      { whatsapp: '123' },
    );
    expect(next.title).toBe('Call 123');
    expect(next.dataSource).toEqual({ source: 'trips' });
    expect((next.items as Array<{ title: string }>)[0].title).toBe('{{ whatsapp }}');
  });
});
