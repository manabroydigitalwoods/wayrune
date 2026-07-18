import { Link } from '@/features/navigation';

export function NotFoundPage() {
  return (
    <section className="presence-section rounded-[var(--presence-radius)] bg-white p-8 text-center shadow-sm">
      <h1 className="m-0 font-display text-3xl font-semibold">Page not found</h1>
      <p className="mt-2 text-[var(--presence-muted)]">
        This path is not in <code>site/structure.json</code>.
      </p>
      <Link to="/" className="presence-btn mt-4 inline-flex">
        Back home
      </Link>
    </section>
  );
}
