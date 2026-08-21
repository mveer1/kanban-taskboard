import { useEffect } from 'react';
import { COLUMNS } from '@/config/columns';
import { filterStories, storiesInColumn } from '@/store/selectors';
import { useBoard } from '@/store/BoardContext';
import { useUi } from '@/store/UiContext';
import { Column } from './Column';
import { FilterBar } from './FilterBar';
import './Board.css';

/**
 * The board view: filters on top, four columns below.
 * Stats live on the Insights view, not here.
 */
export function BoardView() {
  const { board, settings } = useBoard();
  const ui = useUi();
  const visible = filterStories(board, ui.filters);

  /* Expand the active column's stories on first load, if enabled. */
  useEffect(() => {
    if (!settings.board.autoExpandActive) return;
    const activeIds = board.stories.filter((s) => s.status === 'active').map((s) => s.id);
    ui.setAllExpanded(activeIds, true);
    // Intentionally runs once — later expansion is user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Scroll to and flash a story when navigating from a link or the graph. */
  useEffect(() => {
    if (!ui.focusedStoryId) return;
    const node = document.querySelector(`[data-story-id="${ui.focusedStoryId}"]`);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      node.classList.remove('flash');
      void (node as HTMLElement).offsetWidth;
      node.classList.add('flash');
    }
    const t = window.setTimeout(() => ui.clearFocus(), 1400);
    return () => window.clearTimeout(t);
  }, [ui.focusedStoryId, ui]);

  return (
    <>
      <FilterBar />

      {visible.length === 0 ? (
        board.stories.length === 0 ? (
          /* Genuinely empty board — offering "clear filters" here would be a lie. */
          <div className="board-empty">
            <p>No stories yet.</p>
            <button className="ghost" onClick={() => ui.openStoryEditor({})}>
              Create your first story
            </button>
          </div>
        ) : (
          <div className="board-empty">
            <p>{ui.filters.search.trim() ? 'No stories found.' : 'No stories match the current filters.'}</p>
            <button className="ghost" onClick={ui.clearFilters}>
              Clear filters
            </button>
          </div>
        )
      ) : null}

      <div className="board">
        {COLUMNS.map((col) => (
          <Column
            key={col.id}
            status={col.id}
            stories={storiesInColumn(visible, col.id)}
            density={settings.board.density[col.id]}
          />
        ))}
      </div>
    </>
  );
}
