import type { Priority, Project, Status } from '@/types/board';
import { dueLabel, dueState, tagColor } from '@/store/selectors';
import { useBoard } from '@/store/BoardContext';
import './Badges.css';

/** Pastel project tag. */
export function ProjectTag({ project, compact }: { project?: Project; compact?: boolean }) {
  if (!project) return null;
  return (
    <span
      className="tag"
      style={{ background: project.color }}
      title={project.description ?? project.label}
    >
      {compact ? project.label.slice(0, 2).toUpperCase() : project.label}
    </span>
  );
}

/** Thin vertical color bar on the left of a compact card. */
export function ProjectBar({ project }: { project?: Project }) {
  return (
    <span
      className="project-bar"
      style={{ background: project?.color ?? 'var(--border)' }}
      title={project?.label}
    />
  );
}

export function PriorityChip({ priority }: { priority: Priority }) {
  return <span className={`prio ${priority}`}>{priority}</span>;
}

/** Priority as a bare dot, for dense layouts. */
export function PriorityDot({ priority }: { priority: Priority }) {
  return <span className={`prio-dot ${priority}`} title={`${priority} priority`} />;
}

export function DueChip({ due, status }: { due?: string | null; status: Status }) {
  if (!due) return null;
  return <span className={`due ${dueState(due, status)}`}>{dueLabel(due, status)}</span>;
}

/**
 * One tag. Colored from the registry when the label is registered, neutral grey
 * when it is not — that visual difference is how you spot an unregistered label.
 */
export function Tag({ label }: { label: string }) {
  const { board } = useBoard();
  const color = tagColor(board, label);

  if (!color) {
    return (
      <span className="tag-soft" title={`${label} — not in the tag registry`}>
        {label}
      </span>
    );
  }

  return (
    <span
      className="tag-chip"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
        background: `color-mix(in srgb, ${color} 13%, transparent)`,
      }}
      title={board.tags.find((t) => t.label === label)?.description ?? label}
    >
      {label}
    </span>
  );
}

export function TagList({ tags, max }: { tags?: string[]; max?: number }) {
  if (!tags?.length) return null;
  const shown = max ? tags.slice(0, max) : tags;
  const rest = max ? tags.length - shown.length : 0;
  return (
    <>
      {shown.map((t) => (
        <Tag key={t} label={t} />
      ))}
      {rest > 0 ? <span className="tag-soft">+{rest}</span> : null}
    </>
  );
}

export function EstimateChip({ estimate }: { estimate?: number | null }) {
  if (!estimate) return null;
  return <span className="tag-soft">{estimate} pts</span>;
}

/** Blocked indicator. */
export function BlockedBadge({ blockers }: { blockers: string[] }) {
  if (!blockers.length) return null;
  return (
    <span className="blocked-badge" title={`Blocked by ${blockers.join(', ')}`}>
      ⚠ Blocked by {blockers.join(', ')}
    </span>
  );
}
