import { useEffect } from 'react';

export interface Hotkey {
  /** `event.key` value, matched case-insensitively. */
  key: string;
  description: string;
  run: () => void;
}

/** True when focus is in a text field — typing should not trigger shortcuts. */
function inTextInput(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Global keyboard shortcuts. Ignored while typing and while a modifier is held,
 * so browser and OS shortcuts keep working.
 */
export function useHotkeys(hotkeys: Hotkey[], enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (inTextInput(e.target) && e.key !== 'Escape') return;

      const match = hotkeys.find((h) => h.key.toLowerCase() === e.key.toLowerCase());
      if (!match) return;

      e.preventDefault();
      match.run();
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hotkeys, enabled]);
}
