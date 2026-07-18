import { useState, type ReactNode } from 'react';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ChevronDown } from 'lucide-react';
import { Input, Label, Combobox, cn } from '@wayrune/ui';
import {
  THEME_TOKEN_SWATCHES,
  composeCssBox,
  parseCssBox,
  type CssBoxSides,
} from './helpers';

const SPACING_PRESETS = [
  { label: 'None', value: '0' },
  { label: 'S', value: '0.5rem' },
  { label: 'M', value: '1rem' },
  { label: 'L', value: '1.5rem' },
  { label: 'XL', value: '2rem' },
  { label: '2XL', value: '2.5rem' },
] as const;

const RADIUS_PRESETS = [
  { label: 'None', value: '0' },
  { label: 'S', value: '6px' },
  { label: 'M', value: '12px' },
  { label: 'L', value: '20px' },
  { label: 'Full', value: '9999px' },
] as const;

const SHADOW_PRESETS = [
  { label: 'None', value: '' },
  { label: 'Soft', value: '0 4px 14px rgba(15,23,42,.08)' },
  { label: 'Medium', value: '0 10px 28px rgba(15,23,42,.14)' },
  { label: 'Strong', value: '0 18px 40px rgba(15,23,42,.22)' },
] as const;

const FONT_SIZE_PRESETS = [
  { label: 'S', value: '0.875rem' },
  { label: 'M', value: '1rem' },
  { label: 'L', value: '1.25rem' },
  { label: 'XL', value: '1.5rem' },
] as const;

