import { useState } from 'react';
import type { Note, Priority, Status, Story, StoryLink } from '@/types/board';
import { COLUMNS, PRIORITIES } from '@/config/columns';
import { findStory, nextId, today, withStatus } from '@/store/selectors';
import { useBoard, useBoardStore } from '@/store/BoardContext';
import { useUi } from '@/store/UiContext';
import { useToast } from '@/components/ui/Toast';
import { Field, FieldRow, Modal } from '@/components/ui/Modal';
import { TagPicker } from '@/components/ui/TagPicker';
import { NotesEditor } from './NotesEditor';
import { LinksEditor } from './LinksEditor';

/** Create or edit a story. Mounted only while `ui.storyEditor` is set. */
export function StoryEditor() {
  const { board } = useBoard();
  const { createStory, updateStory } = useBoardStore();
  const ui = useUi();
  const notify = useToast();

  const target = ui.storyEditor!;
  const existing = target.storyId ? findStory(board, target.storyId) : undefined;
  const isNew = !existing;

  const [draft, setDraft] = useState<Story>(
    existing ?? {
      id: nextId('S-', board.stories),
      title: '',
      description: null,
      // A column's + button passes its own status so the story lands in the
      // column the user clicked; the top-bar button passes none.
      status: target.status ?? 'new',
      project: board.projects[0]?.id ?? '',
      priority: 'medium',
      due: null,
      estimate: null,
      tags: [],
      links: [],
      notes: [],
      created: today(),
      // Left null even when opening straight into Done — `save` runs the draft
      // through withStatus, which stamps completedAt. Setting it here too would
      // put the invariant in two places.
      completedAt: null,
    },
  );

  const set = <K extends keyof Story>(key: K, value: Story[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = () => {
    if (!draft.title.trim()) {
      notify('Title is required', 'error');
      return;
    }
    if (!draft.project) {
      notify('Pick a project first — create one in Projects', 'error');
      return;
    }

    // withStatus keeps completedAt consistent, which the server enforces.
    const payload = withStatus({ ...draft, title: draft.title.trim() }, draft.status);

    if (isNew) {
      createStory(payload);
      ui.toggleExpanded(payload.id);
      notify(`${payload.id} created`);
    } else {
      updateStory(payload.id, payload);
      notify(`${payload.id} saved`);
    }
    ui.closeStoryEditor();
  };

  return (
    <Modal
      open
      size="lg"
      onClose={ui.closeStoryEditor}
      title={
        <>
          {isNew ? 'New story' : 'Edit story'}
          <span className="sid">{draft.id}</span>
        </>
      }
      subtitle="A story is a multi-day unit of work. Break it into tasks below."
      footer={
        <>
          <button className="primary" onClick={save}>
            {isNew ? 'Create story' : 'Save changes'}
          </button>
          {!isNew ? (
            <button
              onClick={() => {
                ui.closeStoryEditor();
                ui.openTaskEditor({ storyId: draft.id });
              }}
            >
              + Add task
            </button>
          ) : null}
          <span className="spacer" />
          <button className="ghost" onClick={ui.closeStoryEditor}>
            Cancel
          </button>
        </>
      }
    >
      <Field label="Title">
        <input
          type="text"
          autoFocus
          value={draft.title}
          placeholder="What needs to happen?"
          onChange={(e) => set('title', e.target.value)}
        />
      </Field>

      <Field label="Description">
        <textarea
          value={draft.description ?? ''}
          placeholder="Context, scope, definition of done…"
          onChange={(e) => set('description', e.target.value || null)}
        />
      </Field>

      <FieldRow cols={3}>
        <Field label="Project">
          <select value={draft.project} onChange={(e) => set('project', e.target.value)}>
            {board.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Status">
          <select
            value={draft.status}
            onChange={(e) => set('status', e.target.value as Status)}
          >
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

      <Field label="Linked stories" hint="Inverse relationships appear automatically on the other story.">
        <LinksEditor
          links={draft.links ?? []}
          selfId={draft.id}
          onChange={(links: StoryLink[]) => set('links', links)}
        />
      </Field>

      <Field label="Notes / activity">
        <NotesEditor notes={draft.notes ?? []} onChange={(notes: Note[]) => set('notes', notes)} />
      </Field>
    </Modal>
  );
}
