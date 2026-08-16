import { useEffect, type ReactNode } from 'react';
import './Modal.css';

/**
 * Overlay dialog. Closes on backdrop click and Escape.
 * Used by the story detail view and every editor.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true">
        <header className="modal-head">
          <div className="modal-titles">
            <h2>{title}</h2>
            {subtitle ? <div className="modal-sub">{subtitle}</div> : null}
          </div>
          <button className="icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal-body">{children}</div>

        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

/** Labeled form field wrapper. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      {children}
      {hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

export function FieldRow({ cols = 2, children }: { cols?: 2 | 3; children: ReactNode }) {
  return <div className={`field-row cols-${cols}`}>{children}</div>;
}
