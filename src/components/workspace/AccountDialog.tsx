import { useState } from 'react';
import { Modal, Field } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { useUi } from '@/store/UiContext';
import './AccountDialog.css';

/**
 * Account details, sign-out, and the one-way door out of a guest session.
 *
 * A guest session is an anonymous Firebase user. Its board is real and stored,
 * but the only key to it is a token in this browser: clear site data and it is
 * gone with no way to recover it. `upgradeGuest` links an email credential to the
 * *same* uid, so the workspaces carry over — which is why this is an upgrade form
 * and not a "sign up instead" link that would silently start a second account.
 */
export function AccountDialog() {
  const ui = useUi();
  const auth = useAuth();
  const notify = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const user = auth.user;
  if (!user) return null;

  const close = () => ui.setAccountOpen(false);

  const upgrade = () => {
    setBusy(true);
    void auth
      .upgradeGuest(email, password)
      .then(() => {
        notify('Account created — your workspaces were kept');
        close();
      })
      .catch(() => {
        /* auth.error renders below */
      })
      .finally(() => setBusy(false));
  };

  return (
    <Modal open onClose={close} title="Account" size="md">
      <dl className="account-facts">
        <dt>Signed in as</dt>
        <dd>{user.displayName || user.email || (user.isAnonymous ? 'Guest' : user.uid)}</dd>

        <dt>Email</dt>
        <dd>{user.email ?? <span className="account-none">none — guest session</span>}</dd>

        <dt>User id</dt>
        <dd className="mono account-uid">{user.uid}</dd>
      </dl>

      {user.isAnonymous ? (
        <section className="account-upgrade">
          <h3 className="label">Keep this workspace</h3>
          <p className="settings-hint">
            You are signed in as a guest. This board exists only in this browser session — if
            you clear site data or switch devices it cannot be recovered. Add an email and
            password to turn it into a permanent account, keeping everything you have already
            created.
          </p>
          <Field label="Email">
            <input
              type="email"
              value={email}
              autoComplete="email"
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password" hint="At least 6 characters.">
            <input
              type="password"
              value={password}
              minLength={6}
              autoComplete="new-password"
              placeholder="••••••••"
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {auth.error ? (
            <p className="login-error" role="alert">{auth.error}</p>
          ) : null}
          <button
            className="primary"
            disabled={busy || !email.trim() || password.length < 6}
            onClick={upgrade}
          >
            {busy ? 'Working…' : 'Create permanent account'}
          </button>
        </section>
      ) : null}

      <section className="account-signout">
        <button
          className="danger"
          disabled={!auth.canSignOut}
          title={auth.canSignOut ? undefined : 'The local backend has no session to end.'}
          onClick={() => {
            if (
              user.isAnonymous &&
              !confirm(
                'Signing out of a guest session permanently loses access to its board. Continue?',
              )
            ) {
              return;
            }
            void auth.logOut().then(close);
          }}
        >
          Sign out
        </button>
      </section>
    </Modal>
  );
}
