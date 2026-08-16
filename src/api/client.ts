import type { Board, Settings } from '@/types/board';

/**
 * Typed wrappers over the Node API. Every network call in the app goes
 * through this file — components never call fetch directly.
 */

/** Thrown on 4xx/5xx. `errors` carries validation messages from the server. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: string[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    let errors: string[] = [];
    try {
      const body = await res.json();
      message = body.error ?? message;
      errors = body.errors ?? [];
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status, errors);
  }

  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  getBoard: () => request<Board>('/board'),

  saveBoard: (board: Board) =>
    request<{ ok: true; backup: string | null }>('/board', {
      method: 'PUT',
      body: JSON.stringify(board),
    }),

  getSettings: () => request<Settings>('/settings'),

  saveSettings: (settings: Settings) =>
    request<{ ok: true }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  listBackups: () =>
    request<Array<{ name: string; size: number; modified: string }>>('/backups'),

  restoreBackup: (name: string) =>
    request<{ ok: true }>('/backups/restore', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
};

/**
 * Subscribe to server-sent events. The server emits `board-changed` when
 * data/board.json is edited outside the app (e.g. directly by an AI agent),
 * so the UI can pull fresh data instead of overwriting it.
 */
export function subscribeToBoardChanges(onChange: () => void): () => void {
  const source = new EventSource('/api/events');
  source.addEventListener('board-changed', onChange);
  return () => source.close();
}
