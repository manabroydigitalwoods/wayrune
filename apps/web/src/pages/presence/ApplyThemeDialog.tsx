import { useEffect, useState } from 'react';
import {
  Button,
  Combobox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
} from '@wayrune/ui';

export type ApplyThemeSiteOption = {
  id: string;
  name: string;
  isPrimary?: boolean;
  themeId?: string | null;
};

export function ApplyThemeDialog({
  open,
  onOpenChange,
  themeId,
  themeName,
  sites,
  preferredSiteId,
  applying,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  themeId: string;
  themeName: string;
  sites: ApplyThemeSiteOption[];
  preferredSiteId?: string | null;
  applying?: boolean;
  onConfirm: (siteId: string) => void | Promise<void>;
}) {
  const [siteId, setSiteId] = useState('');

  useEffect(() => {
    if (!open) return;
    const preferred =
      (preferredSiteId && sites.some((s) => s.id === preferredSiteId) && preferredSiteId) ||
      sites.find((s) => s.isPrimary)?.id ||
      sites[0]?.id ||
      '';
    setSiteId(preferred);
  }, [open, preferredSiteId, sites]);

  const selected = sites.find((s) => s.id === siteId) || null;
  const alreadyActive = Boolean(selected && selected.themeId === themeId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1.5rem)] gap-0 p-0 sm:max-w-md">
        <DialogHeader className="px-5 py-4 pr-12">
          <DialogTitle className="text-base">Apply theme</DialogTitle>
          <DialogDescription>
            Choose which website should use <span className="text-foreground">{themeName}</span>.
            Other sites keep their current theme.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3 px-5 py-3">
          {sites.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Create a website first, then apply a theme to it.
            </p>
          ) : (
            <div>
              <Label className="text-xs">Website</Label>
              <Combobox
                className="mt-1"
                value={siteId}
                onChange={setSiteId}
                disabled={applying}
                options={sites.map((s) => ({
                  value: s.id,
                  label: s.isPrimary ? `${s.name} (primary)` : s.name,
                }))}
              />
              {alreadyActive ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  This theme is already active on {selected?.name}.
                </p>
              ) : null}
            </div>
          )}
        </DialogBody>
        <DialogFooter className="px-5 py-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={applying}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!siteId || applying || sites.length === 0 || alreadyActive}
            onClick={() => void onConfirm(siteId)}
          >
            {applying ? 'Applying…' : alreadyActive ? 'Already active' : 'Set active'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
