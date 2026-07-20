import { useEffect, useState } from 'react';
import { Button, toastError, toastSuccess } from '@wayrune/ui';
import { api } from '../../api';
import { reportError } from '../../lib/errors';

type OrgCurrent = {
  settingsJson?: Record<string, unknown> | null;
};

/** Settings → About: soft-archive labeled demo operate suppliers/rates. */
export function DemoOperateReplacePanel() {
  const [hasDemo, setHasDemo] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const org = await api<OrgCurrent>('/organizations/current');
      const pack = org.settingsJson?.demoOperatePack;
      setHasDemo(!!pack && typeof pack === 'object');
    } catch (e) {
      reportError(e, 'Could not load demo operate status');
      setHasDemo(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function replaceDemo() {
    if (
      !window.confirm(
        'Replace demo data with real suppliers? Demo hotel/transfer/activity suppliers and their rates will be soft-archived, and stamped supplier links cleared from sample templates.',
      )
    ) {
      return;
    }
    setReplacing(true);
    try {
      const res = await api<{
        softDeletedSuppliers: number;
        templatesStripped: number;
        nextHref?: string;
      }>('/organizations/demo-operate/replace', { method: 'POST' });
      toastSuccess(
        `Demo archived · ${res.softDeletedSuppliers} suppliers · ${res.templatesStripped} templates cleaned. Import real suppliers next.`,
      );
      setHasDemo(false);
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not replace demo data');
    } finally {
      setReplacing(false);
    }
  }

  if (loading || !hasDemo) return null;

  return (
    <section className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
      <h2 className="text-sm font-semibold">Demo operate data</h2>
      <p className="text-xs text-muted-foreground">
        Labeled demo hotel / transfer / activity suppliers are installed for the
        enquiry→voucher walkthrough. They are not for live booking.
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={replacing}
        onClick={() => void replaceDemo()}
      >
        {replacing ? 'Replacing…' : 'Replace demo with real data'}
      </Button>
    </section>
  );
}
