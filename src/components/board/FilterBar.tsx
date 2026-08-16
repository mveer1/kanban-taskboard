import { PRIORITIES } from '@/config/columns';
import type { Priority } from '@/types/board';
import { allTags, hasActiveFilters, tagColor } from '@/store/selectors';
import { useBoard } from '@/store/BoardContext';
import { useUi } from '@/store/UiContext';
import './FilterBar.css';

/** Multi-select facets for project, priority, and tag, plus free-text search. */
export function FilterBar() {
  const { board } = useBoard();
  const ui = useUi();
  const tags = allTags(board);

  return (
    <div className="filterbar">
      <div className="facet">
        <span className="label">Project</span>
        {board.projects.map((p) => (
          <button
            key={p.id}
            className={`chip${ui.filters.projects.includes(p.id) ? ' on' : ''}`}
            onClick={() => ui.toggleProject(p.id)}
          >
            <span className="swatch-dot" style={{ background: p.color }} />
            {p.label}
          </button>
        ))}
      </div>

      <div className="facet">
        <span className="label">Priority</span>
        {PRIORITIES.map((p) => (
          <button
            key={p}
            className={`chip${ui.filters.priorities.includes(p) ? ' on' : ''}`}
            onClick={() => ui.togglePriority(p as Priority)}
          >
            {p}
          </button>
        ))}
      </div>

      {tags.length > 0 ? (
        <div className="facet">
          <span className="label">Tag</span>
          {tags.map((t) => {
            const color = tagColor(board, t);
            return (
              <button
                key={t}
                className={`chip${ui.filters.tags.includes(t) ? ' on' : ''}`}
                onClick={() => ui.toggleTag(t)}
              >
                <span
                  className="swatch-dot"
                  style={{ background: color ?? 'var(--text-faint)' }}
                />
                {t}
              </button>
            );
          })}
          <button className="chip chip-manage" onClick={() => ui.setTagEditorOpen(true)}>
            + Manage
          </button>
        </div>
      ) : null}

      <div className="facet search-facet">
        <input
          type="text"
          id="board-search"
          placeholder="Search stories & tasks…  ( / )"
          value={ui.filters.search}
          onChange={(e) => ui.setSearch(e.target.value)}
        />
        {hasActiveFilters(ui.filters) ? (
          <button className="ghost tiny" onClick={ui.clearFilters}>
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
