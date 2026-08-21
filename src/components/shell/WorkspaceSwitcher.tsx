import { useCallback, useRef, useState } from 'react';
import { useWorkspaces } from '@/store/WorkspaceContext';
import { useUi } from '@/store/UiContext';
import { useToast } from '@/components/ui/Toast';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { useDismiss } from '@/hooks/useDismiss';
import './WorkspaceSwitcher.css';

/**
 * Workspace picker in the top bar. Only rendered when the backend supports
 * workspaces, so local mode is unaffected.
 *
 * Pending invitations surface here rather than in a separate inbox: this is the
 * one control a user already looks at to change where they are working, and an
 * invitation is exactly that.
 */
export function WorkspaceSwitcher() {
  const ws = useWorkspaces();
  const ui = useUi();
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Escape also abandons an in-progress "new workspace" entry, which is what a
  // user pressing it expects — the same key cancels the inline input.
  const dismiss = useCallback(() => {
    setOpen(false);
    setCreating(false);
  }, []);
  useDismiss(ref, open, dismiss);

  const create = () => {
    const label = name.trim();
    if (!label) return;
    void ws
      .create(label)
      .then(() => {
        notify(`Created “${label}”`);
        setName('');
        setCreating(false);
        setOpen(false);
      })
      .catch((err) => notify(String(err), 'error'));
  };

  const accept = (workspaceId: string, workspaceName: string) => {
    void ws
      .acceptInvite(workspaceId)
      .then(() => {
        notify(`Joined “${workspaceName}”`);
        setOpen(false);
      })
      .catch((err) => notify(String(err), 'error'));
  };

  return (
    <div className="ws-switcher" ref={ref}>
      <button
        className="ws-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
          aria-label={ws.active ? `Workspace: ${ws.active.name}` : 'Choose a workspace'}
        title={ws.active ? `Workspace: ${ws.active.name}` : 'Choose a workspace'}
      >
        <span className="ws-mobile-label" aria-hidden="true">▦</span>
        <span className="ws-name">{ws.active?.name ?? 'No workspace'}</span>
        {ws.invites.length > 0 ? (
          <span className="ws-badge" title={`${ws.invites.length} pending invitation(s)`}>
            {ws.invites.length}
          </span>
        ) : null}
        <span className="caret">▾</span>
      </button>

      {open ? (
        <div className="ws-dropdown" role="menu">
          <div className="ws-section-label">Workspaces</div>
          <ul className="ws-list">
            {ws.workspaces.map((w) => (
              <li key={w.id}>
                <button
                  className={`ws-item${w.id === ws.active?.id ? ' on' : ''}`}
                  onClick={() => {
                    ws.select(w.id);
                    setOpen(false);
                  }}
                >
                  <span className="ws-item-name">{w.name}</span>
                  <RoleBadge role={w.role} />
                </button>
              </li>
            ))}
            {ws.workspaces.length === 0 ? (
              <li className="ws-empty">No workspaces yet.</li>
            ) : null}
          </ul>

          {ws.invites.length > 0 ? (
            <>
              <div className="ws-divider" />
              <div className="ws-section-label">Invitations</div>
              <ul className="ws-list">
                {ws.invites.map((invite) => (
                  <li className="ws-invite" key={invite.workspaceId}>
                    <div className="ws-invite-text">
                      <span className="ws-item-name">{invite.workspaceName}</span>
                      <span className="ws-invite-meta">
                        as {invite.role}
                        {invite.invitedBy ? ` · from ${invite.invitedBy}` : ''}
                      </span>
                    </div>
                    <div className="ws-invite-actions">
                      <button
                        className="tiny"
                        onClick={() => accept(invite.workspaceId, invite.workspaceName)}
                      >
                        Join
                      </button>
                      <button
                        className="tiny ghost"
                        onClick={() =>
                          void ws
                            .declineInvite(invite.workspaceId)
                            .catch((err) => notify(String(err), 'error'))
                        }
                      >
                        Dismiss
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <div className="ws-divider" />

          {creating ? (
            <div className="ws-create">
              <input
                type="text"
                autoFocus
                placeholder="Workspace name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') create();
                  if (e.key === 'Escape') setCreating(false);
                }}
              />
              <button className="tiny primary" onClick={create}>
                Create
              </button>
            </div>
          ) : (
            <button className="ws-action" onClick={() => setCreating(true)}>
              + New workspace
            </button>
          )}

          <button
            className="ws-action"
            disabled={!ws.active}
            onClick={() => {
              setOpen(false);
              ui.setMembersOpen(true);
            }}
          >
            Members and sharing
          </button>
        </div>
      ) : null}
    </div>
  );
}
