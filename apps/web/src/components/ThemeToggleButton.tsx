import { Moon, Sun } from 'lucide-react';
import { BrandTooltip, Button, useTheme, useUiPrefs } from '@wayrune/ui';

/** Header control: toggles between light and dark (based on the resolved theme). */
export function ThemeToggleButton() {
  const { resolved, toggle } = useTheme();
  const { appearanceTransitioning } = useUiPrefs();
  const nextLabel = resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <BrandTooltip label={nextLabel} side="bottom" sideOffset={8} delayDuration={150}>
      <Button
        type="button"
        size="icon"
        variant="outline"
        aria-label={nextLabel}
        disabled={appearanceTransitioning}
        onClick={toggle}
      >
        {resolved === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
    </BrandTooltip>
  );
}
