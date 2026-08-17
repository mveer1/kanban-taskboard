import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { isoFrom, paths, toDataError } from './firebase';
import {
  DataError,
  type MemberRole,
  type PendingInvite,
  type Workspace,
  type WorkspaceMember,
} from './types';

/**
 * Workspace membership: create, list, invite, and role changes.
 *
 * Kept separate from the DataSource because it is a different lifetime — a
 * DataSource is scoped to one workspace, while this operates across all of them
 * and runs before a workspace is chosen.
 *
 * Two fields on the workspace document carry the same information deliberately:
 *
 *   members:    { [uid]: role }   authoritative, and what firestore.rules reads
 *   memberUids: [uid, ...]        exists only so "workspaces I belong to" can be
 *                                 a single `array-contains` query. Firestore
 *                                 cannot query for the presence of a map key.
 *
 * They are always written together, in one operation, so they cannot drift.
 */

export interface WorkspaceDoc {
  name: string;
  ownerUid: string;
  members: Record<string, MemberRole>;
  memberUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** Firestore ids may not contain `/`; emails are otherwise safe as doc ids. */
function inviteId(email: string): string {
  return email.trim().toLowerCase().replace(/\//g, '_');
}

function toWorkspace(id: string, raw: WorkspaceDoc, uid: string): Workspace | null {
  const role = raw.members?.[uid];
  if (!role) return null;
  return {
    id,
    name: raw.name || 'Untitled workspace',
    ownerUid: raw.ownerUid,
    role,
    memberCount: Object.keys(raw.members ?? {}).length,
    updatedAt: isoFrom(raw.updatedAt),
  };
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

/** Every workspace this user is a member of, most recently updated first. */
export async function listWorkspaces(uid: string): Promise<Workspace[]> {
  const db = getDb();
  try {
    const snaps = await getDocs(
      query(collection(db, 'workspaces'), where('memberUids', 'array-contains', uid)),
    );
    return snaps.docs
      .map((d) => toWorkspace(d.id, d.data() as WorkspaceDoc, uid))
      .filter((w): w is Workspace => w !== null)
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  } catch (err) {
    throw toDataError(err, 'Could not list workspaces');
  }
}

export async function listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const db = getDb();
  try {
    const wsSnap = await getDoc(doc(db, paths.workspace(workspaceId)));
    if (!wsSnap.exists()) throw new DataError('Workspace not found', 'not-found');
    const ws = wsSnap.data() as WorkspaceDoc;

    // Roles are authoritative on the workspace doc; the members subcollection
    // only supplies display names, and may lag if someone never signed in.
    const profiles = await getDocs(collection(db, paths.members(workspaceId)));
    const byUid = new Map(
      profiles.docs.map((d) => [d.id, d.data() as { email?: string; displayName?: string }]),
    );

    return Object.entries(ws.members ?? {}).map(([uid, role]) => ({
      uid,
      email: byUid.get(uid)?.email ?? null,
      displayName: byUid.get(uid)?.displayName ?? null,
      role,
    }));
  } catch (err) {
    if (err instanceof DataError) throw err;
    throw toDataError(err, 'Could not list members');
  }
}

/**
 * Invitations addressed to this email across all workspaces.
 *
 * A collection-group query, which needs the index in firestore.indexes.json.
 * Rules restrict each read to invites whose `email` matches the caller's token,
 * so this cannot be used to enumerate other people's invitations.
 */
export async function listMyInvites(email: string | null): Promise<PendingInvite[]> {
  if (!email) return [];
  const db = getDb();
  try {
    const { collectionGroup } = await import('firebase/firestore');
    const snaps = await getDocs(
      query(collectionGroup(db, 'invites'), where('email', '==', email.toLowerCase())),
    );
    return snaps.docs.map((d) => {
      const raw = d.data() as {
        email: string;
        role: MemberRole;
        workspaceName?: string;
        invitedBy?: string;
      };
      return {
        email: raw.email,
        role: raw.role,
        // .../workspaces/{wid}/invites/{email} — the workspace id is two up.
        workspaceId: d.ref.parent.parent?.id ?? '',
        workspaceName: raw.workspaceName ?? 'Shared workspace',
        invitedBy: raw.invitedBy ?? null,
      };
    });
  } catch (err) {
    throw toDataError(err, 'Could not check invitations');
  }
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

/**
 * Create a workspace with this user as owner, and seed its board so the story
 * editor has a project to reference.
 */
export async function createWorkspace(
  user: { uid: string; email: string | null; displayName: string | null },
  name: string,
): Promise<string> {
  const db = getDb();
  const label = name.trim() || 'My workspace';
  const ref = doc(collection(db, 'workspaces'));

  try {
    const batch = writeBatch(db);
    batch.set(ref, {
      name: label,
      ownerUid: user.uid,
      members: { [user.uid]: 'owner' },
      memberUids: [user.uid],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } satisfies WorkspaceDoc);

    batch.set(doc(db, `${paths.members(ref.id)}/${user.uid}`), {
      email: user.email,
      displayName: user.displayName,
      joinedAt: serverTimestamp(),
    });

    await batch.commit();
    return ref.id;
  } catch (err) {
    throw toDataError(err, 'Could not create the workspace');
  }
}

export async function renameWorkspace(workspaceId: string, name: string): Promise<void> {
  const db = getDb();
  try {
    await updateDoc(doc(db, paths.workspace(workspaceId)), {
      name: name.trim() || 'Untitled workspace',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    throw toDataError(err, 'Could not rename the workspace');
  }
}

/**
 * Invite by email.
 *
 * The invitee may not have an account yet, so there is no uid to add. The invite
 * document is keyed by email and claimed on their next sign-in
 * (`acceptInvite`). Nothing is granted until they accept.
 */
export async function inviteMember(
  workspaceId: string,
  workspaceName: string,
  email: string,
  role: Exclude<MemberRole, 'owner'>,
  invitedByEmail: string | null,
): Promise<void> {
  const db = getDb();
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    throw new DataError('That does not look like an email address.', 'validation');
  }
  try {
    await setDoc(doc(db, `${paths.invites(workspaceId)}/${inviteId(normalized)}`), {
      email: normalized,
      role,
      workspaceName,
      invitedBy: invitedByEmail,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    throw toDataError(err, 'Could not send the invitation');
  }
}

export async function revokeInvite(workspaceId: string, email: string): Promise<void> {
  const db = getDb();
  try {
    await deleteDoc(doc(db, `${paths.invites(workspaceId)}/${inviteId(email)}`));
  } catch (err) {
    throw toDataError(err, 'Could not revoke the invitation');
  }
}

export async function listInvites(
  workspaceId: string,
): Promise<Array<{ email: string; role: MemberRole }>> {
  const db = getDb();
  try {
    const snaps = await getDocs(collection(db, paths.invites(workspaceId)));
    return snaps.docs.map((d) => {
      const raw = d.data() as { email: string; role: MemberRole };
      return { email: raw.email, role: raw.role };
    });
  } catch (err) {
    throw toDataError(err, 'Could not list invitations');
  }
}

/**
 * Claim an invitation: add self to the workspace and delete the invite.
 *
 * Runs in a transaction because the two halves must not come apart — a
 * surviving invite would let the grant be replayed, and a deleted invite with no
 * membership would lock the user out with no way back in.
 */
export async function acceptInvite(
  user: { uid: string; email: string | null; displayName: string | null },
  workspaceId: string,
): Promise<void> {
  const db = getDb();
  if (!user.email) throw new DataError('Your account has no email address.', 'validation');

  const wsRef = doc(db, paths.workspace(workspaceId));
  const inviteRef = doc(db, `${paths.invites(workspaceId)}/${inviteId(user.email)}`);

  try {
    await runTransaction(db, async (tx) => {
      const invite = await tx.get(inviteRef);
      if (!invite.exists()) throw new DataError('That invitation no longer exists.', 'not-found');
      const role = (invite.data() as { role: MemberRole }).role;

      const ws = await tx.get(wsRef);
      if (!ws.exists()) throw new DataError('That workspace no longer exists.', 'not-found');
      const current = ws.data() as WorkspaceDoc;

      tx.update(wsRef, {
        [`members.${user.uid}`]: role,
        memberUids: [...new Set([...(current.memberUids ?? []), user.uid])],
        updatedAt: serverTimestamp(),
      });
      tx.set(doc(db, `${paths.members(workspaceId)}/${user.uid}`), {
        email: user.email,
        displayName: user.displayName,
        joinedAt: serverTimestamp(),
      });
      tx.delete(inviteRef);
    });
  } catch (err) {
    if (err instanceof DataError) throw err;
    throw toDataError(err, 'Could not accept the invitation');
  }
}

export async function declineInvite(email: string, workspaceId: string): Promise<void> {
  await revokeInvite(workspaceId, email);
}

export async function changeMemberRole(
  workspaceId: string,
  uid: string,
  role: MemberRole,
): Promise<void> {
  const db = getDb();
  try {
    await updateDoc(doc(db, paths.workspace(workspaceId)), {
      [`members.${uid}`]: role,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    throw toDataError(err, 'Could not change that role');
  }
}

/**
 * Remove a member. Refuses to remove the owner, since a workspace with no owner
 * could never have its membership edited again.
 */
export async function removeMember(workspaceId: string, uid: string): Promise<void> {
  const db = getDb();
  const wsRef = doc(db, paths.workspace(workspaceId));
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(wsRef);
      if (!snap.exists()) throw new DataError('Workspace not found', 'not-found');
      const ws = snap.data() as WorkspaceDoc;

      if (ws.ownerUid === uid) {
        throw new DataError(
          'The owner cannot be removed. Transfer ownership first.',
          'validation',
        );
      }

      tx.update(wsRef, {
        [`members.${uid}`]: deleteField(),
        memberUids: (ws.memberUids ?? []).filter((id) => id !== uid),
        updatedAt: serverTimestamp(),
      });
      tx.delete(doc(db, `${paths.members(workspaceId)}/${uid}`));
    });
  } catch (err) {
    if (err instanceof DataError) throw err;
    throw toDataError(err, 'Could not remove that member');
  }
}

/** Hand the owner role to an existing member and demote yourself to editor. */
export async function transferOwnership(
  workspaceId: string,
  toUid: string,
  fromUid: string,
): Promise<void> {
  const db = getDb();
  try {
    await updateDoc(doc(db, paths.workspace(workspaceId)), {
      ownerUid: toUid,
      [`members.${toUid}`]: 'owner',
      [`members.${fromUid}`]: 'editor',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    throw toDataError(err, 'Could not transfer ownership');
  }
}

export async function leaveWorkspace(workspaceId: string, uid: string): Promise<void> {
  await removeMember(workspaceId, uid);
}

/**
 * Delete a workspace and its board, snapshots, members, and invites.
 *
 * Firestore has no recursive delete on the client, so subcollections are removed
 * explicitly. The workspace document goes last: if a page of deletes fails the
 * workspace still exists and the operation can be retried, rather than leaving
 * orphaned data no rule grants access to.
 */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const db = getDb();
  try {
    for (const sub of ['state', 'backups', 'members', 'invites']) {
      await deleteCollection(db, `${paths.workspace(workspaceId)}/${sub}`);
    }
    await deleteDoc(doc(db, paths.workspace(workspaceId)));
  } catch (err) {
    throw toDataError(err, 'Could not delete the workspace');
  }
}

/** Batched delete. Batches cap at 500 writes, so chunk. */
async function deleteCollection(db: Firestore, path: string): Promise<void> {
  const snaps = await getDocs(collection(db, path));
  for (let i = 0; i < snaps.docs.length; i += 400) {
    const batch = writeBatch(db);
    for (const d of snaps.docs.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
  }
}

/**
 * Remember the signed-in user and their last workspace, so the next visit lands
 * where they left off and so member lists can show a name rather than a uid.
 */
export async function rememberUser(
  user: { uid: string; email: string | null; displayName: string | null; photoURL: string | null },
  lastWorkspaceId?: string,
): Promise<void> {
  const db = getDb();
  try {
    await setDoc(
      doc(db, paths.user(user.uid)),
      {
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        ...(lastWorkspaceId ? { lastWorkspaceId } : {}),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch {
    // Cosmetic. Never block sign-in on it.
  }
}

export async function readLastWorkspaceId(uid: string): Promise<string | null> {
  const db = getDb();
  try {
    const snap = await getDoc(doc(db, paths.user(uid)));
    return (snap.data() as { lastWorkspaceId?: string } | undefined)?.lastWorkspaceId ?? null;
  } catch {
    return null;
  }
}
