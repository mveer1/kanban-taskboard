import type { Story } from '@/types/board';
import { LINK_BY_TYPE } from '@/config/links';
import {
  allLinks,
  blockerIds,
  findProject,
  findStory,
  storyProgress,
  tasksOfStory,
} from '@/store/selectors';
import { useBoard, useBoardStore } from '@/store/BoardContext';
import { useUi } from '@/store/UiContext';
import { useStoryMenu } from './useItemMenus';
import {
  BlockedBadge,
  DueChip,
  EstimateChip,
  PriorityChip,
  ProjectTag,
  TagList,
} from '@/components/ui/Badges';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { TaskList } from '@/components/tasks/TaskList';
import './StoryCard.css';

/**
 * VIEW 2 of 3 — normal card.
 *
 * Full board-level detail: description, tags, estimate, due date, progress,
 * relationships, and an expandable task list. Clicking the body opens the
 * detail modal; the footer controls act without opening it. Right-click gives
 * the full action list, including duplicate and the move targets.
 */
export function StoryCardNormal({ story }: { story: Story }) {
  const { board } = useBoard();
  const { canEdit } = useBoardStore();
  const ui = useUi();
  const { openStoryMenu, requestDeleteStory } = useStoryMenu();

  const project = findProject(board, story.project);
  const progress = storyProgress(board, story.id);
  const tasks = tasksOfStory(board, story.id);
  const blockers = story.status === 'done' ? [] : blockerIds(board, story.id);
  const links = allLinks(board, story);
  const expanded = ui.isExpanded(story.id);

  return (
    <article
      className={`story-card normal${blockers.length ? ' blocked' : ''}`}
      data-story-id={story.id}
      onContextMenu={(e) => openStoryMenu(e, story)}
    >
      <div className="card-body" data-drag-handle onClick={() => ui.openDetail(story.id)}>
        <div className="row wrap card-badges">
          <span className="sid">{story.id}</span>
          <ProjectTag project={project} />
          <PriorityChip priority={story.priority} />
        </div>

        <h3 className="card-title">{story.title}</h3>

        {story.description ? <p className="card-desc">{story.description}</p> : null}

        <div className="row wrap card-meta">
          <TagList tags={story.tags} max={3} />
          <EstimateChip estimate={story.estimate} />
          <DueChip due={story.due} status={story.status} />
        </div>

        {tasks.length > 0 ? (
          <div className="card-progress">
            <ProgressBar done={progress.done} total={progress.total} accent={project?.color} />
          </div>
        ) : null}

        {links.length > 0 ? (
          <div className="card-links">
            {links.map((l) => {
              const other = findStory(board, l.otherId);
              const gating =
                l.direction === 'in' &&
                LINK_BY_TYPE[l.type]?.blocking &&
                other?.status !== 'done';
              return (
                <div className="link-row" key={`${l.direction}-${l.type}-${l.otherId}`}>
                  <span className="link-kind">{l.label}</span>
                  <button
                    className={`link-target${other?.status === 'done' ? ' done' : gating ? ' gating' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      ui.focusStory(l.otherId);
                    }}
                  >
                    {l.otherId}
                    {other ? ` · ${other.title}` : ' (missing)'}
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        {blockers.length > 0 ? (
          <div className="card-blocked">
            <BlockedBadge blockers={blockers} />
          </div>
        ) : null}
      </div>

      <footer className="card-foot">
        <button
          className="expand"
          onClick={() => ui.toggleExpanded(story.id)}
          disabled={tasks.length === 0}
        >
          <span className={`caret${expanded ? ' open' : ''}`}>▶</span>
          {tasks.length > 0 ? `${tasks.length} task${tasks.length > 1 ? 's' : ''}` : 'No tasks'}
        </button>

        <span className="spacer" />

        {canEdit ? (
          <>
            <button
              className="icon"
              title="Add task"
              onClick={() => ui.openTaskEditor({ storyId: story.id })}
            >
              +
            </button>
            <button
              className="icon"
              title="Edit story"
              onClick={() => ui.openStoryEditor({ storyId: story.id })}
            >
              ✎
            </button>
            <button
              className="icon"
              title="Delete story"
              onClick={() => void requestDeleteStory(story)}
            >
              ✕
            </button>
          </>
        ) : null}
      </footer>

      {expanded && tasks.length > 0 ? (
        <div className="card-tasks">
          <TaskList tasks={tasks} storyId={story.id} />
        </div>
      ) : null}
    </article>
  );
}
