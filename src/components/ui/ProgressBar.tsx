import './ProgressBar.css';

/** Thin completion bar used on story cards. */
export function ProgressBar({
  done,
  total,
  accent,
  showLabel = true,
}: {
  done: number;
  total: number;
  accent?: string;
  showLabel?: boolean;
}) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const complete = total > 0 && done === total;

  return (
    <div className="progress">
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{
            width: `${pct}%`,
            background: complete ? 'var(--low)' : (accent ?? 'var(--text-dim)'),
          }}
        />
      </div>
      {showLabel ? (
        <span className="progress-label mono">
          {done}/{total}
        </span>
      ) : null}
    </div>
  );
}
