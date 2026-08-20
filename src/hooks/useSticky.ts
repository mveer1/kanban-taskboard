import { useRef } from 'react';

/**
 * Retain the last non-nullish value.
 *
 * Needed because the dialogs are wrapped in `AnimatePresence`: while a modal
 * plays its exit animation it stays mounted, but the UI state that opened it
 * (`ui.storyEditor`, `ui.detailStoryId`, …) has already been cleared. Reading
 * that state directly during those final frames either throws — the editors
 * dereference it with a non-null assertion — or renders nothing, which
 * cancels the very animation we are waiting on.
 *
 * Holding the previous value keeps the exiting subtree rendering the record it
 * was opened with until it unmounts for real.
 *
 * @param value the live value, which may go null before unmount
 * @returns the value if set, otherwise the last one seen
 */
export function useSticky<T>(value: T | null | undefined): T | undefined {
  const last = useRef<T | undefined>(undefined);
  if (value != null) last.current = value;
  return value ?? last.current;
}
