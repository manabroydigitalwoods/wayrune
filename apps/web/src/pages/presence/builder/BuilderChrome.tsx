import {
  ArrowLeft,
  Eye,
  ExternalLink,
  LayoutTemplate,
  Monitor,
  PanelsTopLeft,
  Pencil,
  RectangleHorizontal,
  Redo2,
  Save,
  Smartphone,
  Tablet,
  Undo2,
  X,
} from 'lucide-react';
import { BrandTooltip, Button, StatusBadge, cn } from '@wayrune/ui';
import type { DeviceMode } from './types';

const DEVICES: Array<{ id: DeviceMode; label: string; hint: string; icon: typeof Monitor }> = [
  { id: 'desktop', label: 'Desktop', hint: 'Desktop · 1100px (matches live site)', icon: Monitor },
  {
    id: 'widescreen',
    label: 'Extra wide',
    hint: 'Extra wide · 1440px preview',
    icon: RectangleHorizontal,
  },
  { id: 'tablet', label: 'Tablet', hint: 'Tablet · 768px', icon: Tablet },
  { id: 'mobile', label: 'Mobile', hint: 'Mobile · 390px', icon: Smartphone },
];

export function BuilderChrome({
  title,
  status,
  dirty,
  saving,
  saveAck = false,
  canWrite,
  device,
  previewUrl,
  previewMode = false,
  layoutMode,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSaveAsTemplate,
  onDeviceChange,
  onPreviewModeChange,
  onBack,
  onSave,
  onPublish,
}: {
  title: string;
  siteName?: string;
  status?: string | null;
  dirty: boolean;
  saving: boolean;
  /** Brief “Saved” flash after autosave / explicit save. */
  saveAck?: boolean;
  canWrite: boolean;
  device: DeviceMode;
  previewUrl?: string | null;
  previewMode?: boolean;
  layoutMode?: 'flow' | 'freeform' | null;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onSaveAsTemplate?: () => void;
  onDeviceChange: (device: DeviceMode) => void;
  onPreviewModeChange?: (next: boolean) => void;
  onBack: () => void;
  onSave: () => void;
  onPublish: () => void;
}) {
  const saveStatus = saving
    ? 'saving'
    : dirty
      ? 'unsaved'
      : saveAck
        ? 'saved'
        : null;

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 sm:px-3">
      <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onBack} aria-label="Back">
        <ArrowLeft className="size-4 sm:mr-1" />
        <span className="hidden sm:inline">Back</span>
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm font-medium">{title}</span>
        {status ? (
          <StatusBadge
            value={status}
            label={status === 'published' ? 'Published' : 'Draft'}
            showIcon={false}
          />
        ) : null}
        {layoutMode === 'freeform' ? (
          <BrandTooltip label="Free design — drag and resize modules on the artboard. Nested modules stay flow layout inside parents.">
            <span className="hidden items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary sm:inline-flex">
              <LayoutTemplate className="size-3" />
              Free design
            </span>
          </BrandTooltip>
        ) : (
          <BrandTooltip label="Flow layout — stack modules vertically">
            <span className="hidden items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:inline-flex">
              Flow
            </span>
          </BrandTooltip>
        )}
      </div>

      {onUndo && onRedo ? (
        <div className="flex shrink-0 items-center gap-0.5 rounded-md border p-0.5">
          <BrandTooltip label="Undo (⌘Z)">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7"
              disabled={!canUndo || !canWrite || previewMode}
              onClick={onUndo}
              aria-label="Undo"
            >
              <Undo2 className="size-3.5" />
            </Button>
          </BrandTooltip>
          <BrandTooltip label="Redo (⌘⇧Z)">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7"
              disabled={!canRedo || !canWrite || previewMode}
              onClick={onRedo}
              aria-label="Redo"
            >
              <Redo2 className="size-3.5" />
            </Button>
          </BrandTooltip>
        </div>
      ) : null}

      <div className="flex shrink-0 items-center gap-0.5 rounded-md border p-0.5">
        {DEVICES.map((item) => (
          <BrandTooltip key={item.id} label={item.hint}>
            <Button
              type="button"
              size="icon"
              variant={device === item.id ? 'secondary' : 'ghost'}
              className="size-7"
              onClick={() => onDeviceChange(item.id)}
              aria-label={item.label}
              aria-pressed={device === item.id}
            >
              <item.icon className="size-3.5" />
            </Button>
          </BrandTooltip>
        ))}
      </div>

      {onPreviewModeChange ? (
        <div className="flex shrink-0 items-center gap-0.5 rounded-md border p-0.5">
          <BrandTooltip label="Edit mode">
            <Button
              type="button"
              size="sm"
              variant={!previewMode ? 'secondary' : 'ghost'}
              className={cn('h-7 gap-1 px-2', previewMode ? '' : '')}
              onClick={() => onPreviewModeChange(false)}
              aria-pressed={!previewMode}
            >
              <Pencil className="size-3.5" />
              <span className="hidden sm:inline">Edit</span>
            </Button>
          </BrandTooltip>
          <BrandTooltip label="Preview mode">
            <Button
              type="button"
              size="sm"
              variant={previewMode ? 'secondary' : 'ghost'}
              className="h-7 gap-1 px-2"
              disabled={!previewUrl}
              onClick={() => onPreviewModeChange(true)}
              aria-pressed={previewMode}
            >
              <Eye className="size-3.5" />
              <span className="hidden sm:inline">Preview</span>
            </Button>
          </BrandTooltip>
        </div>
      ) : null}

      <div className="flex shrink-0 items-center gap-1">
        {previewUrl ? (
          <BrandTooltip label="Open preview in new tab">
            <Button variant="ghost" size="icon" className="size-8" asChild>
              <a href={previewUrl} target="_blank" rel="noreferrer" aria-label="Open preview in new tab">
                <ExternalLink className="size-4" />
              </a>
            </Button>
          </BrandTooltip>
        ) : null}
        {onSaveAsTemplate ? (
          <BrandTooltip label="Save this page as a reusable template">
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              disabled={!canWrite}
              onClick={onSaveAsTemplate}
            >
              <LayoutTemplate className="mr-1.5 size-3.5" />
              <span className="hidden sm:inline">Save as template</span>
            </Button>
          </BrandTooltip>
        ) : null}
        <Button variant="outline" size="sm" className="h-8" onClick={onPublish}>
          <PanelsTopLeft className="mr-1.5 size-3.5" />
          Publish
        </Button>
        {canWrite ? (
          <BrandTooltip
            label={
              saveStatus === 'saving'
                ? 'Saving changes…'
                : saveStatus === 'unsaved'
                  ? 'You have unsaved changes'
                  : saveStatus === 'saved'
                    ? 'All changes saved'
                    : 'Edits auto-save while you work'
            }
          >
            <span
              className={cn(
                'hidden min-w-[4.5rem] text-center text-[10px] font-medium uppercase tracking-wide sm:inline-block',
                saveStatus === 'unsaved'
                  ? 'text-amber-600 dark:text-amber-400'
                  : saveStatus === 'saved'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-muted-foreground',
              )}
              aria-live="polite"
            >
              {saveStatus === 'saving'
                ? 'Saving…'
                : saveStatus === 'unsaved'
                  ? 'Unsaved'
                  : saveStatus === 'saved'
                    ? 'Saved'
                    : 'Auto-save'}
            </span>
          </BrandTooltip>
        ) : null}
        <Button size="sm" className="h-8" disabled={!canWrite || saving} onClick={onSave}>
          <Save className="mr-1.5 size-3.5" />
          Save
        </Button>
        <BrandTooltip label="Close builder">
          <Button variant="ghost" size="icon" className="size-8" onClick={onBack} aria-label="Close">
            <X className="size-4" />
          </Button>
        </BrandTooltip>
      </div>
    </header>
  );
}
