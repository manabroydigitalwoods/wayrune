import { z } from 'zod';

export const ThemePreferenceSchema = z.enum(['light', 'dark', 'system']);
export const DensityPreferenceSchema = z.enum(['compact', 'comfortable', 'spacious']);
export const FontScalePreferenceSchema = z.enum(['small', 'default', 'large', 'xlarge']);
export const MotionPreferenceSchema = z.enum(['system', 'reduce', 'allow']);
export const GlassPreferenceSchema = z.enum(['frosted', 'solid']);
export const ColorThemePreferenceSchema = z.enum([
  'wayrune',
  'ocean',
  'slate',
  'sand',
  'violet',
  'custom',
]);

/** Hex accent for custom color theme, e.g. `#0f766e`. */
export const CustomAccentSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex color')
  .optional();

export const UserAppearancePreferencesSchema = z.object({
  theme: ThemePreferenceSchema.optional(),
  density: DensityPreferenceSchema.optional(),
  fontScale: FontScalePreferenceSchema.optional(),
  motion: MotionPreferenceSchema.optional(),
  glass: GlassPreferenceSchema.optional(),
  colorTheme: ColorThemePreferenceSchema.optional(),
  highContrast: z.boolean().optional(),
  customAccent: CustomAccentSchema,
  sidebarCollapsedDefault: z.boolean().optional(),
});

/** Org workspace chrome defaults — applied when a member has no personal appearance prefs. */
export const OrgAppearanceDefaultsSchema = z.object({
  theme: ThemePreferenceSchema.optional(),
  colorTheme: ColorThemePreferenceSchema.optional(),
  highContrast: z.boolean().optional(),
  customAccent: CustomAccentSchema,
  glass: GlassPreferenceSchema.optional(),
});

export const UserPreferencesSchema = z.object({
  appearance: UserAppearancePreferencesSchema.optional(),
});

/** Patch body. Pass `appearance: null` to clear personal chrome and fall back to workspace defaults. */
export const UpdateUserPreferencesSchema = z.object({
  appearance: UserAppearancePreferencesSchema.nullable().optional(),
});

export type UserAppearancePreferences = z.infer<typeof UserAppearancePreferencesSchema>;
export type OrgAppearanceDefaults = z.infer<typeof OrgAppearanceDefaultsSchema>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export type UpdateUserPreferencesInput = z.infer<typeof UpdateUserPreferencesSchema>;

export function parseOrgAppearanceDefaults(raw: unknown): OrgAppearanceDefaults {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const parsed = OrgAppearanceDefaultsSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

export function orgAppearanceHasValues(appearance: OrgAppearanceDefaults | null | undefined): boolean {
  if (!appearance) return false;
  return (
    appearance.theme != null ||
    appearance.colorTheme != null ||
    typeof appearance.highContrast === 'boolean' ||
    appearance.customAccent != null ||
    appearance.glass != null
  );
}
