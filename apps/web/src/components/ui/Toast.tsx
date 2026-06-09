/**
 * @file Toast.tsx
 * @module components/ui/Toast
 *
 * Slide-in toast notification system. Provides a `useToast` hook for
 * imperatively adding toasts, a `ToastProvider` that manages the queue,
 * and a `ToastContainer` that renders active toasts in the top-right corner.
 *
 * Toasts auto-dismiss after `duration` ms (default 4 000). Users can also
 * dismiss manually via the close button. The notification area is rendered
 * into a portal so it always floats above the app shell.
 */

'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import styles from './Toast.module.css';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Semantic variant for a toast notification.
 *
 * - `success` — operation succeeded.
 * - `error`   — operation failed or encountered an error.
 * - `warning` — caution or degraded state.
 * - `info`    — neutral informational message.
 */
export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

/**
 * A single toast notification entry managed by `ToastProvider`.
 */
export interface ToastEntry {
  /** Unique identifier for the toast (auto-generated). */
  id: string;
  /** Semantic colour variant. */
  variant: ToastVariant;
  /** Bold title text. */
  title: string;
  /** Optional supporting detail rendered below the title. */
  message?: string;
  /**
   * Auto-dismiss delay in milliseconds.
   * @defaultValue `4000`
   */
  duration?: number;
}

/**
 * Options for adding a new toast via `useToast().add()`.
 * All fields except `title` and `variant` are optional.
 */
export type ToastOptions = Omit<ToastEntry, 'id'>;

// ── Context ────────────────────────────────────────────────────────────────

/**
 * Shape of the toast context value exposed by `ToastProvider`.
 */
interface ToastContextValue {
  /**
   * Adds a new toast to the queue.
   *
   * @param options - Toast configuration (variant, title, message, duration).
   */
  add: (options: ToastOptions) => void;
  /**
   * Manually dismisses a toast by its ID.
   *
   * @param id - The unique toast ID to remove.
   */
  dismiss: (id: string) => void;
}

/** @internal */
const ToastContext = createContext<ToastContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────

/**
 * Props accepted by `ToastProvider`.
 */
interface ToastProviderProps {
  /** Application subtree that will have access to `useToast`. */
  children: React.ReactNode;
}

/**
 * Toast notification provider.
 *
 * Manages the active toast queue and renders `ToastContainer` into a portal.
 * Must be placed near the root of the component tree (inside `ThemeProvider`
 * and `QueryProvider`).
 *
 * @param props - `ToastProviderProps` containing `children`.
 * @returns The provider with an adjacent portal-rendered toast container.
 */
export function ToastProvider({ children }: ToastProviderProps): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const counterRef = useRef(0);

  const add = useCallback((options: ToastOptions): void => {
    const id = `toast-${++counterRef.current}`;
    const entry: ToastEntry = { id, duration: 4_000, ...options };
    setToasts((prev) => [...prev, entry]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, entry.duration);
  }, []);

  const dismiss = useCallback((id: string): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ add, dismiss }}>
      {children}
      {typeof window !== 'undefined' &&
        createPortal(<ToastContainer toasts={toasts} onDismiss={dismiss} />, document.body)}
    </ToastContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Returns the toast context for imperatively adding and dismissing toasts.
 *
 * Must be called inside a component tree wrapped by `ToastProvider`.
 *
 * @returns `ToastContextValue` with `add` and `dismiss` methods.
 * @throws {Error} If called outside of a `ToastProvider`.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

// ── Container ──────────────────────────────────────────────────────────────

/** Icon map keyed by variant. */
const ICONS: Record<ToastVariant, React.ElementType> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

/**
 * Props accepted by `ToastContainer`.
 */
interface ToastContainerProps {
  /** Active toast entries to render. */
  toasts: ToastEntry[];
  /**
   * Called when a toast's close button is clicked.
   *
   * @param id - ID of the toast to dismiss.
   */
  onDismiss: (id: string) => void;
}

/**
 * Renders the active toast stack into the fixed top-right region.
 *
 * Not intended for direct use — rendered internally by `ToastProvider`.
 *
 * @param props - `ToastContainerProps` with the active toast list and dismiss callback.
 * @returns The toast container `<div>` with all active toasts.
 */
function ToastContainer({ toasts, onDismiss }: ToastContainerProps): React.JSX.Element {
  return (
    <div className={styles.container} role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.variant];
        return (
          <div
            key={toast.id}
            className={`${styles.toast} ${styles[toast.variant]}`}
            role="alert"
            aria-atomic="true"
          >
            <span className={styles.icon} aria-hidden="true">
              <Icon size={18} strokeWidth={1.75} />
            </span>
            <div className={styles.body}>
              <p className={styles.title}>{toast.title}</p>
              {toast.message && <p className={styles.message}>{toast.message}</p>}
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              <X size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
