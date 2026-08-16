import { useMemo, useState } from 'react';
import { PALETTE, nextSwatch } from '@/config/palette';
import { allTags, tagColor } from '@/store/selectors';
import { useBoard, useBoardStore } from '@/store/BoardContext';
import { ColorSwatchPicker } from './ColorSwatchPicker';
import './TagPicker.css';

/**
 * Multi-select tag input used by the story and task editors.
 *
 * Replaces the old "comma, separated" text field: existing tags are toggled from
 * the registry, and a new tag can be created inline with a color. Creating a tag
 * here adds it to the registry immediately so it is available everywhere.
 */
export function TagPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const { board } = useBoard();
  const { createTag } = useBoardStore();

  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newColor, setNewColor] = useState(nextSwatch(board.tags.length));

  const available = useMemo(() => allTags(board), [board]);

  const trimmed = query.trim();
  const matches = available.filter((t) => t.toLowerCase().includes(trimmed.toLowerCase()));
  const exactExists = available.some((t) => t.toLowerCase() === trimmed.toLowerCase());
  const canCreate = trimmed.length > 0 && !exactExists;

  const toggle = (label: string) =>
    onChange(value.includes(label) ? value.filter((t) => t !== label) : [...value, label]);

  const create = () => {
    if (!canCreate) return;
    createTag({ label: trimmed, color: newColor, description: null });
    onChange([...value, trimmed]);
    setQuery('');
    setCreating(false);
    setNewColor(nextSwatch(board.tags.length + 1));
  };

  return (
    <div className="tag-picker">
      {value.length > 0 ? (
        <div className="tag-picker-selected">
          {value.map((label) => {
            const color = tagColor(board, label);
            return (
              <button
                type="button"
                key={label}
                className="tag-picker-pill"
                style={
                  color
                    ? {
                        color,
                        borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
                        background: `color-mix(in srgb, ${color} 14%, transparent)`,
                      }
                    : undefined
                }
                title={`Remove ${label}`}
                onClick={() => toggle(label)}
              >
                {label}
                <span className="tag-picker-x">✕</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <input
        type="text"
        value={query}
        placeholder={value.length ? 'Add another tag…' : 'Search or create a tag…'}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (canCreate) {
            setCreating(true);
            return;
          }
          const first = matches.find((t) => !value.includes(t));
          if (first) {
            toggle(first);
            setQuery('');
          }
        }}
      />

      {creating && canCreate ? (
        <div className="tag-picker-create">
          <div className="tag-picker-create-head">
            Create <strong>{trimmed}</strong> — pick a color
          </div>
          <ColorSwatchPicker value={newColor} onChange={setNewColor} />
          <div className="row" style={{ gap: 6, marginTop: 9 }}>
            <button type="button" className="primary tiny" onClick={create}>
              Create tag
            </button>
            <button type="button" className="ghost tiny" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="tag-picker-options">
        {matches.length === 0 && !canCreate ? (
          <span className="tag-picker-none">No tags yet.</span>
        ) : null}

        {matches.map((label) => {
          const color = tagColor(board, label);
          const on = value.includes(label);
          return (
            <button
              type="button"
              key={label}
              className={`chip${on ? ' on' : ''}`}
              onClick={() => toggle(label)}
            >
              <span
                className="swatch-dot"
                style={{ background: color ?? 'var(--text-faint)' }}
              />
              {label}
            </button>
          );
        })}

        {canCreate && !creating ? (
          <button type="button" className="chip chip-create" onClick={() => setCreating(true)}>
            + Create “{trimmed}”
          </button>
        ) : null}
      </div>

      {PALETTE.length === 0 ? null : (
        <div className="field-hint">
          Enter selects the first match, or creates the tag when the name is new.
        </div>
      )}
    </div>
  );
}