const FONT_WEIGHTS = [
  { value: '400', label: 'Regular' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semibold' },
  { value: '700', label: 'Bold' },
] as const;

const BORDER_STYLES = [
  { value: 'none', label: 'None' },
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
] as const;

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Shared segmented control — same solid primary as Styles tab / Content position. */
function Segmented({
  value,
  options,
  disabled,
  onChange,
  /** Evenly stretch options (good for 2–4 items). Off = content-sized pills that wrap. */
  stretch = true,
}: {
  value: string;
  options: Array<{ value: string; label: ReactNode; title?: string }>;
  disabled?: boolean;
  onChange: (value: string) => void;
  stretch?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-0.5 rounded-md border p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.title}
          disabled={disabled}
          className={cn(
            'rounded px-2 py-1 text-[10px] font-medium transition-colors',
            stretch ? 'min-w-0 flex-1' : 'shrink-0',
            value === opt.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          )}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Preset pills + separate Custom action (avoids cramming Custom into a 7-wide row).
 */
function PresetControl({
  value,
  presets,
  disabled,
  onChange,
  customPlaceholder = 'e.g. 12px',
  noneSelected = false,
}: {
  value: string;
  presets: ReadonlyArray<{ label: string; value: string }>;
  disabled?: boolean;
  onChange: (value: string) => void;
  customPlaceholder?: string;
  noneSelected?: boolean;
}) {
  const normalized = (value || '').trim();
  const matched = !noneSelected && presets.some((p) => p.value === normalized);
  const [preferCustom, setPreferCustom] = useState(
    !matched && !noneSelected && normalized.length > 0,
  );

  // Empty unmatched must NOT look like Custom selected with no field.
  const showCustom =
    !noneSelected && (preferCustom || (normalized.length > 0 && !matched));
  const segmentedValue = noneSelected ? '' : matched && !showCustom ? normalized : '';

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <Segmented
            stretch={false}
            value={segmentedValue}
            disabled={disabled}
            onChange={(next) => {
              setPreferCustom(false);
              onChange(next);
            }}
            options={presets.map((p) => ({
              value: p.value,
              label: p.label,
              title: p.value || p.label,
            }))}
          />
        </div>
        <button
          type="button"
          title="Custom value"
          disabled={disabled}
          className={cn(
            'shrink-0 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors',
            showCustom
              ? 'border-primary bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          )}
          onClick={() => setPreferCustom(true)}
        >
          Custom
        </button>
      </div>
      {showCustom ? (
        <Input
          className="h-8 text-xs"
          disabled={disabled}
          value={normalized}
          placeholder={customPlaceholder}
          autoFocus={preferCustom && !normalized}
          onChange={(e) => {
            setPreferCustom(true);
            onChange(e.target.value);
          }}
        />
      ) : null}
    </div>
  );
}

function ColorField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const hasValue = Boolean(value.trim());
  const hexLike =
    hasValue && value.startsWith('#') && (value.length === 7 || value.length === 4)
      ? value
      : '#ffffff';
  return (
    <div>
      <Label className="text-[10px]">{label}</Label>
      <div className="mt-0.5 flex items-center gap-1.5">
        <input
          type="color"
          className={cn(
            'h-8 w-9 cursor-pointer rounded border bg-background p-1',
            !hasValue && 'opacity-40',
          )}
          disabled={disabled}
          value={hexLike}
          title={hasValue ? value : 'Pick a color'}
          onChange={(e) => onChange(e.target.value)}
        />
        <Input
          className="h-8 text-xs"
          disabled={disabled}
          value={value}
          placeholder="#0f766e or var(--…)"
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {!hasValue ? (
        <p className="mt-0.5 text-[9px] text-muted-foreground">Not set — module default color applies</p>
      ) : null}
    </div>
  );
}

function SideLabel({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded border text-[9px] font-semibold uppercase text-muted-foreground">
      {children}
    </span>
  );
}

/**
 * Compact spacing editor: all-sides segmented by default;
 * per-side only when expanded (avoids repeating 4× pill walls).
 */
function BoxSidesEditor({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  const sides = parseCssBox(value);
  const allEqual =
    sides.top === sides.right && sides.right === sides.bottom && sides.bottom === sides.left;
  const [perSideOpen, setPerSideOpen] = useState(!allEqual && Boolean(value?.trim()));

  const setSide = (side: keyof CssBoxSides, next: string) => {
    onChange(composeCssBox({ ...sides, [side]: next }));
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-[10px]">{label}</Label>
        <PresetControl
          value={allEqual ? sides.top || '0' : ''}
          noneSelected={!allEqual}
          presets={SPACING_PRESETS}
          disabled={disabled}
          customPlaceholder="e.g. 12px or 1.75rem"
          onChange={(v) => onChange(v === '0' || !v.trim() ? '0' : v)}
        />
        {!allEqual ? (
          <p className="text-[9px] text-muted-foreground">Mixed sides — open per-side to edit.</p>
        ) : null}
      </div>

      <button
        type="button"
        disabled={disabled}
        className="flex items-center gap-1 text-[10px] font-medium text-primary"
        onClick={() => setPerSideOpen((v) => !v)}
      >
        <ChevronDown
          className={cn('size-3 transition-transform', perSideOpen ? 'rotate-0' : '-rotate-90')}
        />
        {perSideOpen ? 'Hide per-side' : 'Per-side'}
      </button>

      {perSideOpen ? (
        <div className="space-y-2 rounded-md border bg-muted/20 p-2">
          {(
            [
              ['top', 'T'],
              ['right', 'R'],
              ['bottom', 'B'],
              ['left', 'L'],
            ] as const
          ).map(([key, short]) => (
            <div key={key} className="flex items-start gap-2">
              <SideLabel>{short}</SideLabel>
              <div className="min-w-0 flex-1">
                <PresetControl
                  value={sides[key] || '0'}
                  presets={SPACING_PRESETS}
                  disabled={disabled}
                  customPlaceholder="e.g. 12px"
                  onChange={(v) => setSide(key, v)}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t pt-2.5 first:border-t-0 first:pt-0">
      <button
        type="button"
        className="mb-2 flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <ChevronDown
          className={cn('size-3.5 text-muted-foreground transition-transform', open ? 'rotate-0' : '-rotate-90')}
        />
      </button>
      {open ? <div className="space-y-2.5">{children}</div> : null}
    </div>
  );
}

export function StyleDesignPanel({
  propsJson,
  themeTokens,
  disabled,
  deviceLabel,
  showDeviceBadge,
  onChange,
  onClearDevice,
  visibilitySlot,
}: {
  propsJson: Record<string, unknown>;
  themeTokens?: Record<string, unknown>;
  disabled?: boolean;
  deviceLabel?: string;
  showDeviceBadge?: boolean;
  onChange: (key: string, value: unknown) => void;
  onClearDevice?: () => void;
  visibilitySlot?: ReactNode;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const background = str(propsJson.background);
  const textColor = str(propsJson.textColor);
  const borderRadius = str(propsJson.borderRadius);
  const boxShadow = str(propsJson.boxShadow);
  const fontSize = str(propsJson.fontSize);
  const fontWeight = str(propsJson.fontWeight, '400');
  const textAlign = str(propsJson.textAlign, 'left');
  const borderStyle = str(propsJson.borderStyle, 'none');
  const borderWidth = str(propsJson.borderWidth);
  const borderColor = str(propsJson.borderColor);

  return (
    <div className="space-y-3">
      {(showDeviceBadge || onClearDevice) && (
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-muted-foreground">Appearance</div>
          <div className="flex items-center gap-2">
            {showDeviceBadge && deviceLabel ? (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {deviceLabel}
              </span>
            ) : null}
            {onClearDevice ? (
              <button
                type="button"
                className="text-[10px] font-medium text-primary underline"
                disabled={disabled}
                onClick={onClearDevice}
              >
                Clear {deviceLabel?.toLowerCase()}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {showDeviceBadge && deviceLabel ? (
        <p className="text-[11px] text-muted-foreground">
          Editing {deviceLabel.toLowerCase()} overrides. Switch device in the toolbar to preview.
        </p>
      ) : null}

      <CollapsibleSection title="Spacing">
        <BoxSidesEditor
          label="Padding"
          value={str(propsJson.padding)}
          disabled={disabled}
          onChange={(next) => onChange('padding', next || undefined)}
        />
        <BoxSidesEditor
          label="Margin"
          value={str(propsJson.margin)}
          disabled={disabled}
          onChange={(next) => onChange('margin', next || undefined)}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Surface">
        <div>
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Theme tokens
          </div>
          <div className="flex flex-wrap gap-1.5">
            {THEME_TOKEN_SWATCHES.map((swatch) => {
              const tokenValue = themeTokens?.[swatch.key];
              const color =
                typeof tokenValue === 'string' && tokenValue.startsWith('#')
                  ? tokenValue
                  : swatch.key === 'primary'
                    ? '#0f766e'
                    : '#94a3b8';
              const selected = background === swatch.cssVar;
              return (
                <button
                  key={swatch.key}
                  type="button"
                  title={`Use ${swatch.label} (${swatch.cssVar})`}
                  disabled={disabled}
                  className={cn(
                    'group flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] transition-colors',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:border-primary/50',
                  )}
                  onClick={() => onChange('background', swatch.cssVar)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onChange('textColor', swatch.cssVar);
                  }}
                >
                  <span
                    className="size-3 rounded-sm border border-black/10"
                    style={{ background: color }}
                    aria-hidden
                  />
                  <span
                    className={
                      selected
                        ? 'text-primary-foreground'
                        : 'text-muted-foreground group-hover:text-foreground'
                    }
                  >
                    {swatch.label}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Click → background · right-click → text color
          </p>
        </div>

        <ColorField
          label="Background"
          value={background}
          disabled={disabled}
          onChange={(v) => onChange('background', v || undefined)}
        />
        <ColorField
          label="Text color"
          value={textColor}
          disabled={disabled}
          onChange={(v) => onChange('textColor', v || undefined)}
        />

        <div>
          <Label className="text-[10px]">Border radius</Label>
          <div className="mt-1">
            <PresetControl
              value={borderRadius}
              presets={RADIUS_PRESETS}
              disabled={disabled}
              customPlaceholder="e.g. 12px"
              onChange={(v) => onChange('borderRadius', v || undefined)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">Border width</Label>
            <Input
              className="mt-0.5 h-8 text-xs"
              disabled={disabled}
              value={borderWidth}
              placeholder="1px"
              onChange={(e) => onChange('borderWidth', e.target.value || undefined)}
            />
          </div>
          <div>
            <Label className="text-[10px]">Border style</Label>
            <Combobox
              className="mt-0.5"
              size="sm"
              disabled={disabled}
              value={borderStyle || 'none'}
              options={[...BORDER_STYLES]}
              searchable={false}
              onChange={(value) =>
                onChange('borderStyle', value === 'none' ? undefined : value)
              }
            />
          </div>
        </div>
        <ColorField
          label="Border color"
          value={borderColor}
          disabled={disabled}
          onChange={(v) => onChange('borderColor', v || undefined)}
        />

        <div>
          <Label className="text-[10px]">Shadow</Label>
          <div className="mt-1">
            <PresetControl
              value={boxShadow}
              presets={SHADOW_PRESETS}
              disabled={disabled}
              customPlaceholder="e.g. 0 8px 24px rgba(0,0,0,.12)"
              onChange={(v) => onChange('boxShadow', v || undefined)}
            />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Typography">
        <div>
          <Label className="text-[10px]">Font size</Label>
          <div className="mt-1">
            <PresetControl
              value={fontSize}
              presets={FONT_SIZE_PRESETS}
              disabled={disabled}
              customPlaceholder="e.g. 1rem"
              onChange={(v) => onChange('fontSize', v || undefined)}
            />
          </div>
        </div>

        <div>
          <Label className="text-[10px]">Font weight</Label>
          <Combobox
            className="mt-0.5"
            size="sm"
            disabled={disabled}
            value={fontWeight || '400'}
            options={[...FONT_WEIGHTS]}
            searchable={false}
            onChange={(value) => onChange('fontWeight', value || undefined)}
          />
        </div>

        <div>
          <Label className="text-[10px]">Text align</Label>
          <div className="mt-1">
            <Segmented
              value={textAlign}
              disabled={disabled}
              onChange={(v) => onChange('textAlign', v)}
              options={[
                { value: 'left', label: <AlignLeft className="mx-auto size-3.5" />, title: 'Left' },
                {
                  value: 'center',
                  label: <AlignCenter className="mx-auto size-3.5" />,
                  title: 'Center',
                },
                {
                  value: 'right',
                  label: <AlignRight className="mx-auto size-3.5" />,
                  title: 'Right',
                },
                {
                  value: 'justify',
                  label: <AlignJustify className="mx-auto size-3.5" />,
                  title: 'Justify',
                },
              ]}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">Line height</Label>
            <Input
              className="mt-0.5 h-8 text-xs"
              disabled={disabled}
              value={str(propsJson.lineHeight)}
              placeholder="1.5"
              onChange={(e) => onChange('lineHeight', e.target.value || undefined)}
            />
          </div>
          <div>
            <Label className="text-[10px]">Letter spacing</Label>
            <Input
              className="mt-0.5 h-8 text-xs"
              disabled={disabled}
              value={str(propsJson.letterSpacing)}
              placeholder="0.02em"
              onChange={(e) => onChange('letterSpacing', e.target.value || undefined)}
            />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Advanced" defaultOpen={false}>
        <div>
          <Label className="text-[10px]">CSS class</Label>
          <Input
            className="mt-0.5 h-8 text-xs"
            disabled={disabled}
            value={str(propsJson.cssClass)}
            placeholder="extra-class"
            onChange={(e) => onChange('cssClass', e.target.value || undefined)}
          />
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Extra class name(s) for advanced styling
          </p>
        </div>

        <button
          type="button"
          className="text-[10px] font-medium text-primary underline"
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          {advancedOpen ? 'Hide raw CSS' : 'Edit as CSS'}
        </button>
        {advancedOpen ? (
          <div className="space-y-2">
            <div>
              <Label className="text-[10px]">Padding (CSS)</Label>
              <Input
                className="mt-0.5 h-8 text-xs"
                disabled={disabled}
                value={str(propsJson.padding)}
                placeholder="1rem 1.5rem"
                onChange={(e) => onChange('padding', e.target.value || undefined)}
              />
            </div>
            <div>
              <Label className="text-[10px]">Margin (CSS)</Label>
              <Input
                className="mt-0.5 h-8 text-xs"
                disabled={disabled}
                value={str(propsJson.margin)}
                placeholder="0 auto"
                onChange={(e) => onChange('margin', e.target.value || undefined)}
              />
            </div>
            <div>
              <Label className="text-[10px]">Box shadow (CSS)</Label>
              <Input
                className="mt-0.5 h-8 text-xs"
                disabled={disabled}
                value={boxShadow}
                placeholder="0 8px 24px rgba(0,0,0,.12)"
                onChange={(e) => onChange('boxShadow', e.target.value || undefined)}
              />
            </div>
          </div>
        ) : null}
      </CollapsibleSection>

      {visibilitySlot}
    </div>
  );
}
