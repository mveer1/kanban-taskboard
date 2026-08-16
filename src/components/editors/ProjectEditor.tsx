import { useState } from 'react';
import type { Project } from '@/types/board';
import { nextSwatch } from '@/config/palette';
import { useBoard, useBoardStore } from '@/store/BoardContext';
import { useUi } from '@/store/UiContext';
import { useToast } from '@/components/ui/Toast';
import { Field, Modal } from '@/components/ui/Modal';
import { ColorSwatchPicker, ColorDot } from '@/components/ui/ColorSwatchPicker';
import './ProjectEditor.css';

/** Slug a label into a stable project id: "Data Platform" -> "p-data-platform". */
function toProjectId(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `p-${slug || 'project'}`;
}

/**
 * Manage the top layer of the hierarchy. Colors are chosen from real swatches —
 * the user never types a hex value.
 */
export function ProjectEditor() {
  const { board } = useBoard();
  const { createProject, updateProject, deleteProject } = useBoardStore();
  const ui = useUi();
  const notify = useToast();

  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(nextSwatch(board.projects.length));
  const [editingId, setEditingId] = useState<string | null>(null);

  const storyCount = (id: string) => board.stories.filter((s) => s.project === id).length;

  const add = () => {
    const label = newLabel.trim();
    if (!label) return;

    const id = toProjectId(label);
    if (board.projects.some((p) => p.id === id)) {
      notify(`A project named "${label}" already exists`, 'error');
      return;
    }

    createProject({ id, label, color: newColor, description: null });
    setNewLabel('');
    setNewColor(nextSwatch(board.projects.length + 1));
    notify(`${label} added`);
  };

  const remove = (project: Project) => {
    const n = storyCount(project.id);
    if (n > 0) {
      notify(`${project.label} still has ${n} story(ies) — reassign them first`, 'error');
      return;
    }
    deleteProject(project.id);
    notify(`${project.label} removed`);
  };

  return (
    <Modal
      open
      onClose={() => ui.setProjectEditorOpen(false)}
      title="Projects"
      subtitle="The top layer — projects, teams, or life areas."
      footer={
        <>
          <span className="spacer" />
          <button className="primary" onClick={() => ui.setProjectEditorOpen(false)}>
            Done
          </button>
        </>
      }
    >
      <div className="project-rows">
        {board.projects.map((p) => {
          const n = storyCount(p.id);
          const isEditing = editingId === p.id;

          return (
            <div className={`project-row${isEditing ? ' editing' : ''}`} key={p.id}>
              <div className="project-row-main">
                <ColorDot color={p.color} size={16} />

                <input
                  type="text"
                  value={p.label}
                  aria-label={`${p.label} name`}
                  onChange={(e) => updateProject(p.id, { label: e.target.value })}
                />

                <span className="project-count">
                  {n} {n === 1 ? 'story' : 'stories'}
                </span>

                <button
                  className="icon"
                  title={isEditing ? 'Close color picker' : 'Change color'}
                  onClick={() => setEditingId(isEditing ? null : p.id)}
                >
                  {isEditing ? '▴' : '▾'}
                </button>

                <button
                  className="icon"
                  title={n > 0 ? 'Reassign its stories first' : 'Delete project'}
                  onClick={() => remove(p)}
                >
                  ✕
                </button>
              </div>

              {isEditing ? (
                <div className="project-row-colors">
                  <ColorSwatchPicker
                    value={p.color}
                    onChange={(color) => updateProject(p.id, { color })}
                  />
                  <input
                    type="text"
                    className="project-desc-input"
                    placeholder="Short description (optional)"
                    value={p.description ?? ''}
                    onChange={(e) => updateProject(p.id, { description: e.target.value || null })}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="project-new">
        <Field label="New project">
          <input
            type="text"
            value={newLabel}
            placeholder="Project name"
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
            }}
          />
        </Field>

        <Field label="Color">
          <ColorSwatchPicker value={newColor} onChange={setNewColor} />
        </Field>

        <button className="primary" onClick={add} disabled={!newLabel.trim()}>
          Add project
        </button>
      </div>
    </Modal>
  );
}
