import { describe, expect, it } from 'vitest';
import {
  assertValidSitePrimaryDomain,
  normalizeSitePrimaryDomain,
  siteDomainLookupVariants,
} from './presence-site-domain';

describe('presence-site-domain', () => {
  it('normalizes domain input', () => {
    expect(normalizeSitePrimaryDomain('HTTPS://WWW.Example.COM/path')).toBe('www.example.com');
    expect(normalizeSitePrimaryDomain('')).toBeNull();
  });

  it('builds www lookup variants', () => {
    expect(siteDomainLookupVariants('www.demo.com')).toEqual(['www.demo.com', 'demo.com']);
    expect(siteDomainLookupVariants('demo.com')).toEqual(['demo.com', 'www.demo.com']);
  });

  it('validates domain shape', () => {
    expect(() => assertValidSitePrimaryDomain('not a domain')).toThrow();
    expect(() => assertValidSitePrimaryDomain('www.example.com')).not.toThrow();
  });
});
