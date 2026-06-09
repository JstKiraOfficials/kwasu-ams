/**
 * @file EmptyState.tsx
 * @module components/ui/EmptyState
 *
 * Centred empty-state placeholder displayed when a data-fetching component
 * has no records to show (e.g. no courses enrolled, no sessions today).
 * Always shows text alongside any icon so meaning is conveyed without
 * relying on visuals alone.
 */

import { InboxIcon } from 'lucide-react';
import styles from './EmptyState.module.css';

/**
 * Props accepted by the `EmptyState` component.
 */
export interface EmptyStateProps {
  /**
   * Icon element rendered above the title. Defaults to an inbox icon.
   * Pass `null` to render no icon.
   */
  icon?: React.ReactNode;
  /** Short heading that names what is missing. */
  title: string;
  /** Longer explanation or guidance text rendered below the title. */
  description?: string;
  /** Optional action button or link rendered below the description. */
  action?: React.ReactNode;
  /** Additional class names applied to the container `<div>`. */
  className?: string;
}

/**
 * Empty state component.
 *
 * Renders a vertically centred layout with an icon, title, description, and
 * optional call-to-action. Used as the "empty" branch of the
 * loading / error / empty / content pattern required for all data-fetching
 * components.
 *
 * @param props - `EmptyStateProps` with `title` and optional `icon`, `description`, and `action`.
 * @returns The empty-state container `<div>`.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps): React.JSX.Element {
  const iconNode =
    icon === undefined ? <InboxIcon size={28} strokeWidth={1.5} aria-hidden="true" /> : icon;

  return (
    <div className={`${styles.container} ${className}`}>
      {iconNode !== null && (
        <div className={styles.iconWrap} aria-hidden="true">
          {iconNode}
        </div>
      )}
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
