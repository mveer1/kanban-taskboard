import { Doughnut } from 'react-chartjs-2';
import { COLUMNS } from '@/config/columns';
import type { BoardStats } from '@/store/selectors';

/** Story distribution across the four columns. */
export function StatusChart({ stats }: { stats: BoardStats }) {
  const data = {
    labels: COLUMNS.map((c) => c.title),
    datasets: [
      {
        data: COLUMNS.map((c) => stats.byStatus[c.id]),
        backgroundColor: COLUMNS.map((c) => c.accent),
        borderColor: 'transparent',
        borderWidth: 0,
        hoverOffset: 6,
      },
    ],
  };

  return (
    <Doughnut
      data={data}
      options={{
        cutout: '62%',
        plugins: {
          legend: { position: 'right', labels: { padding: 10 } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const value = Number(ctx.raw);
                const pct = stats.stories ? Math.round((value / stats.stories) * 100) : 0;
                return ` ${ctx.label}: ${value} (${pct}%)`;
              },
            },
          },
        },
      }}
    />
  );
}
