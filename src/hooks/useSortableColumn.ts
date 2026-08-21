import { useEffect, useRef, type RefObject } from 'react';
import Sortable from 'sortablejs';
import type { Status } from '@/types/board';

/**
 * Binds SortableJS to a column's card list.
 *
 * SortableJS mutates the DOM directly, which React otherwise owns. To avoid
 * the two fighting, `onEnd` immediately puts the dragged node back where it
 * started and then reports the intent upward. React re-renders from state and
 * becomes the single source of truth for card position.
 */
export function useSortableColumn(
  ref: RefObject<HTMLElement>,
  {
    status,
    enabled = true,
    onDrop,
  }: {
    status: Status;
    enabled?: boolean;
    onDrop: (storyId: string, toStatus: Status, toIndex: number) => void;
  },
) {
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled || window.matchMedia('(max-width: 767px)').matches) return;

    const instance = Sortable.create(node, {
      group: 'stories',
      animation: 150,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
      handle: '[data-drag-handle]',
      draggable: '[data-story-id]',
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      forceFallback: false,
      fallbackTolerance: 3,

      onEnd: (evt) => {
        const { item, from, to, oldIndex, newIndex } = evt;
        const storyId = item.getAttribute('data-story-id');
        const toStatus = to.getAttribute('data-column-status') as Status | null;

        // Revert SortableJS's DOM mutation before React re-renders.
        if (from !== to || oldIndex !== newIndex) {
          const anchor = from.children[oldIndex ?? 0] ?? null;
          from.insertBefore(item, anchor);
        }

        if (storyId && toStatus) onDropRef.current(storyId, toStatus, newIndex ?? 0);
      },
    });

    return () => {
      if (node.parentNode) instance.destroy();
    };
  }, [ref, status, enabled]);
}
