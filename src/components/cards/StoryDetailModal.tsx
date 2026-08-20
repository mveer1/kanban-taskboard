import type { Story } from '@/types/board';
import { COLUMN_BY_ID } from '@/config/columns';
import { LINK_BY_TYPE } from '@/config/links';
import {
  allLinks,
  blockerIds,
  dueLabel,
  dueState,
  findProject,
  findStory,
  storyProgress,
  tasksOfStory,
} from '@/store/selectors';
import { useBoard, useBoardStore } from '@/store/BoardContext';
import { useUi } from '@/store/UiContext';
import { useSticky } from '@/hooks/useSticky';
import { useStoryMenu } from './useItemMenus';
import { Modal } from '@/components/ui/Modal';
import { PriorityChip, ProjectTag, TagList } from '@/components/ui/Badges';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { TaskList } from '@/components/tasks/TaskList';
import './StoryDetailModal.css';

/**
 * VIEW 3 of 3 — detail modal.
 *
 * The full record for one story: every field, the complete task list with
 * inline status editing, relationships in both directions, and the notes
 * timeline. Opened by clicking any card.
 */
export function StoryDetailModal() {
  const { board } = useBoard();
  const ui = useUi();
  const { moveStory, canEdit } = useBoardStore();
  const { requestDeleteStory } = useStoryMenu();

  // Sticky so the record survives the exit animation, after the id is cleared.
  const story = useSticky(ui.detailStoryId ? findStory(board, ui.detailStoryId) : undefined);
  if (!story) return null;

  const project = findProject(board, story.project);
  const tasks = tasksOfStory(board, story.id);
  const progress = storyProgress(board, story.id);
  const blockers = story.status === 'done' ? [] : blockerIds(board, story.id);
  const links = allLinks(board, story);
  const notes = [...(story.notes ?? [])].reverse();

  return (
    <Modal
      open
      size="lg"
      onClose={ui.closeDetail}
      onSubmit={ui.closeDetail}
      title={
        <>
          <span className="sid">{story.id}</span>
          {story.title}
        </>
      }
      subtitle={
        <span className="row wrap" style={{ gap: 6 }}>
          <ProjectTag project={project} />
          <PriorityChip priority={story.priority} />
          <span className={`status-pill ${story.status}`}>{COLUMN_BY_ID[story.status].title}</span>
          {blockers.length > 0 ? (
            <span className="detail-blocked">⚠ Blocked by {blockers.join(', ')}</span>
          ) : null}
        </span>
      }
      footer={
        <>
          <button
            className="primary"
            disabled={!canEdit}
            onClick={() => {
              ui.closeDetail();
              ui.openStoryEditor({ storyId: story.id });
            }}
          >
            Edit story
          </button>
          <button disabled={!canEdit} onClick={() => ui.openTaskEditor({ storyId: story.id })}>
            + Add task
          </button>

          <span className="spacer" />

          <select
            value={story.status}
            aria-label="Move to column"
            disabled={!canEdit}
            style={{ width: 140 }}
            onChange={(e) => moveStory(story.id, e.target.value as Story['status'])}
          >
            {Object.values(COLUMN_BY_ID).map((c) => (
              <option key={c.id} value={c.id}>
                Move to {c.title}
              </option>
            ))}
          </select>

          <button
            className="danger"
            disabled={!canEdit}
            onClick={() => void requestDeleteStory(story)}
          >
            Delete
          </button>
        </>
      }
    >
      {story.description ? <p className="detail-desc">{story.description}</p> : null}

      {/* ---- field grid ---- */}
      <dl className="detail-fields">
        <div>
          <dt className="label">Due</dt>
          <dd className={`due ${dueState(story.due, story.status)}`}>
            {story.due ? dueLabel(story.due, story.status) : '—'}
          </dd>
        </div>
        <div>
          <dt className="label">Estimate</dt>
          <dd>{story.estimate ? `${story.estimate} pts` : '—'}</dd>
        </div>
        <div>
          <dt className="label">Created</dt>
          <dd className="mono">{story.created ?? '—'}</dd>
        </div>
        <div>
          <dt className="label">Completed</dt>
          <dd className="mono">{story.completedAt ?? '—'}</dd>
        </div>
      </dl>

      {story.tags?.length ? (
        <section className="detail-section">
          <h3 className="label">Tags</h3>
          <div className="row wrap">
            <TagList tags={story.tags} />
          </div>
        </section>
      ) : null}

      {/* ---- tasks ---- */}
      <section className="detail-section">
        <h3 className="label">
          Tasks{' '}
          <span className="mono detail-count">
            {progress.done}/{progress.total}
          </span>
        </h3>
        {tasks.length > 0 ? (
          <div className="detail-progress">
            <ProgressBar
              done={progress.done}
              total={progress.total}
              accent={project?.color}
              showLabel={false}
            />
          </div>
        ) : null}
        <TaskList tasks={tasks} storyId={story.id} />
      </section>

      {/* ---- relationships ---- */}
      <section className="detail-section">
        <h3 className="label">Relationships</h3>
        {links.length === 0 ? (
          <div className="detail-muted">No linked stories.</div>
        ) : (
          <div className="detail-links">
            {links.map((l) => {
              const other = findStory(board, l.otherId);
              const gating =
                l.direction === 'in' &&
                LINK_BY_TYPE[l.type]?.blocking &&
                other?.status !== 'done';
              return (
                <button
                  key={`${l.direction}-${l.type}-${l.otherId}`}
                  className="detail-link"
                  onClick={() => ui.focusStory(l.otherId)}
                >
                  <span
                    className="detail-link-dot"
                    style={{ background: LINK_BY_TYPE[l.type]?.color }}
                  />
                  <span className="detail-link-kind">{l.label}</span>
                  <span className="sid">{l.otherId}</span>
                  <span className="detail-link-title">{other?.title ?? '(missing story)'}</span>
                  {other ? (
                    <span className={`status-pill sm ${other.status}`}>
                      {COLUMN_BY_ID[other.status].title}
                    </span>
                  ) : null}
                  {gating ? <span className="detail-link-warn">blocking</span> : null}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- notes ---- */}
      <section className="detail-section">
        <h3 className="label">Notes</h3>
        {notes.length === 0 ? (
          <div className="detail-muted">No notes yet. Add them from the story editor.</div>
        ) : (
          <ol className="detail-notes">
            {notes.map((n, i) => (
              <li key={`${n.date}-${i}`}>
                <span className="detail-note-date mono">{n.date}</span>
                <span className="detail-note-text">{n.text}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </Modal>
  );
}
