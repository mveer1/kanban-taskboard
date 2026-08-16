import { useCallback, useEffect, useState } from 'react';
import { Modal, Field, FieldRow } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { useAuth } from '@/auth/AuthContext';
import { useUi } from '@/store/UiContext';
import { useWorkspaces } from '@/store/WorkspaceContext';
import {
  changeMemberRole,
  inviteMember,
  listInvites,
  listMembers,
  removeMember,
  revokeInvite,
  transferOwnership,
} from '@/data/workspaces';
import type { MemberRole, WorkspaceMember } from '@/data/types';
import './MembersDialog.css';

/**
 * Workspace sharing: rename, invite, change roles, remove people, delete.
 *
 * Only owners see the mutating controls. That is a convenience, not the security
 * boundary — firestore.rules enforces the same restrictions, because a hidden
 * button is not a permission.
 */

const ROLE_HINT: Record<MemberRole, string> = {
  owner: 'Full control, including members and deletion.',
  editor: 'Can create and change stories, tasks, projects, and tags.',
  viewer: 'Read-only. Can filter and browse but not save.',
};

export function MembersDialog() {
  const ui = useUi();
  const ws = useWorkspaces();
  const { user } = useAuth();
  const notify = useToast();

  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [pending, setPending] = useState<Array<{ email: string; role: MemberRole }>>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Exclude<MemberRole, 'owner'>>('editor');
  const [name, setName] = useState(ws.active?.name ?? '');
  const [busy, setBusy] = useState(false);

  const workspace = ws.active;
  const isOwner = workspace?.role === 'owner';

  const refresh = useCallback(async () => {
    if (!workspace) return;
    try {
      const [people, invites] = await Promise.all([
        listMembers(workspace.id),
        // Only owners may read the invite list under the rules; a failure here
        // must not blank out the member list for everyone else.
        listInvites(workspace.id).catch(() => []),
      ]);
      setMembers(people);
      setPending(invites);
    } catch (err) {
      notify(String(err), 'error');
    }
  }, [workspace, notify]);

  useEffect(() => {
    void refresh();
    setName(workspace?.name ?? '');
  }, [refresh, workspace?.name]);

  if (!workspace || !user) return null;

  /** Shared wrapper: busy flag, toast, and a reload after every mutation. */
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      notify(label);
      await refresh();
    } catch (err) {
      notify(String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const invite = () => {
    const email = inviteEmail.trim();
    if (!email) return;
    void run(`Invited ${email}`, async () => {
      await inviteMember(workspace.id, workspace.name, email, inviteRole, user.email);
      setInviteEmail('');
    });
  };

  return (
    <Modal
      open
      onClose={() => ui.setMembersOpen(false)}
      title="Members and sharing"
      subtitle={`${workspace.name} · ${workspace.memberCount} member${workspace.memberCount === 1 ? '' : 's'}`}
      size="lg"
    >
      {isOwner ? (
        <section className="members-block">
          <h3 className="label">Workspace name</h3>
          <div className="members-rename">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim() !== workspace.name) {
                  void run('Workspace renamed', () => ws.rename(workspace.id, name));
                }
              }}
            />
            <button
              disabled={busy || !name.trim() || name.trim() === workspace.name}
              onClick={() => void run('Workspace renamed', () => ws.rename(workspace.id, name))}
            >
              Rename
            </button>
          </div>
        </section>
      ) : null}

      {isOwner ? (
        <section className="members-block">
          <h3 className="label">Invite someone</h3>
          <FieldRow cols={2}>
            <Field label="Email" hint="They can accept from their own workspace menu.">
              <input
                type="email"
                placeholder="teammate@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') invite();
                }}
              />
            </Field>
            <Field label="Role" hint={ROLE_HINT[inviteRole]}>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </Field>
          </FieldRow>
          <button className="primary" disabled={busy || !inviteEmail.trim()} onClick={invite}>
            Send invitation
          </button>
        </section>
      ) : null}

      {pending.length > 0 ? (
        <section className="members-block">
          <h3 className="label">Pending invitations ({pending.length})</h3>
          <ul className="members-list">
            {pending.map((p) => (
              <li key={p.email}>
                <span className="member-name">{p.email}</span>
                <RoleBadge role={p.role} />
                {isOwner ? (
                  <button
                    className="tiny ghost"
                    disabled={busy}
                    onClick={() =>
                      void run('Invitation revoked', () => revokeInvite(workspace.id, p.email))
                    }
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="members-block">
        <h3 className="label">Members ({members.length})</h3>
        <ul className="members-list">
          {members.map((m) => {
            const isSelf = m.uid === user.uid;
            return (
              <li key={m.uid}>
                <span className="member-name">
                  {m.displayName || m.email || m.uid}
                  {isSelf ? <span className="member-you">you</span> : null}
                </span>
                {m.email && m.displayName ? (
                  <span className="member-email">{m.email}</span>
                ) : null}

                {isOwner && !isSelf ? (
                  <select
                    className="member-role-select"
                    value={m.role}
                    disabled={busy || m.role === 'owner'}
                    onChange={(e) =>
                      void run('Role updated', () =>
                        changeMemberRole(workspace.id, m.uid, e.target.value as MemberRole),
                      )
                    }
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                ) : (
                  <RoleBadge role={m.role} />
                )}

                {isOwner && !isSelf && m.role !== 'owner' ? (
                  <>
                    <button
                      className="tiny ghost"
                      disabled={busy}
                      title="Make this person the owner and demote yourself to editor"
                      onClick={() => {
                        if (!confirm(`Hand ownership of “${workspace.name}” to ${m.email ?? m.uid}?`)) {
                          return;
                        }
                        void run('Ownership transferred', async () => {
                          await transferOwnership(workspace.id, m.uid, user.uid);
                          await ws.refresh();
                        });
                      }}
                    >
                      Make owner
                    </button>
                    <button
                      className="tiny danger"
                      disabled={busy}
                      onClick={() => {
                        if (!confirm(`Remove ${m.email ?? m.uid} from this workspace?`)) return;
                        void run('Member removed', () => removeMember(workspace.id, m.uid));
                      }}
                    >
                      Remove
                    </button>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="members-block members-danger">
        <h3 className="label">Leaving and deleting</h3>
        {isOwner ? (
          <>
            <p className="settings-hint">
              Deleting removes the board, every snapshot, and all memberships. It cannot be
              undone. Transfer ownership first if you only want to hand it over.
            </p>
            <button
              className="danger"
              disabled={busy || ws.workspaces.length <= 1}
              title={
                ws.workspaces.length <= 1
                  ? 'This is your only workspace — create another one first.'
                  : undefined
              }
              onClick={() => {
                if (!confirm(`Permanently delete “${workspace.name}” and all of its data?`)) return;
                void run('Workspace deleted', async () => {
                  await ws.remove(workspace.id);
                  ui.setMembersOpen(false);
                });
              }}
            >
              Delete this workspace
            </button>
          </>
        ) : (
          <>
            <p className="settings-hint">
              You will lose access until someone invites you again. The board itself is
              untouched.
            </p>
            <button
              className="danger"
              disabled={busy}
              onClick={() => {
                if (!confirm(`Leave “${workspace.name}”?`)) return;
                void run('Left the workspace', async () => {
                  await removeMember(workspace.id, user.uid);
                  await ws.refresh();
                  ui.setMembersOpen(false);
                });
              }}
            >
              Leave this workspace
            </button>
          </>
        )}
      </section>
    </Modal>
  );
}
