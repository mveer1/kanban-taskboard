/**
 * THE DATA MODEL.
 *
 * This file mirrors data/schema.json exactly. If you change a shape here,
 * change it there too — the server validates every write against the schema.
 *
 * Hierarchy: Project (top) -> Story (multi-day) -> Task (daily).
 */

/** The four board columns. Order is defined in src/config/columns.ts. */
export type Status = 'new' | 'active' | 'hold' | 'done';

export type Priority = 'high' | 'medium' | 'low';

/** Story-to-story relationship. Inverse labels live in src/config/links.ts. */
export type LinkType = 'blocks' | 'related' | 'duplicate-of' | 'precedes';

/** ISO date, `YYYY-MM-DD`. Null means "not set". */
export type IsoDate = string | null;

/** How a column renders its story cards. */
export type Density = 'compact' | 'normal';

export interface Note {
  date: string;
  text: string;
}

export interface StoryLink {
  type: LinkType;
  /** Always a story id, e.g. "S-4". */
  target: string;
}

/** Top layer: a project, team, or life area. */
export interface Project {
  id: string; // p-<slug>
  label: string;
  color: string; // #rrggbb pastel
  description?: string | null;
}

/**
 * Tag registry entry, keyed by `label`.
 *
 * Stories and tasks reference tags by label string, not by id. The registry
 * exists to give a tag a color and description. A label used on an item but
 * missing from the registry still works — it renders neutral grey. Renaming a
 * registry entry propagates to all references (see `renameTag` in BoardContext).
 */
export interface TagDef {
  label: string;
  color: string; // #rrggbb pastel
  description?: string | null;
}

/** Middle layer: a multi-day unit of work. Renders as a board card. */
export interface Story {
  id: string; // S-<n>
  title: string;
  description?: string | null;
  status: Status;
  project: string; // -> Project.id
  priority: Priority;
  due?: IsoDate;
  estimate?: number | null;
  tags?: string[];
  /** Outgoing links only. Inverse direction is derived — see selectors.ts. */
  links?: StoryLink[];
  notes?: Note[];
  created?: IsoDate;
  completedAt?: IsoDate;
}

/** Bottom layer: a daily item, always owned by exactly one story. */
export interface Task {
  id: string; // T-<n>
  storyId: string; // -> Story.id
  title: string;
  description?: string | null;
  status: Status;
  priority: Priority;
  due?: IsoDate;
  estimate?: number | null;
  tags?: string[];
  notes?: Note[];
  created?: IsoDate;
  completedAt?: IsoDate;
}

export interface BoardMeta {
  version: number;
  updated?: string;
  idPrefixes?: Record<string, string>;
}

/** The whole contents of data/board.json. */
export interface Board {
  meta: BoardMeta;
  projects: Project[];
  /** Tag registry. Optional in the file; normalized to [] on load. */
  tags: TagDef[];
  stories: Story[];
  tasks: Task[];
}

/* ------------------------------------------------------------------ *
 * Settings — the whole contents of data/settings.json
 * ------------------------------------------------------------------ */

export interface Profile {
  name: string;
  email: string;
  initials: string;
  avatarColor: string;
}

export interface Settings {
  profile: Profile;
  board: {
    /** Per-column card density. This is the feature that drives card views. */
    density: Record<Status, Density>;
    autoExpandActive: boolean;
    showStats: boolean;
    showGraph: boolean;
  };
  appearance: {
    theme: 'dark' | 'light' | 'system';
    accent: string;
    radiusScale: 'sharp' | 'soft' | 'round';
  };
  data: {
    backupRetention: number;
    autosaveDelayMs: number;
  };
  shortcuts: { enabled: boolean };
  /**
   * Which destructive actions still ask first. Set to `false` by the
   * "don't ask again" checkbox in the confirmation dialog, and re-enabled from
   * Settings → Confirmations.
   *
   * Per action rather than one global flag: silencing task deletion should not
   * also silence story deletion, which cascades to tasks and links.
   */
  confirmations: {
    deleteStory: boolean;
    deleteTask: boolean;
  };
}

/* ------------------------------------------------------------------ *
 * View-layer types (not persisted)
 * ------------------------------------------------------------------ */

/** Active filter selections in the UI. Empty set = no filter on that facet. */
export interface Filters {
  projects: string[];
  priorities: Priority[];
  tags: string[];
  search: string;
}

/** A link rendered on a card, in either direction. */
export interface ResolvedLink {
  type: LinkType;
  /** The other story's id. */
  otherId: string;
  /** 'out' = this story declares it; 'in' = derived from the other story. */
  direction: 'out' | 'in';
  /** Label to display, already flipped for inbound links. */
  label: string;
}
