import { useEffect, type RefObject } from 'react';

/**
 * Close a popover when the user clicks outside it or presses Escape.
 *
 * Extracted because the two top-bar dropdowns need identical behaviour, and the
 * original click-outside-only version left menus stuck open for keyboard users —
 * Escape closes every dialog in the app, so a menu that ignored it was
 * inconsistent.
 *
 * Not used for `Modal`, which owns its own Escape handling and needs to stop the
 * event propagating so closing a dialog does not also trigger the global hotkey.
 *
 * @param ref     the popover's container
 * @param open    only listens while true, so a closed menu costs nothing
 * @param onClose called on an outside click or Escape
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, open, onClose]);
}
