import { useState } from 'react';
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [draft, setDraft] = useState(ui.filters);

  const toggleDraft = (key: 'projects' | 'priorities' | 'tags', value: string) =>
    setDraft((current) => ({
      ...current,
      [key]: current[key].includes(value as never)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value] as never,
    }));

  const openMobile = () => {
    setDraft(ui.filters);
    setMobileOpen(true);
  };

  return (
    <>
      <button className="mobile-filter-trigger" onClick={openMobile}>
        Filter{hasActiveFilters(ui.filters) ? ' · Active' : ''}
      </button>
      {mobileOpen ? (
        <div className="mobile-filter-sheet" role="dialog" aria-label="Filters">
          <header>
            <h2>Filters</h2>
            <button className="icon" onClick={() => setMobileOpen(false)} aria-label="Close">✕</button>
          </header>
          <div className="mobile-filter-options">
            <div className="mobile-filter-group">
              <span className="label">Project</span>
              {board.projects.map((project) => (
                <button key={project.id} className={`chip${draft.projects.includes(project.id) ? ' on' : ''}`} onClick={() => toggleDraft('projects', project.id)}>
                  {project.label}
                </button>
              ))}
            </div>
            <div className="mobile-filter-group">
              <span className="label">Priority</span>
              {PRIORITIES.map((priority) => (
                <button key={priority} className={`chip${draft.priorities.includes(priority) ? ' on' : ''}`} onClick={() => toggleDraft('priorities', priority)}>
                  {priority}
                </button>
              ))}
            </div>
            {tags.length > 0 ? (
              <div className="mobile-filter-group">
                <span className="label">Tag</span>
                {tags.map((tag) => (
                  <button key={tag} className={`chip${draft.tags.includes(tag) ? ' on' : ''}`} onClick={() => toggleDraft('tags', tag)}>
                    {tag}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <footer>
            <button className="ghost" onClick={() => setDraft({ ...ui.filters, projects: [], priorities: [], tags: [] })}>Clear</button>
            <span className="spacer" />
            <button className="primary" onClick={() => { ui.setFilters(draft); setMobileOpen(false); }}>Apply</button>
          </footer>
        </div>
      ) : null}
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
    </>
  );
}
