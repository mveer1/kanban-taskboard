import { useMemo } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useWorkspaces } from '@/store/WorkspaceContext';
import { isFirebaseBackend, localDataSource } from '@/data/backend';
import { createFirestoreDataSource } from '@/data/firebase';
import type { DataSource } from '@/data/types';

/**
 * The DataSource for the current session and workspace.
 *
 * This is the single seam between "who is signed in and where are they working"
 * and "how does data get read and written". BoardContext consumes only the
 * returned interface, so it is identical in both modes.
 *
 * Returns null in firebase mode until there is both a session and a chosen
 * workspace — the caller renders a splash rather than making calls that would be
 * denied by security rules.
 */
export function useDataSource(): DataSource | null {
  const { user } = useAuth();
  const { active } = useWorkspaces();

  const uid = user?.uid ?? null;
  const workspaceId = active?.id ?? null;
  const role = active?.role ?? null;

  return useMemo(() => {
    if (!isFirebaseBackend) return localDataSource();
    if (!uid || !workspaceId || !role) return null;

    // A new instance per (user, workspace, role): the source closes over all
    // three, and its revision guard must reset when the workspace changes.
    //
    // Depending on the ids rather than the objects matters — `active` gets a new
    // identity whenever the workspace list is refetched (a rename, an accepted
    // invite), and rebuilding the source would make BoardContext re-read the
    // whole board for a change that does not affect where the data lives.
    return createFirestoreDataSource({ workspaceId, uid, role });
  }, [uid, workspaceId, role]);
}
