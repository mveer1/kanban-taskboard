import { useCallback, useRef, useState } from 'react';
import type { Profile } from '@/types/board';
import { useAuth } from '@/auth/AuthContext';
import { useUi } from '@/store/UiContext';
import { useWorkspaces } from '@/store/WorkspaceContext';
import { useBoardStore } from '@/store/BoardContext';
import { useDismiss } from '@/hooks/useDismiss';
import './UserMenu.css';

/**
 * Avatar dropdown.
 *
 * Identity comes from the auth session when there is one and from
 * data/settings.json when there is not, which is why the profile is a prop rather
 * than read from context here — the caller already resolved which of the two wins.
 * Actions that a backend cannot support are hidden rather than shown disabled,
 * except sign-out, which is explained instead.
 */
export function UserMenu({
  profile,
  onOpenSettings,
}: {
  profile: Profile;
  onOpenSettings: () => void;
}) {
  const auth = useAuth();
  const ui = useUi();
  const ws = useWorkspaces();
  const { source } = useBoardStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const hasWorkspaces = source?.capabilities.workspaces ?? false;
  const isGuest = auth.user?.isAnonymous ?? false;

  useDismiss(ref, open, useCallback(() => setOpen(false), []));

  const go = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="user-menu" ref={ref}>
      <button
        className="user-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="avatar md" style={{ background: profile.avatarColor }}>
          {profile.initials}
        </span>
        {isGuest ? <span className="user-guest-dot" title="Guest session" /> : null}
        <span className="caret">▾</span>
      </button>

      {open ? (
        <div className="user-dropdown" role="menu">
          <div className="user-card">
            <span className="avatar lg" style={{ background: profile.avatarColor }}>
              {profile.initials}
            </span>
            <div className="user-card-text">
              <div className="user-card-name">{profile.name}</div>
              <div className="user-card-email">{profile.email || 'No email on file'}</div>
            </div>
          </div>

          {isGuest ? (
            <button className="user-callout" onClick={go(() => ui.setAccountOpen(true))}>
              Guest session — add an email to keep this board
            </button>
          ) : null}

          <div className="user-divider" />

          <button className="user-action" onClick={go(onOpenSettings)}>
            Settings
          </button>

          {hasWorkspaces ? (
            <>
              <button
                className="user-action"
                disabled={!ws.active}
                onClick={go(() => ui.setMembersOpen(true))}
              >
                Members and sharing
              </button>
              <button className="user-action" onClick={go(() => void ws.refresh())}>
                Refresh workspaces
              </button>
            </>
          ) : null}

          {auth.canSignOut ? (
            <>
              <button className="user-action" onClick={go(() => ui.setAccountOpen(true))}>
                Account
              </button>
              <button className="user-action" onClick={go(() => void auth.logOut())}>
                Sign out
              </button>
            </>
          ) : null}

          <div className="user-divider" />
          <div className="user-note">
            {source?.describe ?? 'No backend'}
            {ws.active && hasWorkspaces ? ` · ${ws.active.role}` : ''}
          </div>
        </div>
      ) : null}
    </div>
  );
}
