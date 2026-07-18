import { useEffect, useMemo, useRef, useState } from 'react';
import manifest from '@component/component.json';
import '@/mount';

type SchemaField = {
  key: string;
  label?: string;
  type?: string;
  required?: boolean;
};

type Manifest = {
  key: string;
  name: string;
  version: string;
  schema?: SchemaField[];
  defaultProps?: Record<string, unknown>;
};

const meta = manifest as Manifest;

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function Playground() {
  const hostRef = useRef<HTMLDivElement>(null);
  const defaults = useMemo(
    () => ({ ...(meta.defaultProps || {}) } as Record<string, string>),
    [],
  );
  const [props, setProps] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const [k, v] of Object.entries(defaults)) init[k] = str(v);
    return init;
  });

  useEffect(() => {
    const el = hostRef.current;
    const mount = (window as unknown as { PresenceMount?: (el: HTMLElement, p: object) => void })
      .PresenceMount;
    if (!el || !mount) return;
    el.replaceChildren();
    mount(el, props);
  }, [props]);

  const fields = meta.schema?.length
    ? meta.schema
    : Object.keys(defaults).map((key) => ({ key, label: key, type: 'text' }));

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-5 py-8 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <div>
          <h1 className="m-0 text-lg font-semibold">{meta.name}</h1>
          <p className="m-0 mt-1 text-sm text-slate-500">
            {meta.key} · v{meta.version}
          </p>
        </div>
        <form
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          onSubmit={(e) => e.preventDefault()}
        >
          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Props
          </p>
          {fields.map((field) => (
            <label key={field.key} className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                {field.label || field.key}
              </span>
              {field.type === 'textarea' ? (
                <textarea
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  rows={3}
                  value={props[field.key] || ''}
                  onChange={(e) => setProps((p) => ({ ...p, [field.key]: e.target.value }))}
                />
              ) : (
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={props[field.key] || ''}
                  onChange={(e) => setProps((p) => ({ ...p, [field.key]: e.target.value }))}
                />
              )}
            </label>
          ))}
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            onClick={() => {
              const reset: Record<string, string> = {};
              for (const [k, v] of Object.entries(defaults)) reset[k] = str(v);
              setProps(reset);
            }}
          >
            Reset props
          </button>
        </form>
      </aside>
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="m-0 mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Live mount
        </p>
        <div ref={hostRef} className="min-h-[120px]" />
      </section>
    </div>
  );
}
