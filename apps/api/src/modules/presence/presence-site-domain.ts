/** Normalize a site custom domain (hostname only, lowercase, no scheme/path). */
export function normalizeSitePrimaryDomain(input: string | null | undefined): string | null {
  if (input == null) return null;
  let value = input.trim().toLowerCase();
  if (!value) return null;
  value = value.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
  if (!value) return null;
  return value;
}

/** Host variants for lookup (with and without www). */
export function siteDomainLookupVariants(host: string): string[] {
  const h = host.split(':')[0]?.toLowerCase() || '';
  if (!h) return [];
  const variants = new Set<string>([h]);
  if (h.startsWith('www.')) variants.add(h.slice(4));
  else variants.add(`www.${h}`);
  return [...variants];
}

const DOMAIN_RE =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function assertValidSitePrimaryDomain(domain: string | null): void {
  if (!domain) return;
  if (domain === 'localhost' || domain.endsWith('.localhost')) return;
  if (!DOMAIN_RE.test(domain)) {
    throw new Error('Enter a valid domain like www.example.com');
  }
}
