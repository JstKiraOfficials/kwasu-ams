'use client';

/**
 * @file StatsCard.tsx
 * @module components/dashboard/StatsCard
 *
 * Glassmorphism stat card used in every role's dashboard stats row.
 * Displays a title, large value, optional subtitle, trend indicator, and icon.
 * Supports four colour variants: default, success, warning, danger.
 * Cards animate in with a stagger delay driven by the CSS `--i` custom property.
 */

import type { ReactElement, ReactNode } from 'react';
import styles from './StatsCard.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Trend direction for the stat value relative to the previous period.
 */
export type TrendDirection = 'up' | 'down' | 'stable';

/**
 * Visual variant controlling the accent colour of the card.
 */
export type StatsCardVariant = 'default' | 'success' | 'warning' | 'danger';

/**
 * Props for the {@link StatsCard} component.
 */
export interface StatsCardProps {
  /** Short label above the value (e.g. `'Overall Attendance'`). */
  title: string;
  /** Primary metric value (e.g. `'87.4%'` or `'142'`). */
  value: string | number;
  /** Optional secondary line below the value. */
  subtitle?: string;
  /** Trend direction relative to the previous period. */
  trend?: TrendDirection;
  /** Optional text shown alongside the trend arrow. */
  trendLabel?: string;
  /** Optional Lucide or custom icon element. */
  icon?: ReactNode;
  /** Colour variant. Defaults to `'default'`. */
  variant?: StatsCardVariant;
  /**
   * Stagger index — sets the CSS `--i` variable so each card in a row
   * animates in `calc(var(--i) * 50ms)` after the previous one.
   * @defaultValue 0
   */
  index?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the appropriate SVG arrow element for a given trend direction.
 *
 * @param trend - The trend direction to render.
 * @returns A small SVG arrow element, or a dash for `'stable'`.
 */
function TrendArrow({ trend }: { trend: TrendDirection }): ReactElement {
  if (trend === 'up') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path
          d="M6 10V2M2 6l4-4 4 4"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (trend === 'down') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path
          d="M6 2v8M2 6l4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return <span aria-hidden="true">—</span>;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Glassmorphism dashboard stat card.
 *
 * Renders a frosted-glass card with a large metric value, contextual colour
 * coding, and an optional animated trend indicator. Multiple cards in a row
 * stagger their entrance animation using the `index` prop.
 *
 * @param props - {@link StatsCardProps}
 * @returns The rendered stats card element.
 */
export function StatsCard({
  title,
  value,
  subtitle,
  trend,
  trendLabel,
  icon,
  variant = 'default',
  index = 0,
}: StatsCardProps): ReactElement {
  const variantClass =
    styles[`variant${variant.charAt(0).toUpperCase()}${variant.slice(1)}` as keyof typeof styles];

  return (
    <div
      className={`${styles.card} ${variantClass ?? ''}`}
      style={{ '--i': index } as React.CSSProperties}
    >
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        {icon && (
          <span className={styles.icon} aria-hidden="true">
            {icon}
          </span>
        )}
      </div>

      <div className={styles.value}>{value}</div>

      {subtitle && <div className={styles.subtitle}>{subtitle}</div>}

      {trend && (
        <div
          className={`${styles.trend} ${styles[`trend${trend.charAt(0).toUpperCase()}${trend.slice(1)}` as keyof typeof styles] ?? ''}`}
        >
          <TrendArrow trend={trend} />
          {trendLabel && <span>{trendLabel}</span>}
        </div>
      )}
    </div>
  );
}
