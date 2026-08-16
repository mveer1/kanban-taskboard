import { PALETTE } from '@/config/palette';
import './ColorSwatchPicker.css';

/**
 * Project color chooser. Shows the actual colors as clickable circles —
 * hex codes are never surfaced to the user.
 */
export function ColorSwatchPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="swatches" role="radiogroup" aria-label="Project color">
      {PALETTE.map((s) => (
        <button
          key={s.hex}
          type="button"
          role="radio"
          aria-checked={s.hex === value}
          aria-label={s.name}
          title={s.name}
          className={`swatch${s.hex === value ? ' on' : ''}`}
          style={{ background: s.hex }}
          onClick={() => onChange(s.hex)}
        />
      ))}
    </div>
  );
}

/** Small solid dot, for lists and menus. */
export function ColorDot({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <span
      className="color-dot"
      style={{ background: color, width: size, height: size }}
    />
  );
}
