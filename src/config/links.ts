import type { LinkType } from '@/types/board';

/**
 * Story-to-story relationship types.
 *
 * Only the outgoing direction is stored on a story (`story.links`). The
 * inverse is derived at read time so you never enter a relationship twice —
 * see `inboundLinks()` in src/store/selectors.ts.
 *
 * `blocking: true` means an unfinished source story blocks its target.
 */
export interface LinkDef {
  type: LinkType;
  /** Label shown on the story that declares the link. */
  label: string;
  /** Label shown on the story on the receiving end. */
  inverse: string;
  /** Edge color in the dependency graph. */
  color: string;
  /** Whether this relationship gates the target story. */
  blocking: boolean;
}

export const LINK_TYPES: LinkDef[] = [
  { type: 'blocks',       label: 'Blocks',       inverse: 'Blocked by',    color: '#f87171', blocking: true },
  { type: 'precedes',     label: 'Precedes',     inverse: 'Follows',       color: '#fbbf24', blocking: true },
  { type: 'duplicate-of', label: 'Duplicate of', inverse: 'Duplicated by', color: '#c4b5fd', blocking: false },
  { type: 'related',      label: 'Related to',   inverse: 'Related to',    color: '#6b7280', blocking: false },
];

export const LINK_BY_TYPE: Record<LinkType, LinkDef> = Object.fromEntries(
  LINK_TYPES.map((l) => [l.type, l]),
) as Record<LinkType, LinkDef>;
