import { useEffect, useRef, useState } from 'react';
import './CommandPalette.css';

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette({
  open,
  actions,
  onClose,
}: {
  open: boolean;
  actions: PaletteAction[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const visible = actions.filter((action) =>
    action.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  if (!open) return null;

  const execute = (action: PaletteAction | undefined) => {
    if (!action) return;
    action.run();
    onClose();
  };

  return (
    <div className="palette-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Search commands…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setSelected((index) => Math.min(index + 1, visible.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setSelected((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              execute(visible[selected]);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
        />
        <div className="palette-list">
          {visible.length > 0 ? visible.map((action, index) => (
            <button
              key={action.id}
              className={`palette-action${selected === index ? ' on' : ''}`}
              onMouseEnter={() => setSelected(index)}
              onClick={() => execute(action)}
            >
              <span>{action.label}</span>
              {action.hint ? <span className="palette-hint">{action.hint}</span> : null}
            </button>
          )) : <div className="palette-empty">No matching commands</div>}
        </div>
      </div>
    </div>
  );
}
