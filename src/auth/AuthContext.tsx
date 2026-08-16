import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  GithubAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  linkWithCredential,
  EmailAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type AuthError,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';
import { BACKEND, isFirebaseBackend } from '@/data/backend';
import { DataError } from '@/data/types';
import { avatarColorFor, initialsFrom } from '@/data/starter';
import type { Profile } from '@/types/board';

/**
 * Session state.
 *
 * The app has to run in two modes, so this context normalizes them:
 *
 *   local     — no accounts. It reports a synthetic session immediately so
 *               nothing downstream has to branch, and `canSignOut` is false so
 *               the UI does not offer an action that cannot work.
 *   firebase  — a real Firebase Auth session; `user` is null until sign-in.
 *
 * `profile` is derived from the session and is what the avatar and user menu
 * render. In firebase mode the user can still override name/initials in Settings,
 * which is why stored settings win over the derived value — see BoardContext.
 */

export type SignInMethod = 'google' | 'github' | 'password' | 'anonymous';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAnonymous: boolean;
}

interface AuthContextValue {
  /** True until the initial session check finishes. */
  initializing: boolean;
  user: AuthUser | null;
  /** Derived identity for display. Null when signed out. */
  profile: Profile | null;
  /** False in local mode — there is no session to end. */
  canSignOut: boolean;
  /** Last auth failure, in human-readable form. */
  error: string | null;
  clearError(): void;

  signInWith(method: Extract<SignInMethod, 'google' | 'github'>): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<void>;
  signUpWithPassword(email: string, password: string, displayName: string): Promise<void>;
  signInAsGuest(): Promise<void>;
  /** Promote an anonymous session to a permanent account, keeping the same uid. */
  upgradeGuest(email: string, password: string): Promise<void>;
  sendReset(email: string): Promise<void>;
  logOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** The session used in local mode, where identity comes from settings.json. */
const LOCAL_USER: AuthUser = {
  uid: 'local',
  email: null,
  displayName: 'Local user',
  photoURL: null,
  isAnonymous: false,
};

function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    isAnonymous: user.isAnonymous,
  };
}

/** Identity for display, derived from whatever the provider gave us. */
export function profileFromUser(user: AuthUser): Profile {
  const name = user.isAnonymous
    ? 'Guest'
    : user.displayName || user.email?.split('@')[0] || 'Signed in';
  return {
    name,
    email: user.email ?? (user.isAnonymous ? 'guest session' : ''),
    initials: user.isAnonymous ? 'G' : initialsFrom(user.displayName || user.email || 'user'),
    avatarColor: avatarColorFor(user.uid),
  };
}

/** Firebase error codes are not user-facing; translate the common ones. */
function describeAuthError(err: unknown): string {
  const code = (err as AuthError)?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address is not valid.';
    case 'auth/missing-password':
      return 'Enter a password.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/email-already-in-use':
      return 'An account already exists for that email. Try signing in instead.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup. Allow popups and retry.';
    case 'auth/account-exists-with-different-credential':
      return 'That email is already registered with a different sign-in method.';
    case 'auth/operation-not-allowed':
      return 'That sign-in method is not enabled in the Firebase console.';
    case 'auth/unauthorized-domain':
      return 'This domain is not in the Firebase authorised domains list. Add it under Authentication → Settings.';
    case 'auth/admin-restricted-operation':
      return 'Anonymous sign-in is not enabled in the Firebase console.';
    case 'auth/network-request-failed':
      return 'Network error reaching Firebase.';
    default:
      return err instanceof Error ? err.message : 'Sign-in failed.';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Local mode has nothing to wait for, so it starts resolved.
  const [initializing, setInitializing] = useState(isFirebaseBackend);
  const [user, setUser] = useState<AuthUser | null>(isFirebaseBackend ? null : LOCAL_USER);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseBackend) return;
    return onAuthStateChanged(
      getFirebaseAuth(),
      (next) => {
        setUser(next ? toAuthUser(next) : null);
        setInitializing(false);
      },
      (err) => {
        setError(describeAuthError(err));
        setInitializing(false);
      },
    );
  }, []);

  /** Every auth call funnels through here so failures surface consistently. */
  const attempt = useCallback(async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      const message = describeAuthError(err);
      setError(message);
      throw new DataError(message, 'permission');
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const requireFirebase = () => {
      if (!isFirebaseBackend) {
        throw new DataError(
          `Sign-in is unavailable on the "${BACKEND}" backend.`,
          'config',
        );
      }
      return getFirebaseAuth();
    };

    return {
      initializing,
      user,
      profile: user ? profileFromUser(user) : null,
      canSignOut: isFirebaseBackend,
      error,
      clearError: () => setError(null),

      signInWith: (method) =>
        attempt(() => {
          const auth = requireFirebase();
          const provider =
            method === 'google' ? new GoogleAuthProvider() : new GithubAuthProvider();
          // Always show the chooser; otherwise a shared browser silently reuses
          // whichever account signed in last.
          if (method === 'google') {
            (provider as GoogleAuthProvider).setCustomParameters({ prompt: 'select_account' });
          }
          return signInWithPopup(auth, provider);
        }),

      signInWithPassword: (email, password) =>
        attempt(() => signInWithEmailAndPassword(requireFirebase(), email.trim(), password)),

      signUpWithPassword: (email, password, displayName) =>
        attempt(async () => {
          const auth = requireFirebase();
          const created = await createUserWithEmailAndPassword(auth, email.trim(), password);
          const name = displayName.trim();
          if (name) {
            await updateProfile(created.user, { displayName: name });
            // onAuthStateChanged already fired with the pre-update user.
            setUser(toAuthUser(created.user));
          }
        }),

      signInAsGuest: () => attempt(() => signInAnonymously(requireFirebase())),

      /**
       * Link an email credential to the current anonymous user rather than
       * creating a second account, so the guest's workspaces come along.
       */
      upgradeGuest: (email, password) =>
        attempt(async () => {
          const auth = requireFirebase();
          const current = auth.currentUser;
          if (!current?.isAnonymous) {
            throw new Error('Only a guest session can be upgraded.');
          }
          const credential = EmailAuthProvider.credential(email.trim(), password);
          const linked = await linkWithCredential(current, credential);
          setUser(toAuthUser(linked.user));
        }),

      sendReset: (email) =>
        attempt(() => sendPasswordResetEmail(requireFirebase(), email.trim())),

      logOut: () => attempt(() => signOut(requireFirebase())),
    };
  }, [initializing, user, error, attempt]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** For components that only mount once a session exists. */
export function useSession(): AuthUser {
  const { user } = useAuth();
  if (!user) throw new Error('useSession used while signed out');
  return user;
}
