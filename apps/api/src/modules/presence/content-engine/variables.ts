import type { ResolveContext } from './types';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

/**
 * Builtin + site custom variables available for `{{ … }}` interpolation.
 * Site `settingsJson.variables` wins over org `brandingJson.presenceVariables`.
 */
export function resolveVariables(ctx: ResolveContext): Record<string, unknown> {
  const branding = asRecord(ctx.org.brandingJson);
  const orgSettings = asRecord(ctx.org.settingsJson);
  const siteSettings = asRecord(ctx.site.settingsJson);
  const integrations = asRecord(orgSettings.integrations ?? branding.integrations);
  const whatsapp = asRecord(integrations.whatsapp);
  const address = asRecord(branding.address ?? orgSettings.address);
  const social = asRecord(branding.social ?? orgSettings.social);
  const orgDefaults = asRecord(branding.presenceVariables);
  const siteVars = asRecord(siteSettings.variables);

  const siteUrl =
    ctx.site.primaryDomain?.trim() ||
    (ctx.site.platformSlug ? `${ctx.site.platformSlug}` : '') ||
    '';

  const builtin: Record<string, unknown> = {
    organization: {
      name: ctx.org.name,
      logo: str(branding.logoUrl ?? branding.logo),
    },
    phone: str(branding.phone ?? orgSettings.phone ?? whatsapp.phone),
    whatsapp: str(whatsapp.phone ?? whatsapp.number ?? branding.whatsapp ?? branding.phone),
    email: str(branding.email ?? orgSettings.email),
    address: {
      line1: str(address.line1 ?? address.street),
      line2: str(address.line2),
      city: str(address.city),
      state: str(address.state),
      country: str(address.country),
      postalCode: str(address.postalCode ?? address.zip),
    },
    social: {
      facebook: str(social.facebook),
      instagram: str(social.instagram),
      linkedin: str(social.linkedin),
      twitter: str(social.twitter ?? social.x),
      youtube: str(social.youtube),
    },
    currency: str(branding.currency ?? orgSettings.currency ?? 'INR'),
    timezone: str(branding.timezone ?? orgSettings.timezone ?? 'Asia/Kolkata'),
    site: {
      name: ctx.site.name,
      url: siteUrl,
    },
  };

  // Flatten common aliases used in templates
  const flatAliases: Record<string, unknown> = {
    'organization.name': builtin.organization
      ? (builtin.organization as Record<string, unknown>).name
      : ctx.org.name,
    'organization.logo': (builtin.organization as Record<string, unknown>).logo,
    phone: builtin.phone,
    whatsapp: builtin.whatsapp,
    email: builtin.email,
    currency: builtin.currency,
    timezone: builtin.timezone,
    'site.name': ctx.site.name,
    'site.url': siteUrl,
  };

  return {
    ...builtin,
    ...flatAliases,
    ...orgDefaults,
    ...siteVars,
  };
}
