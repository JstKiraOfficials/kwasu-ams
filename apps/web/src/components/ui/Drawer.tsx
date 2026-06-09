/**
 * @file Drawer.tsx
 * @module components/ui/Drawer
 *
 * Right-side slide-in panel (drawer). Uses the `slideInRight` keyframe from
 * `globals.css`. Renders into a portal at document body. On mobile the drawer
 * expands to full screen. Supports `Escape` key dismissal and backdrop click.
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import styles from './Drawer.module.css';

/**
 * Width preset for the drawer panel.
 *
 * - `sm` — 320 px.
 * - `md` — 480 px (default).
 * - `lg` — 640 px.
 *
 * On viewports below 768 px, the drawer always expands to full screen.
 */
export type DrawerSize = 'sm' | 'md' | 'lg';

/**
 * Props accepted by the `Drawer` component.
 */
export interface DrawerProps {
  /** Controls visibility. When `false` the drawer is unmounted. */
  open: boolean;
  /**
   * Called when the user dismisses the drawer (backdrop click, Escape key,
   * or close button).
   */
  onClose: () => void;
  /** Title text rendered in the drawer header. */
  title: string;
  /** Content rendered in the scrollable body section. */
  children: React.ReactNode;
  /** Optional action buttons rendered in the sticky footer. */
  footer?: React.ReactNode;
  /**
   * Width preset.
   * @defaultValue `'md'`
   */
  size?: DrawerSize;
}

/**
 * Right-side drawer panel component.
 *
 * Mounts into `document.body` via `createPortal`. Locks body scroll while
 * open and restores it on close. Returns focus to the previously focused
 * element on close.
 *
 * @param props - `DrawerProps` controlling open state, title, content, and size.
 * @returns A portal-rendered drawer panel, or `null` when `open` is `false`.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: DrawerProps): React.JSX.Element | null {
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';
      const id = setTimeout(() => {
        const focusable = drawerRef.current?.querySelector<HTMLElement>(
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
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className={`${styles.drawer} ${styles[size]}`}
      >
        <div className={styles.header}>
          <h2 id="drawer-title" className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close panel"
          >
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </>,
    document.body,
  );
}
