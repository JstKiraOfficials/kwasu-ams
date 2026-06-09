/**
 * @file Sidebar.tsx
 * @module components/layout/Sidebar
 *
 * Application sidebar component. Renders the KWASU AMS logo, role-scoped
 * navigation items, and a collapse toggle button. In collapsed mode the
 * sidebar shrinks to icon-only width (72 px) with tooltips on hover.
 *
 * Navigation items are driven by `NAV_CONFIG`, a static map keyed by `Role`.
 * Active items are determined by comparing the current pathname against each
 * item's `href`. The component is always rendered on a dark background
 * (`--color-sidebar-bg`) regardless of the app's light/dark mode.
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Award,
  Bell,
  HelpCircle,
  Users,
  BookOpen,
  AlertTriangle,
  Building2,
  GraduationCap,
  FileText,
  BarChart3,
  Map,
  Settings,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  School,
  UserCheck,
} from 'lucide-react';
import { Role } from '@kwasu-ams/types';
import styles from './Sidebar.module.css';

// ── Nav item type ──────────────────────────────────────────────────────────

/**
 * A single navigation entry in the sidebar.
 */
interface NavItem {
  /** Display label shown next to the icon. */
  label: string;
  /** Route this item links to. */
  href: string;
  /** Lucide icon component to render. */
  icon: React.ElementType;
}

/**
 * A labelled group of nav items displayed under a section heading.
 */
interface NavSection {
  /** Optional section heading (e.g. "Management"). `undefined` = no label. */
  title?: string;
  /** Items belonging to this section. */
  items: NavItem[];
}

// ── Nav configuration — keyed by Role ─────────────────────────────────────

/**
 * Role-to-navigation mapping.
 *
 * Each role receives an ordered array of `NavSection` groups. Items are
 * rendered in declaration order. Universal links (Notifications, Support)
 * are included for every role.
 */
