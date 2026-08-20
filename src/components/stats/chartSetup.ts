import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';

/**
 * Chart.js registration and shared theme defaults.
 * Imported once by StatsPanel so individual charts stay declarative.
 */

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
  Legend,
  Tooltip,
);

const css = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export function applyChartTheme() {
  ChartJS.defaults.color = css('--text-dim', '#9c9ca5');
  ChartJS.defaults.borderColor = css('--border', '#2b2b32');
  ChartJS.defaults.font.family = css('--font', 'system-ui');
  ChartJS.defaults.font.size = 10;
  ChartJS.defaults.plugins.legend.labels.boxWidth = 9;
  ChartJS.defaults.plugins.legend.labels.boxHeight = 9;
  ChartJS.defaults.plugins.legend.labels.usePointStyle = true;
  ChartJS.defaults.plugins.tooltip.backgroundColor = css('--surface-1', '#151518');
  ChartJS.defaults.plugins.tooltip.borderColor = css('--border-strong', '#3a3a43');
  ChartJS.defaults.plugins.tooltip.borderWidth = 1;
  ChartJS.defaults.plugins.tooltip.titleColor = css('--text', '#e9e9ec');
  ChartJS.defaults.plugins.tooltip.bodyColor = css('--text-dim', '#9c9ca5');
  ChartJS.defaults.plugins.tooltip.padding = 9;
  ChartJS.defaults.maintainAspectRatio = false;
}

/** Grid/axis options shared by the cartesian charts.
 *
 * A function, not a const: Chart.js resolves colors in JS, so the values have
 * to be read at render time. As a module-level const it captured whichever
 * theme happened to be active at import and then kept dark grid lines forever
 * after a switch to light. */
export function getAxisOptions() {
  return {
    grid: { color: css('--border', '#2b2b32'), drawTicks: false },
    border: { display: false },
    ticks: { padding: 6 },
  };
}

/** Column accents for charts, resolved from the active theme rather than from
 *  ColumnDef.accent — the pastels are unreadable on a light background. */
export function statusColors(): string[] {
  return [
    css('--col-new', '#93c5fd'),
    css('--col-active', '#fcd34d'),
    css('--col-hold', '#c4b5fd'),
    css('--col-done', '#6ee7b7'),
  ];
}
