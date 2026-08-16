import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import './Toast.css';

/** Transient confirmation messages, bottom-center. */

interface ToastItem {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

const ToastContext = createContext<{
  notify: (text: string, tone?: 'info' | 'error') => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const notify = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, text, tone }]);
    window.setTimeout(
      () => setItems((prev) => prev.filter((t) => t.id !== id)),
      tone === 'error' ? 5000 : 2200,
    );
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx.notify;
}
