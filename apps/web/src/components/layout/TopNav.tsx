/**
 * @file TopNav.tsx
 * @module components/layout/TopNav
 *
 * Top navigation bar rendered inside the `AppShell` above every app page.
 *
 * Left side: hamburger toggle (mobile only) and pathname-derived breadcrumb.
 * Right side: global search icon (opens inline search bar), dark/light mode
 * toggle, notification bell (opens dropdown panel), and a user avatar with a
 * role pill. Clicking the avatar opens a dropdown with Profile, Settings, and
 * Sign Out actions.
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Menu,
  Search,
  Sun,
  Moon,
  Bell,
  User,
  Settings,
  LogOut,
  ChevronRight,
  X,
} from 'lucide-react';
import type { IUserPublic } from '@kwasu-ams/types';
import { useTheme } from '../../providers/theme-provider';
import { useAuth } from '../../hooks/use-auth';
import styles from './TopNav.module.css';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Derives a human-readable breadcrumb label from a URL pathname segment.
 *
 * Replaces hyphens with spaces and title-cases the result.
 *
 * @param segment - A single pathname segment (e.g. `'students-at-risk'`).
 * @returns Formatted label (e.g. `'Students At Risk'`).
 */
function formatSegment(segment: string): string {
  return segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Derives initials from a full name for the avatar placeholder.
 *
 * Takes the first letter of the first and last words.
 *
 * @param fullName - The user's full name string.
 * @returns Up to two uppercase initials (e.g. `'AO'` for `'Amina Okafor'`).
 */
function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.[0] ?? '').toUpperCase();
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

/**
 * Formats a Role enum value into a short human-readable label.
 *
 * @param role - The raw role string (e.g. `'SUPER_ADMIN'`).
 * @returns Formatted role label (e.g. `'Super Admin'`).
 */
