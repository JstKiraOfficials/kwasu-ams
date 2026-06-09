/**
 * @file Modal.tsx
 * @module components/ui/Modal
 *
 * Accessible modal dialog with backdrop blur, `scaleIn` enter animation,
 * focus trap, and `Escape` key dismissal. Renders into a portal at the
 * document body so it always appears above the app shell. On mobile the
 * modal slides up from the bottom (bottom-sheet pattern).
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import styles from './Modal.module.css';

/**
 * Width preset for the modal panel.
 *
 * - `sm`   — 400 px max-width.
 * - `md`   — 560 px max-width (default).
 * - `lg`   — 720 px max-width.
 * - `xl`   — 960 px max-width.
 * - `full` — full viewport width and height.
 */
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

/**
 * Props accepted by the `Modal` component.
 */
export interface ModalProps {
  /** Controls visibility. When `false` the modal is unmounted. */
  open: boolean;
  /**
   * Called when the user dismisses the modal (backdrop click, Escape key,
   * or close button). The parent is responsible for setting `open` to `false`.
   */
  onClose: () => void;
  /** Title text rendered in the modal header. */
  title: string;
  /** Main content rendered in the scrollable body section. */
  children: React.ReactNode;
  /** Optional action buttons rendered in the sticky footer. */
  footer?: React.ReactNode;
  /**
   * Width preset.
   * @defaultValue `'md'`
   */
  size?: ModalSize;
  /**
   * When `true`, clicking the backdrop does not close the modal.
   * @defaultValue `false`
   */
  disableBackdropClose?: boolean;
}

/**
 * Modal dialog component.
 *
 * Mounts into `document.body` via `createPortal`. Locks `body` scroll while
 * open. The first focusable element inside the modal receives focus on open.
 * Focus is returned to the trigger element on close.
 *
 * @param props - `ModalProps` controlling open state, title, content, and size.
 * @returns A portal-rendered modal dialog, or `null` when `open` is `false`.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  disableBackdropClose = false,
}: ModalProps): React.JSX.Element | null {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // ── Lock body scroll and save focus target ─────────────────────────
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';
      // Move focus into modal on next tick
      const id = setTimeout(() => {
        const focusable = modalRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        focusable?.focus();
      }, 50);
      return () => clearTimeout(id);
    } else {
      document.body.style.overflow = '';
      previousFocusRef.current?.focus();
    }
  }, [open]);

  // ── Escape key dismissal ─────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={disableBackdropClose ? undefined : onClose}
      role="presentation"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`${styles.modal} ${styles[size]}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles.header}>
          <h2 id="modal-title" className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>{children}</div>

        {/* Footer */}
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
