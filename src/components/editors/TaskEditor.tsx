import { useState } from 'react';
import type { Note, Priority, Status, Task } from '@/types/board';
import { COLUMNS, PRIORITIES } from '@/config/columns';
import { findTask, nextId, today, withStatus } from '@/store/selectors';
import { useBoard, useBoardStore } from '@/store/BoardContext';
import { useUi } from '@/store/UiContext';
import { useToast } from '@/components/ui/Toast';
import { Field, FieldRow, Modal } from '@/components/ui/Modal';
import { TagPicker } from '@/components/ui/TagPicker';
import { NotesEditor } from './NotesEditor';

/** Create or edit a task. Mounted only while `ui.taskEditor` is set. */
export function TaskEditor() {
  const { board } = useBoard();
  const { createTask, updateTask } = useBoardStore();
  const ui = useUi();
  const notify = useToast();

  const target = ui.taskEditor!;
  const existing = target.taskId ? findTask(board, target.taskId) : undefined;
  const isNew = !existing;

  const [draft, setDraft] = useState<Task>(
    existing ?? {
      id: nextId('T-', board.tasks),
      storyId: target.storyId ?? board.stories[0]?.id ?? '',
      title: '',
      description: null,
      status: 'new',
      priority: 'medium',
      due: null,
      estimate: null,
      tags: [],
      notes: [],
      created: today(),
      completedAt: null,
    },
  );

  const set = <K extends keyof Task>(key: K, value: Task[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = () => {
    if (!draft.title.trim()) {
      notify('Title is required', 'error');
      return;
    }
    if (!draft.storyId) {
      notify('A task must belong to a story', 'error');
      return;
    }

    const payload = withStatus({ ...draft, title: draft.title.trim() }, draft.status);

    if (isNew) {
      createTask(payload);
      notify(`${payload.id} created`);
    } else {
      updateTask(payload.id, payload);
      notify(`${payload.id} saved`);
    }
    ui.toggleExpanded(payload.storyId);
    ui.closeTaskEditor();
  };

  return (
    <Modal
      open
      onClose={ui.closeTaskEditor}
      title={
        <>
          {isNew ? 'New task' : 'Edit task'}
          <span className="sid">{draft.id}</span>
        </>
      }
      subtitle="A task is a single day's work inside a story."
      footer={
        <>
          <button className="primary" onClick={save}>
            {isNew ? 'Create task' : 'Save changes'}
          </button>
          <span className="spacer" />
          <button className="ghost" onClick={ui.closeTaskEditor}>
            Cancel
          </button>
        </>
      }
    >
      <Field label="Parent story" hint="Change this to move the task to another story.">
        <select value={draft.storyId} onChange={(e) => set('storyId', e.target.value)}>
          {board.stories.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} · {s.title.slice(0, 50)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Title">
        <input
          type="text"
          autoFocus
          value={draft.title}
          placeholder="What is the concrete next action?"
          onChange={(e) => set('title', e.target.value)}
        />
      </Field>

      <Field label="Description">
        <textarea
          value={draft.description ?? ''}
          placeholder="Optional detail"
          onChange={(e) => set('description', e.target.value || null)}
        />
      </Field>

      <FieldRow cols={2}>
        <Field label="Status">
          <select value={draft.status} onChange={(e) => set('status', e.target.value as Status)}>
            {COLUMNS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Priority">
          <select
            value={draft.priority}
            onChange={(e) => set('priority', e.target.value as Priority)}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
      </FieldRow>

      <FieldRow cols={2}>
        <Field label="Due date">
          <input
            type="date"
            value={draft.due ?? ''}
            onChange={(e) => set('due', e.target.value || null)}
          />
        </Field>

        <Field label="Estimate (pts)">
          <input
            type="number"
            min={0}
            value={draft.estimate ?? ''}
            onChange={(e) => set('estimate', e.target.value === '' ? null : Number(e.target.value))}
          />
        </Field>
      </FieldRow>

      <Field label="Tags">
        <TagPicker value={draft.tags ?? []} onChange={(tags) => set('tags', tags)} />
      </Field>

      <Field label="Notes / activity">
        <NotesEditor notes={draft.notes ?? []} onChange={(notes: Note[]) => set('notes', notes)} />
      </Field>
    </Modal>
  );
}
