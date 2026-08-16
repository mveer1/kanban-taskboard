import type { Status } from '@/types/board';

/**
 * The board columns, in display order.
 *
 * To add a status: add an entry here, add it to the `Status` union in
 * src/types/board.ts, and add it to the enum in data/schema.json. Nothing
 * else in the UI hardcodes the list.
 */
export interface ColumnDef {
  id: Status;
  title: string;
  /** Pastel accent used for the column border, label, and count chip. */
  accent: string;
  /** Short description shown in Settings. */
  hint: string;
}

export const COLUMNS: ColumnDef[] = [
  { id: 'new',    title: 'New',          accent: '#93c5fd', hint: 'Captured but not started' },
  { id: 'active', title: 'Active',       accent: '#fcd34d', hint: 'In progress right now' },
  { id: 'hold',   title: 'Hold / Later', accent: '#c4b5fd', hint: 'Deliberately parked' },
  { id: 'done',   title: 'Done',         accent: '#6ee7b7', hint: 'Completed' },
];

export const STATUS_ORDER: Status[] = COLUMNS.map((c) => c.id);

/** Clicking a task's checkbox advances it through this cycle. */
export const STATUS_CYCLE: Status[] = ['new', 'active', 'hold', 'done'];

export const COLUMN_BY_ID: Record<Status, ColumnDef> = Object.fromEntries(
  COLUMNS.map((c) => [c.id, c]),
) as Record<Status, ColumnDef>;

export const PRIORITIES = ['high', 'medium', 'low'] as const;

/** Priority accent colors, used for chips and the compact-card dot. */
export const PRIORITY_COLORS: Record<string, string> = {
  high: '#f87171',
  medium: '#fbbf24',
  low: '#6ee7b7',
};
