'use client';

/**
 * @file QuickActionGrid.tsx
 * @module components/dashboard/QuickActionGrid
 *
 * 2-column quick-action card grid used in every role dashboard.
 * Each action card shows an icon, bold label, and secondary description.
 * Cards lift on hover with a primary-coloured border.
 */

import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';
import styles from './QuickActionGrid.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A single quick-action entry displayed in the grid.
 */
export interface QuickAction {
  /** Short action label (e.g. `'Start Session'`). */
  label: string;
  /** Icon element (typically a Lucide icon at 24px). */
  icon: ReactNode;
  /** Navigation href for the action card. */
  href: string;
  /** One-line description shown below the label. */
  description: string;
}

/**
 * Props for the {@link QuickActionGrid} component.
 */
export interface QuickActionGridProps {
  /** Array of action items to render in the grid. */
  actions: QuickAction[];
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * 2-column grid of quick-action navigation cards.
 *
 * Each card is a full `<Link>` wrapping an icon, bold label, and description.
 * On hover the card lifts `2px` and its border turns `var(--color-primary)`.
 *
 * @param props - {@link QuickActionGridProps}
 * @returns The rendered quick-action grid element.
 */
export function QuickActionGrid({ actions }: QuickActionGridProps): ReactElement {
  return (
    <div className={styles.grid}>
      {actions.map((action) => (
        <Link key={action.href} href={action.href} className={styles.card}>
          <span className={styles.icon} aria-hidden="true">
            {action.icon}
          </span>
          <div className={styles.text}>
            <span className={styles.label}>{action.label}</span>
            <span className={styles.description}>{action.description}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
