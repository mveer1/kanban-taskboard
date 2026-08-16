import { Line } from 'react-chartjs-2';
import type { Board, Story } from '@/types/board';
import { completionTrend } from '@/store/selectors';
import { axisOptions } from './chartSetup';

/** Cumulative tasks completed over time, from each task's completedAt date. */
export function TrendChart({ board, stories }: { board: Board; stories: Story[] }) {
  const points = completionTrend(board, stories);

  if (points.length < 2) {
    return (
      <div className="empty">
        Not enough history yet — complete a few tasks to see the trend.
      </div>
    );
  }

  const data = {
    labels: points.map((p) => p.date),
    datasets: [
      {
        label: 'Tasks completed (cumulative)',
        data: points.map((p) => p.cumulative),
        borderColor: '#6ee7b7',
        backgroundColor: 'rgba(110, 231, 183, 0.14)',
        fill: true,
        tension: 0.3,
        pointRadius: 2.5,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
    ],
  };

  return (
    <Line
      data={data}
      options={{
        plugins: { legend: { display: false } },
        scales: {
          x: { ...axisOptions, grid: { display: false } },
          y: { ...axisOptions, beginAtZero: true, ticks: { precision: 0, padding: 6 } },
        },
      }}
    />
  );
}
