import { Link } from 'react-router-dom';
import { AboutReleaseNotesPanel } from '../components/agency/AboutReleaseNotesPanel';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { APP_RELEASE_LABEL } from '../lib/releaseNotes';

/** Login-free mirror of Settings → About release notes (claim-safe only). */
export function PublicChangelogPage() {
  useDocumentTitle('Changelog');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl space-y-8 px-4 py-10 sm:px-6">
        <header className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Wayrune
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Changelog</h1>
          <p className="text-sm text-muted-foreground">
            {APP_RELEASE_LABEL}. Buyer-safe highlights only — no unverified scale or
            speed claims.
          </p>
        </header>
        <AboutReleaseNotesPanel />
        <p className="text-xs text-muted-foreground">
          <Link to="/docs" className="text-primary hover:underline">
            Docs
          </Link>
          {' · '}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
          {' · '}
          Same list as Settings → About after you sign in.
        </p>
      </div>
    </div>
  );
}
