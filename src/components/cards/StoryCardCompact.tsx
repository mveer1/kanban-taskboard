import type { Story } from '@/types/board';
import {
  blockerIds,
  dueState,
  findProject,
  storyProgress,
  tasksOfStory,
} from '@/store/selectors';
import { useBoard } from '@/store/BoardContext';
import { useUi } from '@/store/UiContext';
import { useStoryMenu } from './useItemMenus';
import { DueChip, PriorityDot, ProjectBar } from '@/components/ui/Badges';
import { ProgressBar } from '@/components/ui/ProgressBar';
import './StoryCard.css';

/**
 * VIEW 1 of 3 — compact tile.
 *
 * Dense single-glance summary: project color bar, id, one-line title, priority
 * dot, task count, and a thin progress bar. Click opens the detail modal;
 * right-click opens the same action menu the other two views use.
 */
export function StoryCardCompact({ story }: { story: Story }) {
  const { board } = useBoard();
  const ui = useUi();
  const { openStoryMenu } = useStoryMenu();

  const project = findProject(board, story.project);
  const progress = storyProgress(board, story.id);
  const blocked = story.status !== 'done' && blockerIds(board, story.id).length > 0;
  const taskCount = tasksOfStory(board, story.id).length;
  const dueStatus = dueState(story.due, story.status);

  return (
    <article
      className={`story-card compact${blocked ? ' blocked' : ''}`}
      data-story-id={story.id}
      data-drag-handle
      onClick={() => ui.openDetail(story.id)}
      onContextMenu={(e) => openStoryMenu(e, story)}
      title={story.title}
    >
      <div className="compact-top">
        <ProjectBar project={project} />
        <span className="sid">{story.id}</span>
        <PriorityDot priority={story.priority} />
        <h3 className="compact-title">{story.title}</h3>
      </div>

      <div className="compact-meta">
        {taskCount > 0 ? (
          <span className="compact-tasks">
            {progress.done}/{progress.total} tasks
          </span>
        ) : (
          <span className="compact-tasks">0 tasks</span>
        )}
        {taskCount > 0 ? (
          <ProgressBar
            done={progress.done}
            total={progress.total}
            accent={project?.color}
          />
        ) : null}
        <DueChip due={story.due} status={story.status} />
        {blocked ? <span className="compact-block" title="Blocked">Blocked</span> : null}
        {dueStatus === 'over' ? <span className="compact-overdue">Overdue</span> : null}
      </div>
    </article>
  );
}
