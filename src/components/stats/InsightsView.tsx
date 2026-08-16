import { filterStories } from '@/store/selectors';
import { useBoard } from '@/store/BoardContext';
import { useUi } from '@/store/UiContext';
import { StatsPanel } from './StatsPanel';
import { DependencyGraph } from '@/components/graph/DependencyGraph';
import { FilterBar } from '@/components/board/FilterBar';

/** Insights view: the same stats as the board footer, plus the dependency graph. */
export function InsightsView() {
  const { board, settings } = useBoard();
  const ui = useUi();
  const visible = filterStories(board, ui.filters);

  return (
    <>
      <FilterBar />

      {settings.board.showGraph ? (
        <section className="insights-graph">
          <h3 className="label">Story dependencies</h3>
          <DependencyGraph board={board} stories={visible} />
        </section>
      ) : null}

      <StatsPanel board={board} stories={visible} />
    </>
  );
}
