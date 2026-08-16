/**
 * Pastel swatches offered when creating or editing a project.
 * Rendered as actual color circles by src/components/ui/ColorSwatchPicker.tsx —
 * the user never sees or types a hex code.
 */
export interface Swatch {
  name: string;
  hex: string;
}

export const PALETTE: Swatch[] = [
  { name: 'Violet',     hex: '#a78bfa' },
  { name: 'Sky',        hex: '#93c5fd' },
  { name: 'Mint',       hex: '#6ee7b7' },
  { name: 'Amber',      hex: '#fcd34d' },
  { name: 'Rose',       hex: '#fca5a5' },
  { name: 'Peach',      hex: '#fdba74' },
  { name: 'Pink',       hex: '#f9a8d4' },
  { name: 'Periwinkle', hex: '#a5b4fc' },
  { name: 'Sage',       hex: '#86efac' },
  { name: 'Cyan',       hex: '#67e8f9' },
  { name: 'Lilac',      hex: '#c4b5fd' },
  { name: 'Sand',       hex: '#e7d8b1' },
];

/** Pick a color for a newly created project, cycling through the palette. */
export function nextSwatch(usedCount: number): string {
  return PALETTE[usedCount % PALETTE.length].hex;
}
