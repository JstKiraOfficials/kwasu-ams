/**
 * @file index.ts
 * @module components/ui
 *
 * Barrel export for all shared UI components. Import from this path rather
 * than from individual component files to keep import statements stable if
 * files are reorganised.
 *
 * @example
 * ```ts
 * import { Button, Card, Badge, Input } from '@/components/ui';
 * ```
 */

export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { Card } from './Card';
export type { CardProps, CardVariant } from './Card';

export { Badge } from './Badge';
export type { BadgeProps, BadgeVariant } from './Badge';

export { Input } from './Input';
export type { InputProps } from './Input';

export { Select } from './Select';
export type { SelectProps, SelectOption } from './Select';

export { Tabs } from './Tabs';
export type { TabsProps, TabItem } from './Tabs';

export { Modal } from './Modal';
export type { ModalProps, ModalSize } from './Modal';

export { Drawer } from './Drawer';
export type { DrawerProps, DrawerSize } from './Drawer';

export { ToastProvider, useToast } from './Toast';
export type { ToastEntry, ToastOptions, ToastVariant } from './Toast';

export { Skeleton } from './Skeleton';
export type { SkeletonProps, SkeletonVariant } from './Skeleton';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { ProgressBar } from './ProgressBar';
export type { ProgressBarProps, ProgressBarVariant, ProgressThreshold } from './ProgressBar';

export { DataTable } from './DataTable';
export type { DataTableProps, ColumnDef } from './DataTable';
