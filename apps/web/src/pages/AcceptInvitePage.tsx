import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Input,
  PageHeader,
  StatusBadge,
  toastError,
  toastSuccess,
} from '@wayrune/ui';
import { api } from '../api';
import { useAuth } from '../auth';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

type InvitePeek = {
  email: string;
  fullName: string | null;
  organizationName: string | null;
  roles: string[];
  status: string;
  claimable: boolean;
  needsAccount: boolean;
};

export function AcceptInvitePage() {
  useDocumentTitle('Accept invitation');
  const { token } = useParams();
  const { me, login } = useAuth();
  const navigate = useNavigate();
  const [peek, setPeek] = useState<InvitePeek | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  useEffect(() => {
    if (!token) return;
    void (async () => {
      setLoading(true);
      try {
        const res = await api<InvitePeek>(`/access/invites/peek/${token}`);
        setPeek(res);
        if (res.fullName) setFullName(res.fullName);
      } catch (e) {
        toastError(e instanceof Error ? e.message : 'Invite not found');
        setPeek(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token || !peek) return;
    if (peek.needsAccount) {
      if (!fullName.trim()) return toastError('Please enter your full name');
      if (password.length < 8) return toastError('Password must be at least 8 characters');
      if (password !== confirm) return toastError('Passwords do not match');
    }
    setSubmitting(true);
    try {
      await api(`/access/invites/accept/${token}`, {
        method: 'POST',
        body: JSON.stringify(
          peek.needsAccount ? { password, fullName: fullName.trim() } : {},
        ),
      });
      toastSuccess(`You've joined ${peek.organizationName ?? 'the organization'}`);
      // New accounts can be signed in immediately with the password they just set.
      if (peek.needsAccount) {
        try {
          await login(peek.email, password);
          navigate('/');
          return;
        } catch {
          navigate('/login');
          return;
        }
      }
      navigate(me ? '/' : '/login');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not accept invitation');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <PageHeader
        icon={UserPlus}
        title="Accept invitation"
        subtitle="Join the organization you were invited to."
      />
      <Card>
        <CardContent className="space-y-4 p-5">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading invitation…</p>
          ) : !peek ? (
            <p className="text-sm text-muted-foreground">This invitation is invalid or was revoked.</p>
          ) : !peek.claimable ? (
            <div className="space-y-2">
              <StatusBadge value={peek.status} />
              <p className="text-sm text-muted-foreground">
                This invitation is no longer valid. Ask an administrator to send a new one.
              </p>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={(e) => void submit(e)}>
              <div className="space-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground">Organization · </span>
                  <strong>{peek.organizationName ?? 'Organization'}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Invited email · </span>
                  <strong>{peek.email}</strong>
                </div>
                {peek.roles.length > 0 ? (
                  <div>
                    <span className="text-muted-foreground">Role{peek.roles.length > 1 ? 's' : ''} · </span>
                    <strong>{peek.roles.join(', ')}</strong>
                  </div>
                ) : null}
              </div>

              {peek.needsAccount ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Create your account to join. You&apos;ll sign in with{' '}
                    <strong>{peek.email}</strong>.
                  </p>
                  <div className="space-y-1.5 text-sm">
                    <span className="text-muted-foreground">Full name</span>
                    <Input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your name"
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <span className="text-muted-foreground">Password</span>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <span className="text-muted-foreground">Confirm password</span>
                    <Input
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Re-enter password"
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  An account already exists for <strong>{peek.email}</strong>. Accept to join, then
                  sign in.
                </p>
              )}

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={submitting}>
                  {submitting
                    ? 'Joining…'
                    : peek.needsAccount
                      ? 'Create account & join'
                      : 'Accept & join'}
                </Button>
                <Button asChild variant="ghost">
                  <Link to="/login">Sign in instead</Link>
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