function formatRole(role: string): string {
  return role
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * A single notification entry displayed in the notification dropdown.
 */
interface NotificationItem {
  /** Unique identifier. */
  id: string;
  /** Notification message text. */
  message: string;
  /** ISO timestamp string. */
  createdAt: string;
  /** Whether the notification has been read. */
  read: boolean;
}

// ── Props ──────────────────────────────────────────────────────────────────

/**
 * Props accepted by the `TopNav` component.
 */
interface TopNavProps {
  /**
   * Callback invoked when the hamburger button is clicked on mobile.
   * The parent `AppShell` uses this to open the mobile sidebar overlay.
   */
  onMenuClick: () => void;
  /** Unread notification count shown on the bell icon badge. */
  unreadCount?: number;
  /** Recent notifications to show in the dropdown panel. */
  notifications?: NotificationItem[];
}

// ── Component ──────────────────────────────────────────────────────────────

/**
 * Application top navigation bar.
 *
 * Renders inside the `AppShell` `topNav` slot. Consumes `useAuth` for user
 * data and `useTheme` for the dark-mode toggle.
 *
 * - Search: clicking the icon expands an inline search input; pressing Escape
 *   or clicking outside collapses it.
 * - Notifications: clicking the bell opens a dropdown panel listing recent
 *   notifications inline — does not navigate to `/notifications`.
 * - User dropdown: closes on outside click via a `mousedown` document listener.
 *
 * @param props - `TopNavProps` containing `onMenuClick`, optional `unreadCount`,
 *   and optional `notifications`.
 * @returns The top navigation bar JSX element.
 */
export function TopNav({
  onMenuClick,
  unreadCount = 0,
  notifications = [],
}: TopNavProps): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Breadcrumb from pathname ─────────────────────────────────────────
  const breadcrumbSegments = pathname.split('/').filter(Boolean).map(formatSegment);

  // ── Close dropdowns on outside click ────────────────────────────────
  const handleOutsideClick = useCallback((e: MouseEvent): void => {
    if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
      setDropdownOpen(false);
    }
    if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
      setNotifOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [handleOutsideClick]);

  // ── Focus search input when opened ──────────────────────────────────
  useEffect(() => {
    if (searchOpen) {
      searchRef.current?.focus();
    }
  }, [searchOpen]);

  // ── Keyboard: Escape closes search ──────────────────────────────────
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      setSearchOpen(false);
      setSearchQuery('');
    }
  }, []);

  // ── Logout handler ───────────────────────────────────────────────────
  const handleLogout = useCallback(async (): Promise<void> => {
    setDropdownOpen(false);
    await logout();
    router.push('/login');
  }, [logout, router]);

  // ── Derived display values ───────────────────────────────────────────
  const initials = user ? getInitials(user.fullName) : '?';
  const roleLabel = user ? formatRole(user.role) : '';
  const displayName = user?.fullName ?? '';

  return (
    <div className={styles.topNav}>
      {/* Left: hamburger (mobile) + breadcrumb — always visible */}
      <div className={styles.left}>
        <button
          type="button"
          className={`${styles.hamburger} ${styles.hamburgerDesktop}`}
          onClick={onMenuClick}
          aria-label="Open navigation menu"
        >
          <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>

        {breadcrumbSegments.length > 0 && (
          <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
            {breadcrumbSegments.map((seg, idx) => (
              <span key={idx} className={styles.breadcrumbSegment}>
                {idx > 0 && (
                  <ChevronRight
                    size={14}
                    strokeWidth={1.75}
                    className={styles.breadcrumbSeparator}
                    aria-hidden="true"
                  />
                )}
                {idx === breadcrumbSegments.length - 1 ? (
                  <span className={styles.breadcrumbCurrent} aria-current="page">
                    {seg}
                  </span>
                ) : (
                  <span>{seg}</span>
                )}
              </span>
            ))}
          </nav>
        )}
      </div>

      {/* Right: action buttons */}
      <div className={styles.right}>
        {/* Global search — expands from icon */}
        <div className={`${styles.searchWrapper} ${searchOpen ? styles.searchWrapperOpen : ''}`}>
          {searchOpen && (
            <div className={styles.searchBar}>
              <Search
                size={15}
                strokeWidth={1.75}
                className={styles.searchIcon}
                aria-hidden="true"
              />
              <input
                ref={searchRef}
                type="search"
                className={styles.searchInput}
                placeholder="Search…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                aria-label="Search"
              />
              <button
                type="button"
                className={styles.searchClose}
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQuery('');
                }}
                aria-label="Close search"
              >
                <X size={14} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          )}
          <button
            type="button"
            className={`${styles.iconBtn} ${searchOpen ? styles.iconBtnActive : ''}`}
            aria-label="Search"
            onClick={() => setSearchOpen((v) => !v)}
          >
            <Search size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        {/* Dark/light mode toggle */}
        <button
          type="button"
          className={styles.iconBtn}
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? (
            <Sun size={18} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Moon size={18} strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>

        {/* Notification bell — dropdown, not navigation */}
        <div className={styles.dropdownWrapper} ref={notifRef}>
          <button
            type="button"
            className={`${styles.iconBtn} ${notifOpen ? styles.iconBtnActive : ''}`}
            aria-label={
              unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
                : 'Notifications'
            }
            aria-haspopup="true"
            aria-expanded={notifOpen}
            onClick={() => setNotifOpen((v) => !v)}
          >
            <Bell size={18} strokeWidth={1.75} aria-hidden="true" />
            {unreadCount > 0 && (
              <span className={styles.badge} aria-hidden="true">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className={styles.notifDropdown} role="region" aria-label="Notifications">
              <div className={styles.notifHeader}>
                <span className={styles.notifTitle}>Notifications</span>
                {unreadCount > 0 && <span className={styles.notifBadge}>{unreadCount} new</span>}
              </div>
              <div className={styles.notifList}>
                {notifications.length === 0 ? (
                  <p className={styles.notifEmpty}>No notifications yet.</p>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`${styles.notifItem} ${!n.read ? styles.notifItemUnread : ''}`}
                    >
                      <p className={styles.notifMessage}>{n.message}</p>
                      <span className={styles.notifTime}>
                        {new Date(n.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User avatar + dropdown */}
        <div className={styles.dropdownWrapper} ref={dropdownRef}>
          <button
            type="button"
            className={styles.avatarBtn}
            onClick={() => setDropdownOpen((prev) => !prev)}
            aria-haspopup="true"
            aria-expanded={dropdownOpen}
            aria-label="User menu"
          >
            <div className={styles.avatar} aria-hidden="true">
              {initials}
            </div>
            <span className={styles.avatarName}>{displayName}</span>
            {roleLabel && <span className={styles.rolePill}>{roleLabel}</span>}
          </button>

          {dropdownOpen && (
            <div className={styles.dropdown} role="menu" aria-label="User menu options">
              <button
                type="button"
                className={styles.dropdownItem}
                role="menuitem"
                onClick={() => {
                  setDropdownOpen(false);
                  router.push('/profile');
                }}
              >
                <User size={16} strokeWidth={1.75} aria-hidden="true" />
                Profile
              </button>
              <button
                type="button"
                className={styles.dropdownItem}
                role="menuitem"
                onClick={() => {
                  setDropdownOpen(false);
                  router.push('/settings');
                }}
              >
                <Settings size={16} strokeWidth={1.75} aria-hidden="true" />
                Settings
              </button>
              <div className={styles.dropdownDivider} role="separator" />
              <button
                type="button"
                className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
                role="menuitem"
                onClick={() => void handleLogout()}
              >
                <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Type-only re-export of `IUserPublic` for consumers that import from this
 * module — avoids a direct dependency on `@kwasu-ams/types` in test files.
 *
 * @internal
 */
export type { IUserPublic };
