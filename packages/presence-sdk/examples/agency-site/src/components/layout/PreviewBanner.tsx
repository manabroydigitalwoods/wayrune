import { useState } from 'react';
import { dismissBanner, isBannerDismissed } from '@/storage';

export function PreviewBanner() {
  const [hidden, setHidden] = useState(() => isBannerDismissed());
  if (hidden) return null;

  return (
    <div className="relative border-b border-amber-900/20 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
      Local preview approximates look — true parity is Digital Presence canvas after{' '}
      <code className="rounded bg-amber-100 px-1">presence deploy</code>.
      <button
        type="button"
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-xs text-amber-900/70 hover:bg-amber-100"
        onClick={() => {
          dismissBanner();
          setHidden(true);
        }}
        aria-label="Dismiss banner"
      >
        Dismiss
      </button>
    </div>
  );
}
