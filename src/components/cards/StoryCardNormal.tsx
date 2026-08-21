import type { Story } from '@/types/board';
import { LINK_BY_TYPE } from '@/config/links';
import {
  allLinks,
  blockerIds,
  dueState,
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
  const blockingInbound = links.filter(
    (link) =>
      link.direction === 'in' &&
      LINK_BY_TYPE[link.type]?.blocking &&
      findStory(board, link.otherId)?.status !== 'done',
  );
  const blockingOutbound = links.filter(
    (link) => link.direction === 'out' && LINK_BY_TYPE[link.type]?.blocking,
  );
  const secondaryLinks = links.filter((link) => !LINK_BY_TYPE[link.type]?.blocking);
  const expanded = ui.isExpanded(story.id);
  const dueStatus = dueState(story.due, story.status);

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

        {dueStatus || blockingInbound.length > 0 || blockingOutbound.length > 0 ? (
          <div className={`card-attention${dueStatus === 'over' ? ' overdue' : ''}`}>
            {dueStatus ? (
              <div className="attention-item">
                <span className="attention-label">Deadline</span>
                <DueChip due={story.due} status={story.status} />
              </div>
            ) : null}

            {blockingInbound.length > 0 ? (
              <div className="attention-item attention-links">
                <span className="attention-label">Blocked by</span>
                {blockingInbound.map((link) => {
                  const other = findStory(board, link.otherId);
                  return (
                    <button
                      className="link-target"
                      key={`blocked-by-${link.otherId}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        ui.focusStory(link.otherId);
                      }}
                    >
                      {link.otherId} · {other?.title ?? '(missing story)'}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {blockingOutbound.length > 0 ? (
              <div className="attention-item attention-links">
                <span className="attention-label">Blocks</span>
                {blockingOutbound.map((link) => {
                  const other = findStory(board, link.otherId);
                  return (
                    <button
                      className="link-target"
                      key={`blocks-${link.otherId}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        ui.focusStory(link.otherId);
                      }}
                    >
                      {link.otherId} · {other?.title ?? '(missing story)'}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {story.tags?.length || story.estimate ? (
          <div className="row wrap card-meta">
            <TagList tags={story.tags} max={3} />
            <EstimateChip estimate={story.estimate} />
          </div>
        ) : null}

        {tasks.length > 0 ? (
          <div className="card-progress">
            <ProgressBar done={progress.done} total={progress.total} accent={project?.color} />
          </div>
        ) : null}

        {secondaryLinks.length > 0 ? (
          <div className="card-links">
            {secondaryLinks.map((link) => {
              const other = findStory(board, link.otherId);
              return (
                <div className="link-row" key={`${link.direction}-${link.type}-${link.otherId}`}>
                  <span className="link-kind">{link.label}</span>
                  <button
                    className={`link-target${other?.status === 'done' ? ' done' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      ui.focusStory(link.otherId);
                    }}
                  >
                    {link.otherId}
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
          {tasks.length > 0
            ? `${tasks.length} task${tasks.length > 1 ? 's' : ''} · ${progress.done} complete`
            : '0 tasks'}
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
