import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from './AuthContext';
import './LoginScreen.css';

/**
 * The unauthenticated view for the firebase backend.
 *
 * Three provider buttons plus an email form that flips between sign-in, sign-up,
 * and reset. Guest sign-in is offered last and labelled as temporary, because an
 * anonymous session that the user does not realise is disposable is a data-loss
 * trap — `AuthContext.upgradeGuest` is the way out, surfaced in the user menu.
 */

type Mode = 'signin' | 'signup' | 'reset';

const MODE_COPY: Record<Mode, { action: string; alt: string; altLabel: string }> = {
  signin: { action: 'Sign in', alt: 'signup', altLabel: 'Create an account' },
  signup: { action: 'Create account', alt: 'signin', altLabel: 'I already have an account' },
  reset: { action: 'Send reset link', alt: 'signin', altLabel: 'Back to sign in' },
};

export function LoginScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const copy = MODE_COPY[mode];

  /** All submits share the busy/notice handling; errors land in auth.error. */
  const run = async (fn: () => Promise<void>, onDone?: () => void) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      onDone?.();
    } catch {
      /* auth.error is already set and rendered below */
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signin') void run(() => auth.signInWithPassword(email, password));
    else if (mode === 'signup') void run(() => auth.signUpWithPassword(email, password, name));
    else {
      void run(
        () => auth.sendReset(email),
        () => setNotice(`If an account exists for ${email}, a reset link is on its way.`),
      );
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setNotice(null);
    auth.clearError();
  };

  return (
    <div className="login-screen">
      <motion.div
        className="login-card"
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
      >
        <header className="login-head">
          <div className="login-mark">TB</div>
          <h1>Task Board</h1>
          <p>Projects → Stories → Tasks. Sign in to open your workspaces.</p>
        </header>

        <div className="login-providers">
          <motion.button
            className="provider google"
            disabled={busy}
            onClick={() => void run(() => auth.signInWith('google'))}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, type: 'spring', bounce: 0, duration: 0.4 }}
          >
            <span className="provider-glyph" aria-hidden="true">G</span>
            Continue with Google
          </motion.button>
          <motion.button
            className="provider github"
            disabled={busy}
            onClick={() => void run(() => auth.signInWith('github'))}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, type: 'spring', bounce: 0, duration: 0.4 }}
          >
            <span className="provider-glyph" aria-hidden="true">◑</span>
            Continue with GitHub
          </motion.button>
        </div>

        <div className="login-divider"><span>or</span></div>

        <form className="login-form" onSubmit={submit}>
          <AnimatePresence mode="popLayout">
          {mode === 'signup' ? (
            <motion.label
              key="name-field"
              className="login-field"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            >
              <span>Name</span>
              <input
                type="text"
                value={name}
                autoComplete="name"
                placeholder="Ada Lovelace"
                onChange={(e) => setName(e.target.value)}
              />
            </motion.label>
          ) : null}
          </AnimatePresence>

          <label className="login-field">
            <span>Email</span>
            <input
              type="email"
              required
              value={email}
              autoComplete="email"
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <AnimatePresence mode="popLayout">
          {mode !== 'reset' ? (
            <motion.label
              key="password-field"
              className="login-field"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            >
              <span>Password</span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                placeholder="At least 6 characters"
                onChange={(e) => setPassword(e.target.value)}
              />
            </motion.label>
          ) : null}
          </AnimatePresence>

          {auth.error ? <p className="login-error" role="alert">{auth.error}</p> : null}
          {notice ? <p className="login-notice">{notice}</p> : null}

          <button className="primary login-submit" type="submit" disabled={busy}>
            {busy ? 'Working…' : copy.action}
          </button>
        </form>

        <div className="login-links">
          <button className="link" onClick={() => switchMode(copy.alt as Mode)}>
            {copy.altLabel}
          </button>
          {mode === 'signin' ? (
            <button className="link" onClick={() => switchMode('reset')}>
              Forgot password?
            </button>
          ) : null}
        </div>

        <div className="login-guest">
          <button
            className="ghost"
            disabled={busy}
            onClick={() => void run(() => auth.signInAsGuest())}
          >
            Try it as a guest
          </button>
          <p className="login-hint">
            A guest workspace is tied to this browser. Add an email and password later from the
            user menu to keep it.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
