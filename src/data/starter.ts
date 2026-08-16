import type { Board, Settings } from '@/types/board';

/**
 * Seed content for a brand-new workspace.
 *
 * A workspace with no projects would make the story editor unusable, since
 * `story.project` is a required foreign key — so every new workspace starts with
 * one project and nothing else. Kept out of the Firestore adapter so the shapes
 * live next to the types they satisfy.
 */

/** Local calendar date, not UTC — see `today()` in store/selectors.ts. */
function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function starterBoard(): Board {
  return {
    meta: {
      version: 3,
      updated: todayLocal(),
      idPrefixes: { project: 'p-', story: 'S-', task: 'T-' },
    },
    projects: [
      {
        id: 'p-general',
        label: 'General',
        color: '#93c5fd',
        description: 'Default project. Rename it or add your own.',
      },
    ],
    tags: [],
    stories: [],
    tasks: [],
  };
}

/**
 * Defaults for a user who has never saved preferences. Mirrors
 * data/settings.json, with identity filled in from the auth session.
 */
export function starterSettings(profile: Settings['profile']): Settings {
  return {
    profile,
    board: {
      density: { new: 'normal', active: 'normal', hold: 'compact', done: 'compact' },
      autoExpandActive: true,
      showStats: true,
      showGraph: true,
    },
    appearance: { theme: 'dark', accent: '#e8e8ea', radiusScale: 'soft' },
    data: { backupRetention: 30, autosaveDelayMs: 600 },
    shortcuts: { enabled: true },
    confirmations: { deleteStory: true, deleteTask: true },
  };
}

/**
 * Fill in anything a stored settings object is missing.
 *
 * Unlike the board, settings are not schema-validated — they are read straight
 * from a file or a Firestore document that may predate a field. Every new group
 * therefore has to tolerate absence, and doing it in one place beats `??` at
 * every read site, where one omission means a crash on `undefined.enabled`.
 *
 * Missing values fall back to the defaults, which for confirmations means
 * "ask" — the safe direction.
 */
export function normalizeSettings(stored: unknown, profile: Settings['profile']): Settings {
  const defaults = starterSettings(profile);
  if (stored === null || typeof stored !== 'object') return defaults;

  const raw = stored as Partial<Settings>;
  return {
    profile: { ...defaults.profile, ...raw.profile },
    board: { ...defaults.board, ...raw.board },
    appearance: { ...defaults.appearance, ...raw.appearance },
    data: { ...defaults.data, ...raw.data },
    shortcuts: { ...defaults.shortcuts, ...raw.shortcuts },
    confirmations: { ...defaults.confirmations, ...raw.confirmations },
  };
}

/** Two-letter monogram from a display name or email. */
export function initialsFrom(nameOrEmail: string): string {
  const cleaned = nameOrEmail.trim();
  if (!cleaned) return '??';
  const words = cleaned.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return cleaned.slice(0, 2).toUpperCase();
}

/** Stable pastel per user, so avatars differ without asking anyone to pick. */
export function avatarColorFor(seed: string): string {
  const palette = [
    '#6ee7b7', '#93c5fd', '#fcd34d', '#c4b5fd',
    '#fca5a5', '#f9a8d4', '#a7f3d0', '#fdba74',
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}