const NAV_CONFIG: Record<Role, NavSection[]> = {
  [Role.STUDENT]: [
    {
      items: [
        { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { label: 'Attendance', href: '/attendance', icon: ClipboardList },
        { label: 'Calendar', href: '/calendar', icon: CalendarDays },
        { label: 'Excuses', href: '/excuses', icon: FileText },
        { label: 'Eligibility', href: '/eligibility', icon: Award },
      ],
    },
    {
      title: 'General',
      items: [
        { label: 'Notifications', href: '/notifications', icon: Bell },
        { label: 'Support', href: '/support', icon: HelpCircle },
      ],
    },
  ],
  [Role.LECTURER]: [
    {
      items: [
        { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { label: 'Sessions', href: '/sessions', icon: CalendarDays },
        { label: 'Courses', href: '/courses', icon: BookOpen },
        { label: 'Students at Risk', href: '/students-at-risk', icon: AlertTriangle },
        { label: 'Excuses', href: '/excuses/review', icon: FileText },
        { label: 'Calendar', href: '/calendar', icon: CalendarDays },
      ],
    },
    {
      title: 'General',
      items: [
        { label: 'Notifications', href: '/notifications', icon: Bell },
        { label: 'Support', href: '/support', icon: HelpCircle },
      ],
    },
  ],
  [Role.HOD]: [
    {
      items: [
        { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { label: 'Department', href: '/department', icon: Building2 },
        { label: 'Lecturers', href: '/department?tab=lecturers', icon: Users },
        { label: 'Courses', href: '/department?tab=courses', icon: BookOpen },
        { label: 'Excuses', href: '/excuses/review', icon: FileText },
        { label: 'Eligibility', href: '/eligibility/staff', icon: Award },
        { label: 'Early Intervention', href: '/department?tab=intervention', icon: UserCheck },
        { label: 'Reports', href: '/reports', icon: BarChart3 },
      ],
    },
    {
      title: 'General',
      items: [
        { label: 'Notifications', href: '/notifications', icon: Bell },
        { label: 'Support', href: '/support', icon: HelpCircle },
      ],
    },
  ],
  [Role.DEAN]: [
    {
      items: [
        { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { label: 'Faculty', href: '/faculty', icon: School },
        { label: 'Departments', href: '/faculty?tab=departments', icon: Building2 },
        { label: 'Eligibility', href: '/eligibility/staff', icon: Award },
        { label: 'Analytics', href: '/analytics', icon: BarChart3 },
        { label: 'Reports', href: '/reports', icon: FileText },
      ],
    },
    {
      title: 'General',
      items: [
        { label: 'Notifications', href: '/notifications', icon: Bell },
        { label: 'Support', href: '/support', icon: HelpCircle },
      ],
    },
  ],
  [Role.EXAM_OFFICER]: [
    {
      items: [
        { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { label: 'Eligibility', href: '/eligibility/staff', icon: Award },
        { label: 'Clearance', href: '/clearance', icon: ShieldCheck },
        { label: 'Reports', href: '/reports', icon: FileText },
      ],
    },
    {
      title: 'General',
      items: [
        { label: 'Notifications', href: '/notifications', icon: Bell },
        { label: 'Support', href: '/support', icon: HelpCircle },
      ],
    },
  ],
  [Role.ACADEMIC_AFFAIRS]: [
    {
      title: 'Management',
      items: [
        { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { label: 'Sessions', href: '/admin/academic?tab=sessions', icon: CalendarDays },
        { label: 'Venues', href: '/admin/academic?tab=venues', icon: Building2 },
        { label: 'Timetable', href: '/admin/academic?tab=timetable', icon: ClipboardList },
        { label: 'Courses', href: '/admin/academic?tab=courses', icon: BookOpen },
        { label: 'Departments', href: '/admin/academic?tab=departments', icon: Building2 },
        { label: 'Faculties', href: '/admin/academic?tab=faculties', icon: School },
        { label: 'Programmes', href: '/admin/academic?tab=programmes', icon: GraduationCap },
      ],
    },
    {
      title: 'Oversight',
      items: [
        { label: 'Analytics', href: '/analytics', icon: BarChart3 },
        { label: 'Reports', href: '/reports', icon: FileText },
        { label: 'NUC Compliance', href: '/admin/academic?tab=nuc', icon: ShieldCheck },
        { label: 'Audit Log', href: '/admin/academic?tab=audit', icon: ClipboardList },
      ],
    },
    {
      title: 'General',
      items: [
        { label: 'Notifications', href: '/notifications', icon: Bell },
        { label: 'Support', href: '/support', icon: HelpCircle },
      ],
    },
  ],
  [Role.VICE_CHANCELLOR]: [
    {
      items: [
        { label: 'Executive Overview', href: '/executive', icon: LayoutDashboard },
        { label: 'Analytics', href: '/executive/analytics', icon: BarChart3 },
        { label: 'Reports', href: '/reports', icon: FileText },
        { label: 'Live Map', href: '/map', icon: Map },
      ],
    },
    {
      title: 'General',
      items: [
        { label: 'Notifications', href: '/notifications', icon: Bell },
        { label: 'Support', href: '/support', icon: HelpCircle },
      ],
    },
  ],
  [Role.SUPER_ADMIN]: [
    {
      title: 'Administration',
      items: [
        { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { label: 'Users', href: '/admin?tab=users', icon: Users },
        { label: 'Sessions', href: '/admin?tab=sessions', icon: CalendarDays },
        { label: 'Venues', href: '/admin/academic?tab=venues', icon: Building2 },
        { label: 'Timetable', href: '/admin/academic?tab=timetable', icon: ClipboardList },
        { label: 'Courses', href: '/admin/academic?tab=courses', icon: BookOpen },
        { label: 'Departments', href: '/admin/academic?tab=departments', icon: Building2 },
        { label: 'Faculties', href: '/admin/academic?tab=faculties', icon: School },
        { label: 'Programmes', href: '/admin/academic?tab=programmes', icon: GraduationCap },
        { label: 'Academic Sessions', href: '/admin?tab=settings', icon: Briefcase },
      ],
    },
    {
      title: 'Oversight',
      items: [
        { label: 'Analytics', href: '/analytics', icon: BarChart3 },
        { label: 'Reports', href: '/reports', icon: FileText },
        { label: 'Live Map', href: '/map', icon: Map },
        { label: 'Anomalies', href: '/admin?tab=anomalies', icon: AlertTriangle },
        { label: 'Audit Log', href: '/admin?tab=audit', icon: ClipboardList },
        { label: 'Webhooks', href: '/admin?tab=webhooks', icon: Settings },
        { label: 'Settings', href: '/admin?tab=settings', icon: Settings },
      ],
    },
    {
      title: 'General',
      items: [
        { label: 'Notifications', href: '/notifications', icon: Bell },
        { label: 'Support', href: '/support', icon: HelpCircle },
      ],
    },
  ],
};

// ── Props ──────────────────────────────────────────────────────────────────

/**
 * Props accepted by the `Sidebar` component.
 */
interface SidebarProps {
  /** The authenticated user's role — determines which nav items are shown. */
  role: Role;
  /** When `true`, the sidebar renders in icon-only (72 px) mode. */
  collapsed: boolean;
  /** Callback invoked when the user clicks the collapse toggle button. */
  onToggleCollapse: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

/**
 * Application sidebar.
 *
 * Renders the KWASU logo, role-scoped navigation sections, and a collapse
 * toggle. Active route detection uses the current Next.js pathname.
 * In collapsed mode (`collapsed === true`) labels and section headings are
 * hidden; a tooltip appears on item hover to preserve discoverability.
 *
 * @param props - `SidebarProps` containing `role`, `collapsed`, and `onToggleCollapse`.
 * @returns The sidebar JSX element.
 */
export function Sidebar({ role, collapsed, onToggleCollapse }: SidebarProps): React.JSX.Element {
  const pathname = usePathname();
  const sections = NAV_CONFIG[role] ?? [];

  /**
   * Returns `true` when the given href matches the current pathname.
   * Query-string portions are ignored for the active-check on tab-based routes.
   *
   * @param href - The nav item's target href.
   * @returns Whether the nav item should be styled as active.
   */
  function isActive(href: string): boolean {
    const [path = ''] = href.split('?');
    return pathname === path || (path !== '/' && pathname.startsWith(path));
  }

  return (
    <div className={styles.sidebar}>
      {/* Logo */}
      <div className={styles.logoArea}>
        <div className={styles.logoMark} aria-hidden="true">
          KA
        </div>
        <div className={`${styles.logoText} ${collapsed ? styles.logoTextCollapsed : ''}`}>
          <span className={styles.logoName}>KWASU AMS</span>
          <span className={styles.logoSub}>Attendance System</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className={styles.nav} aria-label="Main navigation">
        {sections.map((section, sectionIdx) => (
          <div key={sectionIdx}>
            {sectionIdx > 0 && <div className={styles.divider} role="separator" />}

            {section.title && (
              <span
                className={`${styles.sectionLabel} ${collapsed ? styles.sectionLabelCollapsed : ''}`}
                aria-hidden={collapsed}
              >
                {section.title}
              </span>
            )}

            {section.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className={styles.navIcon} aria-hidden="true">
                    <Icon size={18} strokeWidth={1.75} />
                  </span>
                  <span
                    className={`${styles.navLabel} ${collapsed ? styles.navLabelCollapsed : ''}`}
                  >
                    {item.label}
                  </span>
                  {/* Tooltip visible only in collapsed mode */}
                  {collapsed && (
                    <span className={styles.tooltip} role="tooltip">
                      {item.label}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        type="button"
        className={styles.collapseBtn}
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <>
            <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
            <span className={styles.collapseBtnLabel}>Collapse</span>
          </>
        )}
      </button>
    </div>
  );
}
