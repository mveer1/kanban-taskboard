import { useCallback, useRef } from 'react';
import type { Density, Status, Story } from '@/types/board';
import { COLUMN_BY_ID } from '@/config/columns';
import { sumEstimates } from '@/store/selectors';
import { useBoard, useBoardStore } from '@/store/BoardContext';
import { useUi } from '@/store/UiContext';
import { useSortableColumn } from '@/hooks/useSortableColumn';
import { useContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';
import { StoryCardCompact } from '@/components/cards/StoryCardCompact';
import { StoryCardNormal } from '@/components/cards/StoryCardNormal';
import './Column.css';

/**
 * One board column. Card density is resolved per column from settings, which
 * is why the same board can show tiles in Done and full cards in Active.
 */
export function Column({
  status,
  stories,
  density,
}: {
  status: Status;
  stories: Story[];
  density: Density;
}) {
  const def = COLUMN_BY_ID[status];
  const { moveStory, canEdit, updateSettings } = useBoardStore();
  const { settings } = useBoard();
  const ui = useUi();
  const showMenu = useContextMenu();
  const listRef = useRef<HTMLDivElement>(null);

  const onDrop = useCallback(
    (storyId: string, toStatus: Status, toIndex: number) => {
      moveStory(storyId, toStatus, toIndex);
    },
    [moveStory],
  );

  useSortableColumn(listRef, { status, onDrop });

  const points = sumEstimates(stories);

  /** Open the editor with this column's status preselected. */
  const addHere = () => ui.openStoryEditor({ status });

  /**
   * Column menu. Density is here as well as in Settings because this is where
   * you notice a column is too dense to scan — walking to Settings to change one
   * column is friction the setting does not deserve.
   */
  const openColumnMenu = (event: React.MouseEvent) => {
    const ids = stories.map((s) => s.id);
    const items: ContextMenuItem[] = [
      { label: `New story in ${def.title}`, onSelect: addHere, disabled: !canEdit },
      {
        label: density === 'compact' ? 'Show full cards' : 'Show compact tiles',
        separatorBefore: true,
        onSelect: () =>
          updateSettings({
            board: {
              ...settings.board,
              density: {
                ...settings.board.density,
                [status]: density === 'compact' ? 'normal' : 'compact',
              },
            },
          }),
      },
      {
        label: 'Expand all task lists',
        separatorBefore: true,
        disabled: ids.length === 0,
        onSelect: () => ui.setAllExpanded(ids, true),
      },
      {
        label: 'Collapse all task lists',
        disabled: ids.length === 0,
        onSelect: () => ui.setAllExpanded([], false),
      },
    ];
    showMenu(event, items);
  };

  return (
    <section className="column" data-status={status}>
      <header className="column-head" onContextMenu={openColumnMenu}>
        <span className="column-title">{def.title}</span>
        <span className="column-count">{stories.length}</span>
        {points > 0 ? <span className="column-points">{points} pts</span> : null}
        {canEdit ? (
          <button
            className="column-add"
            onClick={addHere}
            aria-label={`New story in ${def.title}`}
            title={`New story in ${def.title}`}
          >
            +
          </button>
        ) : null}
      </header>

      <div
        className="column-list"
        ref={listRef}
        data-column-status={status}
        data-density={density}
      >
        {stories.map((story) =>
          density === 'compact' ? (
            <StoryCardCompact key={story.id} story={story} />
          ) : (
            <StoryCardNormal key={story.id} story={story} />
          ),
        )}
      </div>

      {stories.length === 0 ? (
        canEdit ? (
          // Doubles as the drop-zone hint and a second, larger target — an empty
          // column is exactly where someone is most likely to want to add.
          <button className="empty empty-add" onClick={addHere}>
            + Add a story
          </button>
        ) : (
          <div className="empty">No stories</div>
        )
      ) : null}
    </section>
  );
}
