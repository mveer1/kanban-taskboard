import { useState } from 'react';
import type { Note } from '@/types/board';
import { today } from '@/store/selectors';

/**
 * Editable notes list. Entries are timestamped on add and rendered newest-first.
 * Controlled: the parent owns the array.
 */
export function NotesEditor({
  notes,
  onChange,
}: {
  notes: Note[];
  onChange: (notes: Note[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...notes, { date: today(), text }]);
    setDraft('');
  };

  return (
    <div className="sub-panel">
      {notes.length === 0 ? (
        <div className="field-hint" style={{ marginBottom: 7 }}>
          No notes yet.
        </div>
      ) : (
        [...notes].reverse().map((n, revIndex) => {
          const index = notes.length - 1 - revIndex;
          return (
            <div className="sub-panel-item" key={`${n.date}-${index}`}>
              <div className="grow">
                <div className="sid" style={{ marginBottom: 2 }}>
                  {n.date}
                </div>
                {n.text}
              </div>
              <button
                type="button"
                className="icon"
                title="Remove note"
                onClick={() => onChange(notes.filter((_, i) => i !== index))}
              >
                ✕
              </button>
            </div>
          );
        })
      )}

      <div className="sub-panel-add">
        <textarea
          value={draft}
          placeholder="Add a note…"
          style={{ minHeight: 46 }}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="tiny" onClick={add} disabled={!draft.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}
