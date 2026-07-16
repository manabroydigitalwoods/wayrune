import { ToggleRow } from '../ToggleRow';

export function PreferencePanel({
  label,
  description,
  checked,
  onCheckedChange,
  note,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  note?: string;
}) {
  return (
    <div className="space-y-5">
      <ToggleRow
        label={label}
        description={description}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
      {note ? (
        <p className="rounded-xl border border-dashed border-border/70 px-4 py-3 text-xs leading-5 text-muted-foreground glass-well">
          {note}
        </p>
      ) : null}
    </div>
  );
}
