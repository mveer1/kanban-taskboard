import type { Task } from '@/types/board';
import { priorityRank } from '@/store/selectors';
import { useUi } from '@/store/UiContext';
import { TaskRow } from './TaskRow';
import './TaskRow.css';

/**
 * Tasks of one story. Order: unfinished first (by priority), then done.
 * Used by both the normal card and the detail modal.
 */
export function TaskList({ tasks, storyId }: { tasks: Task[]; storyId: string }) {
  const ui = useUi();

  const sorted = [...tasks].sort((a, b) => {
    const aDone = a.status === 'done' ? 1 : 0;
    const bDone = b.status === 'done' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return priorityRank(a.priority) - priorityRank(b.priority);
  });

  return (
    <div className="task-list">
      {sorted.length === 0 ? <div className="empty">No tasks yet</div> : null}
      {sorted.map((t) => (
        <TaskRow key={t.id} task={t} />
      ))}
      <button className="add-task" onClick={() => ui.openTaskEditor({ storyId })}>
        + Add task
      </button>
    </div>
  );
}
