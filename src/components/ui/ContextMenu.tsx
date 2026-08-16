import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import './ContextMenu.css';

/**
 * Right-click menus.
 *
 * One menu instance lives at the provider, and any component can open it with a
 * list of items — so adding a menu to a new object is a `onContextMenu` handler
 * and an array, not another popover implementation.
 *
 * Deliberately kept to a flat list with separators: nested submenus need
 * hover-intent timing and keyboard traversal to feel right, and none of the
 * actions here are numerous enough to justify that.
 */

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  /** Right-aligned hint, e.g. a shortcut or a count. */
  hint?: string;
  /** Renders in the destructive colour. */
  danger?: boolean;
  disabled?: boolean;
  /** Draws a divider above this item. */
  separatorBefore?: boolean;
}

interface MenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

type ShowFn = (event: React.MouseEvent, items: ContextMenuItem[]) => void;

const ContextMenuContext = createContext<ShowFn | null>(null);

/** Rough size used to flip the menu when it would overflow the viewport. */
const ITEM_H = 30;
const MENU_W = 208;
const EDGE = 8;

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [active, setActive] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);

  const show = useCallback<ShowFn>((event, items) => {
    if (items.length === 0) return;
    // Suppress the browser's own menu, and stop the event so a right-click on a
    // task row does not also open the parent card's menu.
    event.preventDefault();
    event.stopPropagation();

    // Clamp so the menu is never partly offscreen. Flipping rather than
    // shifting keeps the pointer at a corner of the menu, which is what makes
    // "right-click then move down-right" reliable.
    const height = items.length * ITEM_H + 10;
    const x =
      event.clientX + MENU_W + EDGE > window.innerWidth
        ? Math.max(EDGE, event.clientX - MENU_W)
        : event.clientX;
    const y =
      event.clientY + height + EDGE > window.innerHeight
        ? Math.max(EDGE, window.innerHeight - height - EDGE)
        : event.clientY;

    setActive(-1);
    setMenu({ x, y, items });
  }, []);

  const close = useCallback(() => setMenu(null), []);

  /* Dismissal. Scroll and resize close it too, because the menu is positioned
     against the viewport and would otherwise detach from what was clicked. */
  useEffect(() => {
    if (!menu) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };

    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    // Capture phase: scrolling happens on inner containers, not just window.
    window.addEventListener('scroll', close, true);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu, close]);

  /* Keyboard control, so the menu is not mouse-only. */
  useEffect(() => {
    if (!menu) return;

    const selectable = menu.items
      .map((item, i) => (item.disabled ? -1 : i))
      .filter((i) => i >= 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (selectable.length === 0) return;
        const at = selectable.indexOf(active);
        const step = e.key === 'ArrowDown' ? 1 : -1;
        const next = at === -1 ? (step === 1 ? 0 : selectable.length - 1) : at + step;
        setActive(selectable[(next + selectable.length) % selectable.length]);
        return;
      }
      if (e.key === 'Enter' && active >= 0) {
        e.preventDefault();
        const item = menu.items[active];
        close();
        item.onSelect();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [menu, active, close]);

  return (
    <ContextMenuContext.Provider value={show}>
      {children}

      {menu ? (
        <div
          className="ctx-menu"
          role="menu"
          ref={ref}
          style={{ left: menu.x, top: menu.y }}
          // A right-click inside the menu should not open another one.
          onContextMenu={(e) => e.preventDefault()}
        >
          {menu.items.map((item, i) => (
            <div key={`${item.label}-${i}`}>
              {item.separatorBefore && i > 0 ? <div className="ctx-sep" /> : null}
              <button
                role="menuitem"
                className={`ctx-item${item.danger ? ' danger' : ''}${i === active ? ' active' : ''}`}
                disabled={item.disabled}
                onMouseEnter={() => setActive(item.disabled ? -1 : i)}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
              >
                <span className="ctx-label">{item.label}</span>
                {item.hint ? <span className="ctx-hint">{item.hint}</span> : null}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </ContextMenuContext.Provider>
  );
}

/**
 * Returns a function that opens the menu at the pointer.
 *
 * ```tsx
 * const menu = useContextMenu();
 * <div onContextMenu={(e) => menu(e, [{ label: 'Delete', onSelect: … }])} />
 * ```
 */
export function useContextMenu(): ShowFn {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) throw new Error('useContextMenu must be used inside <ContextMenuProvider>');
  return ctx;
}
