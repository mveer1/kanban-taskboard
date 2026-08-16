import { useState } from 'react';
import type { LinkType, StoryLink } from '@/types/board';
import { LINK_BY_TYPE, LINK_TYPES } from '@/config/links';
import { findStory, inboundLinks } from '@/store/selectors';
import { useBoard } from '@/store/BoardContext';

/**
 * Editor for a story's outgoing links.
 *
 * Only outgoing links are editable here — inbound ones are derived from other
 * stories, so they are listed read-only with a pointer to where to change them.
 */
export function LinksEditor({
  links,
  selfId,
  onChange,
}: {
  links: StoryLink[];
  selfId: string;
  onChange: (links: StoryLink[]) => void;
}) {
  const { board } = useBoard();
  const [type, setType] = useState<LinkType>('blocks');
  const [target, setTarget] = useState('');

  const candidates = board.stories.filter((s) => s.id !== selfId);
  const inbound = inboundLinks(board, selfId);

  const add = () => {
    if (!target) return;
    if (links.some((l) => l.type === type && l.target === target)) return;
    onChange([...links, { type, target }]);
    setTarget('');
  };

  return (
    <div className="sub-panel">
      {links.length === 0 ? (
        <div className="field-hint" style={{ marginBottom: 7 }}>
          No outgoing links.
        </div>
      ) : (
        links.map((l, index) => {
          const other = findStory(board, l.target);
          return (
            <div className="sub-panel-item" key={`${l.type}-${l.target}`}>
              <span
                className="detail-link-dot"
                style={{ background: LINK_BY_TYPE[l.type]?.color, marginTop: 5 }}
              />
              <div className="grow">
                <span className="detail-link-kind">{LINK_BY_TYPE[l.type]?.label ?? l.type}</span>{' '}
                <span className="sid">{l.target}</span>{' '}
                {other ? other.title : <em>(missing story)</em>}
              </div>
              <button
                type="button"
                className="icon"
                title="Remove link"
                onClick={() => onChange(links.filter((_, i) => i !== index))}
              >
                ✕
              </button>
            </div>
          );
        })
      )}

      <div className="sub-panel-add">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as LinkType)}
          style={{ flex: '0 0 145px' }}
        >
          {LINK_TYPES.map((l) => (
            <option key={l.type} value={l.type}>
              {l.label}
            </option>
          ))}
        </select>

        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Select a story…</option>
          {candidates.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} · {s.title.slice(0, 46)}
            </option>
          ))}
        </select>

        <button type="button" className="tiny" onClick={add} disabled={!target}>
          Link
        </button>
      </div>

      {inbound.length > 0 ? (
        <div className="field-hint" style={{ marginTop: 8 }}>
          Inbound (edit from the other story):{' '}
          {inbound.map((l) => `${l.label} ${l.otherId}`).join(' · ')}
        </div>
      ) : null}
    </div>
  );
}
