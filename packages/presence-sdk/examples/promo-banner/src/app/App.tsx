import { Playground } from '@/features/preview/Playground';

export function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-amber-900/20 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
        Local component preview — deploy with{' '}
        <code className="rounded bg-amber-100 px-1">wr deploy</code> (uploads{' '}
        <code className="rounded bg-amber-100 px-1">dist/</code> only).
      </header>
      <Playground />
    </div>
  );
}
