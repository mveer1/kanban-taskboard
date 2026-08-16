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
 * Chart.js registration and shared dark-theme defaults.
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

/** Grid/axis options shared by the cartesian charts. */
export const axisOptions = {
  grid: { color: css('--border', '#2b2b32'), drawTicks: false },
  border: { display: false },
  ticks: { padding: 6 },
};
