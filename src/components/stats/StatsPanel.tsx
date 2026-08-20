import { useEffect } from 'react';
import type { Board, Story } from '@/types/board';
import { computeStats } from '@/store/selectors';
import { useResolvedTheme } from '@/hooks/useAppearance';
import { applyChartTheme } from './chartSetup';
import { StatusChart } from './StatusChart';
import { ProjectPointsChart } from './ProjectPointsChart';
import { TrendChart } from './TrendChart';
import './StatsPanel.css';

/** One headline number. */
function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: 'warn' | 'bad' | 'good';
}) {
  return (
    <div className={`metric${tone ? ` ${tone}` : ''}`}>
      <div className="label">{label}</div>
      <div className="metric-value">
        {value}
        {sub ? <small>{sub}</small> : null}
      </div>
    </div>
  );
}

/**
 * Metric tiles plus three charts. Rendered below the board (and on Insights),
 * so the columns stay above the fold.
 */
export function StatsPanel({
  board,
  stories,
  compact = false,
}: {
  board: Board;
  stories: Story[];
  compact?: boolean;
}) {
  // Chart.js caches its colors as JS values, so a theme change needs the
  // defaults re-applied and the charts rebuilt — CSS alone cannot restyle them.
  const theme = useResolvedTheme();
  useEffect(() => {
    applyChartTheme();
  }, [theme]);

  const stats = computeStats(board, stories);

  return (
    <section className="stats-panel">
      <div className="metrics">
        <Metric label="Stories" value={stats.stories} sub={`${stats.storiesDone} done`} />
        <Metric label="Tasks" value={stats.tasks} sub={`${stats.tasksDone} done`} />
        <Metric label="Open points" value={stats.openPoints} sub="est." />
        <Metric label="Done points" value={stats.donePoints} sub="est." tone="good" />
        <Metric
          label="Overdue"
          value={stats.overdue}
          sub="items"
          tone={stats.overdue > 0 ? 'bad' : undefined}
        />
        <Metric
          label="Blocked"
          value={stats.blocked}
          sub="stories"
          tone={stats.blocked > 0 ? 'warn' : undefined}
        />
      </div>

      {compact ? null : (
        // Keyed on the theme so Chart.js re-instantiates with the new defaults
        // and freshly resolved axis colors.
        <div className="charts" key={theme}>
          <div className="chart-card">
            <h3 className="label">Status breakdown</h3>
            <div className="chart-body">
              <StatusChart stats={stats} />
            </div>
          </div>

          <div className="chart-card">
            <h3 className="label">Points by project</h3>
            <div className="chart-body">
              <ProjectPointsChart board={board} stories={stories} />
            </div>
          </div>

          <div className="chart-card">
            <h3 className="label">Completion trend</h3>
            <div className="chart-body">
              <TrendChart board={board} stories={stories} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
