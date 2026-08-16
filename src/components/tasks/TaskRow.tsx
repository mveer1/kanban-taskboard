import type { Status, Task } from '@/types/board';
import { STATUS_CYCLE, COLUMN_BY_ID } from '@/config/columns';
import { useBoardStore } from '@/store/BoardContext';
import { useUi } from '@/store/UiContext';
import { useTaskMenu } from '@/components/cards/useItemMenus';
import { DueChip, EstimateChip, PriorityChip, TagList } from '@/components/ui/Badges';
import './TaskRow.css';

/** Checkbox that advances through new -> active -> hold -> done. */
function StatusToggle({ status, onAdvance }: { status: Status; onAdvance: (s: Status) => void }) {
  const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(status) + 1) % STATUS_CYCLE.length];
  return (
    <button
      className={`status-toggle ${status}`}
      title={`${COLUMN_BY_ID[status].title} — click for ${COLUMN_BY_ID[next].title}`}
      aria-label={`Status: ${status}`}
      onClick={(e) => {
        e.stopPropagation();
        onAdvance(next);
      }}
    />
  );
}

export function TaskRow({ task }: { task: Task }) {
  const { advanceTask, canEdit } = useBoardStore();
  const ui = useUi();
  const { openTaskMenu, requestDeleteTask } = useTaskMenu();
  const noteCount = task.notes?.length ?? 0;

  return (
    <div
      className={`task-row${task.status === 'done' ? ' done' : ''}`}
      // Stops at the row, so right-clicking a task does not also open the
      // parent story card's menu — see `show` in ContextMenu.tsx.
      onContextMenu={(e) => openTaskMenu(e, task)}
    >
      <StatusToggle status={task.status} onAdvance={(s) => advanceTask(task.id, s)} />

      <div className="task-main">
        <div className="task-title">{task.title}</div>
        {task.description ? <div className="task-desc">{task.description}</div> : null}

        <div className="row wrap task-meta">
          <span className="sid">{task.id}</span>
          <PriorityChip priority={task.priority} />
          <TagList tags={task.tags} max={2} />
          <EstimateChip estimate={task.estimate} />
          <DueChip due={task.due} status={task.status} />
          {noteCount > 0 ? (
            <span className="tag-soft">
              {noteCount} note{noteCount > 1 ? 's' : ''}
            </span>
          ) : null}
        </div>
      </div>

      {canEdit ? (
        <>
          <button
            className="icon"
            title="Edit task"
            onClick={() => ui.openTaskEditor({ taskId: task.id, storyId: task.storyId })}
          >
            ✎
          </button>
          <button
            className="icon"
            title="Delete task"
            onClick={() => void requestDeleteTask(task)}
          >
            ✕
          </button>
        </>
      ) : null}
    </div>
  );
}
