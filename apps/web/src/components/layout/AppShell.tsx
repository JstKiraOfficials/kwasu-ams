/**
 * @file AppShell.tsx
 * @module components/layout/AppShell
 *
 * Root application shell that composes the sidebar, top navigation bar, and
 * scrollable main content area for all authenticated app pages.
 *
 * Layout behaviour:
 * - Desktop (≥ 768 px): persistent sidebar (260 px expanded / 72 px collapsed)
 *   alongside the main content.
 * - Mobile (< 768 px): sidebar is hidden; a hamburger button in `TopNav`
 *   opens it as a full-height overlay with a semi-transparent backdrop.
 *
 * Collapse state is persisted to `localStorage('kwasu-sidebar-collapsed')` so
 * the user's preference survives page refreshes.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { IUserPublic } from '@kwasu-ams/types';
import { Role } from '@kwasu-ams/types';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import styles from './AppShell.module.css';

/** localStorage key used to persist the sidebar collapse state. */
const SIDEBAR_STORAGE_KEY = 'kwasu-sidebar-collapsed';

// ── Props ──────────────────────────────────────────────────────────────────

/**
 * Props accepted by the `AppShell` component.
 */
interface AppShellProps {
  /**
   * The authenticated user whose role drives sidebar navigation and whose
   * name / initials appear in the `TopNav` avatar.
   */
  user: IUserPublic;
  /** Page content rendered inside the scrollable main area. */
  children: React.ReactNode;
  /**
   * Unread notification count forwarded to `TopNav`'s bell badge.
   * Defaults to `0`.
   */
  unreadCount?: number;
}

// ── Component ──────────────────────────────────────────────────────────────

/**
 * Authenticated application shell.
 *
 * Renders a three-zone layout: sidebar | top-nav + content. Manages sidebar
 * collapse state (persisted to `localStorage`) and mobile overlay open/close
 * state independently so they do not interfere with each other.
 *
 * @param props - `AppShellProps` with `user`, `children`, and optional `unreadCount`.
 * @returns The full-height shell JSX element.
 */
export function AppShell({ user, children, unreadCount = 0 }: AppShellProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // ── Restore persisted collapse state ──────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === 'true') setCollapsed(true);
  }, []);

  // ── Toggle collapse and persist ───────────────────────────────────────
  const handleToggleCollapse = useCallback((): void => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  // ── Mobile overlay handlers ───────────────────────────────────────────
  const handleMenuClick = useCallback((): void => {
    setMobileOpen((prev) => !prev);
  }, []);

  const handleOverlayClick = useCallback((): void => {
    setMobileOpen(false);
  }, []);

  // ── Safe role fallback ────────────────────────────────────────────────
  const role: Role = Object.values(Role).includes(user.role as Role)
    ? (user.role as Role)
    : Role.STUDENT;

  return (
    <div className={styles.shell}>
      {/* Desktop sidebar */}
      <aside
        className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''}`}
        aria-label="Application sidebar"
      >
        <Sidebar role={role} collapsed={collapsed} onToggleCollapse={handleToggleCollapse} />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div className={styles.sidebarOverlay} onClick={handleOverlayClick} aria-hidden="true" />
          {/* Slide-in sidebar */}
          <aside className={styles.sidebarMobile} aria-label="Mobile navigation">
            <Sidebar role={role} collapsed={false} onToggleCollapse={() => setMobileOpen(false)} />
          </aside>
        </>
      )}

      {/* Main: top nav + page content */}
      <div className={styles.main}>
        <header className={styles.topNav}>
          <TopNav onMenuClick={handleMenuClick} unreadCount={unreadCount} />
        </header>

        <main className={styles.content} id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
