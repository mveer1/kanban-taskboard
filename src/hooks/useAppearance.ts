import { useEffect, useState } from 'react';
import type { Settings } from '@/types/board';

/** The two concrete themes. `'system'` always resolves to one of these. */
export type ResolvedTheme = 'dark' | 'light';

const QUERY = '(prefers-color-scheme: light)';

/**
 * Apply the appearance settings to `<html>` and report the resolved theme.
 *
 * Lives in a hook called from `Shell` rather than in `SettingsPage`, because
 * `SettingsPage` mounts only while the Settings view is open: a saved light
 * theme was being ignored on every load until the user happened to walk back
 * into Settings, since `index.html` boots with `data-theme="dark"`.
 *
 * The `matchMedia` subscription matters for `'system'` only — without it the
 * theme was pinned to whatever the OS reported at mount, so changing the OS
 * appearance left the board stale.
 *
 * @param appearance the persisted appearance settings
 * @returns the theme actually on the document, for consumers that cannot read
 *          CSS variables — Chart.js resolves its colors in JS, not in CSS
 */
export function useAppearance(appearance: Settings['appearance']): ResolvedTheme {
  const { theme, radiusScale } = appearance;

  // Seeded from the media query so the first paint matches the OS under
  // 'system', instead of flashing dark and correcting a frame later.
  const [systemIsLight, setSystemIsLight] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setSystemIsLight(e.matches);
    mq.addEventListener('change', onChange);
    setSystemIsLight(mq.matches);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const resolved: ResolvedTheme =
    theme === 'system' ? (systemIsLight ? 'light' : 'dark') : theme;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.radius = radiusScale;
  }, [resolved, radiusScale]);

  return resolved;
}

/**
 * Observe the theme currently on `<html>`.
 *
 * For consumers that need to react to a theme change but are nowhere near the
 * settings — Chart.js resolves its colors in JS, so charts have to be rebuilt
 * rather than simply restyled by CSS.
 *
 * Reads the DOM attribute instead of the settings so `'system'` is handled for
 * free, with the resolution logic staying in one place: `useAppearance`.
 */
export function useResolvedTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>(
    () =>
      (typeof document !== 'undefined'
        ? (document.documentElement.dataset.theme as ResolvedTheme)
        : undefined) ?? 'dark',
  );

  useEffect(() => {
    const read = () =>
      setTheme((document.documentElement.dataset.theme as ResolvedTheme) ?? 'dark');
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}
