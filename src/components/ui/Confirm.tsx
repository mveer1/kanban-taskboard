import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useBoardStore } from '@/store/BoardContext';
import { Modal } from './Modal';
import './Confirm.css';

/**
 * Promise-based confirmation dialog, replacing `window.confirm`.
 *
 * Two reasons it exists rather than the native call: `confirm()` cannot be
 * styled or themed, and it cannot carry a "don't ask again" choice. The second
 * is the point — destructive actions should be cheap to repeat once you have
 * decided you understand them.
 *
 * Usage:
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: 'Delete S-4?', remember: 'deleteStory' })) …
 *
 * When `remember` is set and that flag has been switched off in settings, the
 * dialog does not appear and the promise resolves `true` immediately. The flags
 * are per action, not global, so deciding that deleting a task needs no
 * confirmation does not also silence deleting a whole story.
 */

/** Keys of `settings.confirmations` — the actions that can be silenced. */
export type ConfirmKey = 'deleteStory' | 'deleteTask';

export interface ConfirmOptions {
  title: string;
  /** Body text. Say what will happen, including anything that cascades. */
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. Defaults to true. */
  danger?: boolean;
  /**
   * Offer "don't ask again", persisting to `settings.confirmations[key]`.
   * Omit for one-off confirmations that should always be shown.
   */
  remember?: ConfirmKey;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { settings, updateSettings } = useBoardStore();
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [dontAsk, setDontAsk] = useState(false);

  /**
   * Read through a ref so `confirm` keeps a stable identity. Callers put it in
   * effect and callback dependency lists, and a function that changed on every
   * settings update would retrigger them.
   */
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const confirm = useCallback<ConfirmFn>((options) => {
    // Missing key or missing settings means "ask" — the safe direction. A
    // hand-edited settings.json without the block still gets confirmations.
    const silenced =
      options.remember !== undefined &&
      settingsRef.current?.confirmations?.[options.remember] === false;

    if (silenced) return Promise.resolve(true);

    setDontAsk(false);
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const settle = (value: boolean) => {
    if (!pending) return;

    if (value && dontAsk && pending.remember) {
      updateSettings({
        confirmations: {
          ...(settingsRef.current?.confirmations ?? { deleteStory: true, deleteTask: true }),
          [pending.remember]: false,
        },
      });
    }

    pending.resolve(value);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {pending ? (
        <Modal
          open
          size="md"
          onClose={() => settle(false)}
          title={pending.title}
          footer={
            <>
              <button
                className={pending.danger === false ? 'primary' : 'danger'}
                autoFocus
                onClick={() => settle(true)}
              >
                {pending.confirmLabel ?? 'Delete'}
              </button>
              <span className="spacer" />
              <button className="ghost" onClick={() => settle(false)}>
                {pending.cancelLabel ?? 'Cancel'}
              </button>
            </>
          }
        >
          {pending.message ? <div className="confirm-message">{pending.message}</div> : null}

          {pending.remember ? (
            <label className="confirm-remember">
              <input
                type="checkbox"
                checked={dontAsk}
                onChange={(e) => setDontAsk(e.target.checked)}
              />
              <span>
                <span className="confirm-remember-label">Don’t ask again</span>
                <span className="settings-hint">
                  This action will run immediately from now on. Re-enable it under
                  Settings → Confirmations.
                </span>
              </span>
            </label>
          ) : null}
        </Modal>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}

/** Default flags, exported so settings normalization has one source. */
export const DEFAULT_CONFIRMATIONS = { deleteStory: true, deleteTask: true } as const;

/** Labels for the Settings toggles. Keyed so adding a flag surfaces it there. */
export const CONFIRM_LABELS: Record<ConfirmKey, { label: string; hint: string }> = {
  deleteStory: {
    label: 'Confirm before deleting a story',
    hint: 'Deleting a story also deletes its tasks and any links pointing at it.',
  },
  deleteTask: {
    label: 'Confirm before deleting a task',
    hint: 'Tasks are small and easy to recreate, so this one is safe to turn off.',
  },
};
