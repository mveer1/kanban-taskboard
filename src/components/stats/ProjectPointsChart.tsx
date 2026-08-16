import { Bar } from 'react-chartjs-2';
import type { Board, Story } from '@/types/board';
import { pointsByProject } from '@/store/selectors';
import { axisOptions } from './chartSetup';

/** Stacked open vs done estimate points per project. */
export function ProjectPointsChart({ board, stories }: { board: Board; stories: Story[] }) {
  const rows = pointsByProject(board, stories).filter((r) => r.open + r.done > 0);

  const data = {
    labels: rows.map((r) => r.project.label),
    datasets: [
      {
        label: 'Open',
        data: rows.map((r) => r.open),
        backgroundColor: rows.map((r) => r.project.color),
        borderRadius: 3,
        stack: 'points',
      },
      {
        label: 'Done',
        data: rows.map((r) => r.done),
        backgroundColor: rows.map((r) => `${r.project.color}44`),
        borderRadius: 3,
        stack: 'points',
      },
    ],
  };

  if (rows.length === 0) {
    return <div className="empty">No estimates recorded</div>;
  }

  return (
    <Bar
      data={data}
      options={{
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { ...axisOptions, stacked: true, grid: { display: false } },
          y: { ...axisOptions, stacked: true, beginAtZero: true, title: { display: false } },
        },
      }}
    />
  );
}
