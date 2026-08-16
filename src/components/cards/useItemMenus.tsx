import { useCallback } from 'react';
import type { Story, Task } from '@/types/board';
import { COLUMNS } from '@/config/columns';
import { tasksOfStory } from '@/store/selectors';
import { useBoard, useBoardStore } from '@/store/BoardContext';
import { useUi } from '@/store/UiContext';
import { useConfirm } from '@/components/ui/Confirm';
import { useContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';
import { useToast } from '@/components/ui/Toast';

/**
 * Right-click menus for stories and tasks.
 *
 * Built here rather than in each card so the compact tile, the normal card, and
 * the detail modal all offer the same actions in the same order — a menu whose
 * contents depend on which of three views you happened to right-click would be
 * worse than no menu.
 */

/** Best-effort clipboard write. Fails on http:// origins and older browsers. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function useStoryMenu() {
  const { board } = useBoard();
  const { deleteStory, duplicateStory, moveStory, canEdit } = useBoardStore();
  const ui = useUi();
  const confirm = useConfirm();
  const showMenu = useContextMenu();
  const notify = useToast();

  /** Confirm-then-delete, shared with the card and modal delete buttons. */
  const requestDeleteStory = useCallback(
    async (story: Story) => {
      const count = tasksOfStory(board, story.id).length;
      const ok = await confirm({
        title: `Delete ${story.id}?`,
        message: (
          <>
            <strong>{story.title}</strong> will be deleted
            {count > 0 ? (
              <>
                {' '}along with its {count} task{count > 1 ? 's' : ''}
              </>
            ) : null}
            . Any links pointing at it are removed too. This cannot be undone, but the
            previous version is snapshotted and can be restored from Settings → Data.
          </>
        ),
        remember: 'deleteStory',
      });
      if (ok) {
        ui.closeDetail();
        deleteStory(story.id);
        notify(`${story.id} deleted`);
      }
    },
    [board, confirm, deleteStory, ui, notify],
  );

  const openStoryMenu = useCallback(
    (event: React.MouseEvent, story: Story) => {
      const tasks = tasksOfStory(board, story.id);

      const items: ContextMenuItem[] = [
        { label: 'Open details', onSelect: () => ui.openDetail(story.id) },
        {
          label: 'Edit story…',
          onSelect: () => ui.openStoryEditor({ storyId: story.id }),
          disabled: !canEdit,
        },
        {
          label: 'Add task',
          onSelect: () => ui.openTaskEditor({ storyId: story.id }),
          disabled: !canEdit,
        },
        {
          label: 'Duplicate',
          hint: tasks.length > 0 ? `+${tasks.length} tasks` : undefined,
          separatorBefore: true,
          disabled: !canEdit,
          onSelect: () => {
            const newId = duplicateStory(story.id);
            if (newId) notify(`Copied to ${newId}`);
          },
        },

        // Move targets, current column omitted — an option that does nothing is
        // just something to read past.
        ...COLUMNS.filter((c) => c.id !== story.status).map((c, i) => ({
          label: `Move to ${c.title}`,
          separatorBefore: i === 0,
          disabled: !canEdit,
          onSelect: () => moveStory(story.id, c.id),
        })),

        {
          label: 'Copy id',
          hint: story.id,
          separatorBefore: true,
          onSelect: () => {
            void copyText(story.id).then((ok) =>
              notify(ok ? `Copied ${story.id}` : 'Clipboard unavailable', ok ? 'info' : 'error'),
            );
          },
        },
        {
          label: 'Delete story',
          danger: true,
          separatorBefore: true,
          disabled: !canEdit,
          onSelect: () => void requestDeleteStory(story),
        },
      ];

      showMenu(event, items);
    },
    [board, canEdit, duplicateStory, moveStory, notify, requestDeleteStory, showMenu, ui],
  );

  return { openStoryMenu, requestDeleteStory };
}

export function useTaskMenu() {
  const { advanceTask, deleteTask, duplicateTask, canEdit } = useBoardStore();
  const ui = useUi();
  const confirm = useConfirm();
  const showMenu = useContextMenu();
  const notify = useToast();

  const requestDeleteTask = useCallback(
    async (task: Task) => {
      const ok = await confirm({
        title: `Delete ${task.id}?`,
        message: (
          <>
            <strong>{task.title}</strong> will be deleted. This cannot be undone.
          </>
        ),
        remember: 'deleteTask',
      });
      if (ok) {
        deleteTask(task.id);
        notify(`${task.id} deleted`);
      }
    },
    [confirm, deleteTask, notify],
  );

  const openTaskMenu = useCallback(
    (event: React.MouseEvent, task: Task) => {
      const items: ContextMenuItem[] = [
        {
          label: 'Edit task…',
          onSelect: () => ui.openTaskEditor({ taskId: task.id, storyId: task.storyId }),
          disabled: !canEdit,
        },
        {
          label: 'Duplicate',
          disabled: !canEdit,
          onSelect: () => {
            const newId = duplicateTask(task.id);
            if (newId) notify(`Copied to ${newId}`);
          },
        },

        ...COLUMNS.filter((c) => c.id !== task.status).map((c, i) => ({
          label: `Mark ${c.title}`,
          separatorBefore: i === 0,
          disabled: !canEdit,
          onSelect: () => advanceTask(task.id, c.id),
        })),

        {
          label: 'Copy id',
          hint: task.id,
          separatorBefore: true,
          onSelect: () => {
            void copyText(task.id).then((ok) =>
              notify(ok ? `Copied ${task.id}` : 'Clipboard unavailable', ok ? 'info' : 'error'),
            );
          },
        },
        {
          label: 'Delete task',
          danger: true,
          separatorBefore: true,
          disabled: !canEdit,
          onSelect: () => void requestDeleteTask(task),
        },
      ];

      showMenu(event, items);
    },
    [advanceTask, canEdit, duplicateTask, notify, requestDeleteTask, showMenu, ui],
  );

  return { openTaskMenu, requestDeleteTask };
}
