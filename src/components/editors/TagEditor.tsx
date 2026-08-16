import { useState } from 'react';
import type { TagDef } from '@/types/board';
import { nextSwatch } from '@/config/palette';
import { tagUsage, unregisteredTags } from '@/store/selectors';
import { useBoard, useBoardStore } from '@/store/BoardContext';
import { useUi } from '@/store/UiContext';
import { useToast } from '@/components/ui/Toast';
import { Field, Modal } from '@/components/ui/Modal';
import { ColorSwatchPicker, ColorDot } from '@/components/ui/ColorSwatchPicker';
import './ProjectEditor.css';

/**
 * Tag registry manager — same shape and workflow as ProjectEditor.
 *
 * Tags are keyed by label, so renaming one here rewrites every story and task
 * reference (handled by `renameTag`). Deleting strips the label from all items,
 * which is why it asks first when the tag is in use.
 */
export function TagEditor() {
  const { board } = useBoard();
  const { createTag, updateTagColor, renameTag, deleteTag, registerTag } = useBoardStore();
  const ui = useUi();
  const notify = useToast();

  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(nextSwatch(board.tags.length));
  const [expandedLabel, setExpandedLabel] = useState<string | null>(null);
  /** Local text buffer so renames commit on blur, not per keystroke. */
  const [renameDraft, setRenameDraft] = useState<Record<string, string>>({});

  const orphans = unregisteredTags(board);

  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    if (board.tags.some((t) => t.label.toLowerCase() === label.toLowerCase())) {
      notify(`Tag "${label}" already exists`, 'error');
      return;
    }
    createTag({ label, color: newColor, description: null });
    setNewLabel('');
    setNewColor(nextSwatch(board.tags.length + 1));
    notify(`${label} added`);
  };

  const commitRename = (tag: TagDef) => {
    const next = (renameDraft[tag.label] ?? tag.label).trim();
    setRenameDraft((d) => {
      const { [tag.label]: _drop, ...rest } = d;
      return rest;
    });
    if (!next || next === tag.label) return;
    if (board.tags.some((t) => t.label === next)) {
      notify(`Tag "${next}" already exists`, 'error');
      return;
    }
    const uses = tagUsage(board, tag.label);
    renameTag(tag.label, next);
    setExpandedLabel((l) => (l === tag.label ? next : l));
    notify(uses > 0 ? `Renamed to ${next} on ${uses} item(s)` : `Renamed to ${next}`);
  };

  const remove = (tag: TagDef) => {
    const uses = tagUsage(board, tag.label);
    if (uses > 0 && !confirm(`Remove "${tag.label}" from ${uses} item(s) and delete the tag?`)) {
      return;
    }
    deleteTag(tag.label);
    notify(`${tag.label} deleted`);
  };

  return (
    <Modal
      open
      onClose={() => ui.setTagEditorOpen(false)}
      title="Tags"
      subtitle="Labels shared across stories and tasks. Renaming updates every item that uses the tag."
      footer={
        <>
          <span className="spacer" />
          <button className="primary" onClick={() => ui.setTagEditorOpen(false)}>
            Done
          </button>
        </>
      }
    >
      <div className="project-rows">
        {board.tags.length === 0 ? (
          <div className="settings-hint">No tags yet. Create one below.</div>
        ) : null}

        {board.tags.map((tag) => {
          const uses = tagUsage(board, tag.label);
          const isOpen = expandedLabel === tag.label;

          return (
            <div className={`project-row${isOpen ? ' editing' : ''}`} key={tag.label}>
              <div className="project-row-main">
                <ColorDot color={tag.color} size={16} />

                <input
                  type="text"
                  aria-label={`${tag.label} name`}
                  value={renameDraft[tag.label] ?? tag.label}
                  onChange={(e) =>
                    setRenameDraft((d) => ({ ...d, [tag.label]: e.target.value }))
                  }
                  onBlur={() => commitRename(tag)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') {
                      setRenameDraft((d) => {
                        const { [tag.label]: _drop, ...rest } = d;
                        return rest;
                      });
                    }
                  }}
                />

                <span className="project-count">
                  {uses} {uses === 1 ? 'use' : 'uses'}
                </span>

                <button
                  className="icon"
                  title={isOpen ? 'Close' : 'Change color or description'}
                  onClick={() => setExpandedLabel(isOpen ? null : tag.label)}
                >
                  {isOpen ? '▴' : '▾'}
                </button>

                <button className="icon" title="Delete tag" onClick={() => remove(tag)}>
                  ✕
                </button>
              </div>

              {isOpen ? (
                <div className="project-row-colors">
                  <ColorSwatchPicker
                    value={tag.color}
                    onChange={(color) => updateTagColor(tag.label, { color })}
                  />
                  <input
                    type="text"
                    className="project-desc-input"
                    placeholder="Short description (optional)"
                    value={tag.description ?? ''}
                    onChange={(e) =>
                      updateTagColor(tag.label, { description: e.target.value || null })
                    }
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {orphans.length > 0 ? (
        <div className="tag-orphans">
          <h3 className="label">Used but unregistered ({orphans.length})</h3>
          <p className="settings-hint">
            These labels appear on items but have no color assigned. Add them to the registry:
          </p>
          <div className="row wrap" style={{ marginTop: 8 }}>
            {orphans.map((label, i) => (
              <button
                key={label}
                className="chip chip-create"
                title="Add to the registry"
                onClick={() => {
                  registerTag(label, nextSwatch(board.tags.length + i));
                  notify(`${label} registered`);
                }}
              >
                + {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="project-new">
        <Field label="New tag">
          <input
            type="text"
            value={newLabel}
            placeholder="Tag name"
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
          Add tag
        </button>
      </div>
    </Modal>
  );
}
