import {
  PRESENCE_MENU_ICONS,
  PRESENCE_MENU_ICON_CATEGORIES,
  type PresenceMenuIconCategory,
} from '@wayrune/contracts';
import { BrandTooltip, Button, cn } from '@wayrune/ui';
import { PresenceMenuIcon } from './PresenceMenuIcon';

export function MenuIconPicker({
  value,
  disabled,
  onChange,
}: {
  value?: string | null;
  disabled?: boolean;
  onChange: (icon: string | undefined) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Icon
        </div>
        {value ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px] text-muted-foreground"
            disabled={disabled}
            onClick={() => onChange(undefined)}
          >
            Clear
          </Button>
        ) : null}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Optional. Icons use the nav link color so they follow the site theme.
      </p>
      <div className="max-h-40 space-y-2.5 overflow-y-auto rounded-md border bg-muted/10 p-2">
        {PRESENCE_MENU_ICON_CATEGORIES.map((category) => {
          const icons = PRESENCE_MENU_ICONS.filter(
            (row) => row.category === (category.id as PresenceMenuIconCategory),
          );
          if (!icons.length) return null;
          return (
            <div key={category.id}>
              <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                {category.label}
              </div>
              <div className="grid grid-cols-6 gap-1">
                {icons.map((icon) => {
                  const selected = value === icon.key;
                  return (
                    <BrandTooltip key={icon.key} label={icon.label}>
                      <button
                        type="button"
                        disabled={disabled}
                        aria-label={icon.label}
                        aria-pressed={selected}
                        className={cn(
                          'inline-flex size-8 items-center justify-center rounded-md border transition-colors',
                          selected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-transparent bg-background text-muted-foreground hover:border-border hover:text-foreground',
                          disabled && 'pointer-events-none opacity-60',
                        )}
                        onClick={() => onChange(selected ? undefined : icon.key)}
                      >
                        <PresenceMenuIcon icon={icon.key} className="size-4" />
                      </button>
                    </BrandTooltip>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
