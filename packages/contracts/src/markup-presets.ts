import { z } from 'zod';

export const MarkupPresetModeSchema = z.enum(['percent', 'fixed']);

export const MarkupPresetSchema = z.object({
  id: z.string().min(1).max(48),
  label: z.string().min(1).max(80),
  mode: MarkupPresetModeSchema,
  value: z.number().min(0).max(1_000_000),
});

export type MarkupPreset = z.infer<typeof MarkupPresetSchema>;

export const MarkupPresetsSettingsSchema = z.array(MarkupPresetSchema).max(12);

export function normalizeMarkupPresets(raw: unknown): MarkupPreset[] {
  const parsed = MarkupPresetsSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export function resolveOrgMarkupPresets(
  settings: { markupPresets?: unknown } | null | undefined,
): MarkupPreset[] {
  return normalizeMarkupPresets(settings?.markupPresets);
}

export function sellFromMarkupPreset(
  unitCost: number,
  preset: Pick<MarkupPreset, 'mode' | 'value'>,
): number {
  if (!Number.isFinite(unitCost)) return unitCost;
  if (preset.mode === 'fixed') {
    return Math.round((unitCost + preset.value) * 100) / 100;
  }
  return Math.round(unitCost * (1 + preset.value / 100) * 100) / 100;
}

export function markupPresetSummary(
  preset: Pick<MarkupPreset, 'label' | 'mode' | 'value'>,
): string {
  if (preset.mode === 'fixed') {
    return `${preset.label} (+₹${preset.value})`;
  }
  return `${preset.label} (${preset.value}%)`;
}
