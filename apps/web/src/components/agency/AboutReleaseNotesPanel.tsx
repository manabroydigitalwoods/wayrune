import { Link } from 'react-router-dom';
import { StatusBadge } from '@wayrune/ui';
import {
  APP_RELEASE_LABEL,
  formatReleaseNoteDate,
  visibleReleaseNotes,
} from '../../lib/releaseNotes';

/** Settings → About: claim-safe release notes (no Save). Also used on public /changelog. */
export function AboutReleaseNotesPanel({
  showPublicLink = false,
}: {
  showPublicLink?: boolean;
} = {}) {
  const notes = visibleReleaseNotes();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm font-medium">{APP_RELEASE_LABEL}</p>
        <p className="text-xs text-muted-foreground">
          Claim-safe highlights for demos and onboarding. Testing or prohibited claims are kept out
          of this list (see strategy claim registry).
          {showPublicLink ? (
            <>
              {' '}
              <Link to="/changelog" className="text-primary hover:underline">
                Public changelog
              </Link>
            </>
          ) : null}
        </p>
      </div>
      <ul className="space-y-3">
        {notes.map((note) => (
          <li key={note.id} className="rounded-lg border border-border/60 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{note.title}</span>
              <StatusBadge
                value={note.claimStatus === 'architecture' ? 'draft' : 'confirmed'}
                label={note.claimStatus === 'architecture' ? 'Architecture' : 'Proven'}
              />
              <span className="text-[11px] text-muted-foreground">
                {formatReleaseNoteDate(note.date)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{note.summary}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
