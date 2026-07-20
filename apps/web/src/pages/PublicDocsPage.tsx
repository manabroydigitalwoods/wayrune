import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { APP_RELEASE_LABEL } from '../lib/releaseNotes';
import { PUBLIC_DOCS_SECTIONS } from '../lib/publicDocs';

/** Login-free buyer docs — claim-safe journey + don’t-claim discipline. */
export function PublicDocsPage() {
  useDocumentTitle('Docs');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl space-y-8 px-4 py-10 sm:px-6">
        <header className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Wayrune
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Docs</h1>
          <p className="text-sm text-muted-foreground">
            {APP_RELEASE_LABEL}. How the agency quote path works, and what we will
            not claim without proof.
          </p>
        </header>

        <nav className="flex flex-wrap gap-3 text-sm">
          {PUBLIC_DOCS_SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="text-primary hover:underline"
            >
              {s.title}
            </a>
          ))}
        </nav>

        <div className="space-y-8">
          {PUBLIC_DOCS_SECTIONS.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="scroll-mt-8 space-y-3"
            >
              <h2 className="text-lg font-semibold tracking-tight">
                {section.title}
              </h2>
              <p className="text-sm text-muted-foreground">{section.summary}</p>
              <ul className="list-disc space-y-2 pl-5 text-sm text-foreground/90">
                {section.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          <Link to="/changelog" className="text-primary hover:underline">
            Public changelog
          </Link>
          {' · '}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
          {' · '}
          After sign-in, Settings → About mirrors claim-safe release notes.
        </p>
      </div>
    </div>
  );
}
