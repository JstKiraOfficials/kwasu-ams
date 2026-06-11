'use client';

/**
 * @file HodDashboard.tsx
 * @module components/dashboard/HodDashboard
 *
 * Dashboard for Heads of Department. Shows four stats cards, quick actions,
 * a course performance DataTable, and lecturer accountability list.
 */

import type { ReactElement } from 'react';
import {
  BookOpen,
  Users,
  TrendingUp,
  AlertTriangle,
  BarChart2,
  FileText,
  Bell,
  FileBarChart,
} from 'lucide-react';
import { useDashboard } from '../../hooks/use-dashboard';
import { StatsCard } from './StatsCard';
import { QuickActionGrid, type QuickAction } from './QuickActionGrid';
import styles from './HodDashboard.module.css';

/** Quick actions for HOD. */
const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Department Portal',
    icon: <BarChart2 size={24} />,
    href: '/analytics',
    description: 'Full department attendance analytics.',
  },
  {
    label: 'Early Intervention',
    icon: <Bell size={24} />,
    href: '/notifications',
    description: 'Warn at-risk students in bulk.',
  },
  {
    label: 'Excuse Queue',
    icon: <FileText size={24} />,
    href: '/excuses',
    description: 'Review escalated excuse letters.',
  },
  {
    label: 'Reports',
    icon: <FileBarChart size={24} />,
    href: '/reports',
    description: 'Generate department attendance reports.',
  },
];

/**
 * HOD dashboard component.
 *
 * Fetches `GET /dashboard` and renders:
 * 1. Stats row: courses, students, avg rate, at-risk count.
 * 2. Quick action grid.
 * 3. Course performance table.
 * 4. Lecturer accountability list.
 *
 * @returns The rendered HOD dashboard element.
 */
export function HodDashboard(): ReactElement {
  const { data, isLoading, error, refetch } = useDashboard();

  if (isLoading) return <div className={styles.skeleton} aria-busy="true" />;
  if (error) {
    return (
      <div className={styles.error} role="alert">
        <p>Failed to load dashboard.</p>
        <button
          type="button"
          onClick={() => {
            void refetch();
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  const courses = data?.coursePerformance ?? [];
  const lecturers = data?.lecturerAccountability ?? [];

  return (
    <div className={styles.page}>
      {/* Stats */}
      <section className={styles.statsGrid} aria-label="Department statistics">
        <StatsCard
          title="Courses"
          value={data?.courseCount ?? 0}
          icon={<BookOpen size={16} />}
          index={0}
        />
        <StatsCard
          title="Students"
          value={data?.totalStudents ?? 0}
          icon={<Users size={16} />}
          index={1}
        />
        <StatsCard
          title="Dept Avg Rate"
          value={`${(data?.departmentAvgRate ?? 0).toFixed(1)}%`}
          icon={<TrendingUp size={16} />}
          variant={(data?.departmentAvgRate ?? 0) >= 75 ? 'success' : 'warning'}
          index={2}
        />
        <StatsCard
          title="At Risk"
          value={data?.atRiskCount ?? 0}
          icon={<AlertTriangle size={16} />}
          variant={(data?.atRiskCount ?? 0) > 0 ? 'danger' : 'default'}
          index={3}
        />
      </section>

      {/* Quick actions */}
      <section aria-labelledby="hod-actions-heading">
        <h2 id="hod-actions-heading" className={styles.sectionTitle}>
          Quick Actions
        </h2>
        <QuickActionGrid actions={QUICK_ACTIONS} />
      </section>

      {/* Course performance table */}
      {courses.length > 0 && (
        <section aria-labelledby="course-perf-heading">
          <h2 id="course-perf-heading" className={styles.sectionTitle}>
            Course Performance
          </h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Lecturer</th>
                  <th>Rate</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.courseCode}>
                    <td>
                      <span className={styles.code}>{c.courseCode}</span>
                      <br />
                      <span className={styles.subtext}>{c.courseTitle}</span>
                    </td>
                    <td>{c.lecturerName}</td>
                    <td
                      className={
                        c.rate >= 80 ? styles.safe : c.rate >= 75 ? styles.warn : styles.danger
                      }
                    >
                      {(c.rate ?? 0).toFixed(1)}%
                    </td>
                    <td>
                      <span className={`${styles.trendBadge} ${styles[c.trend]}`}>
                        {c.trend === 'up' ? '↑' : c.trend === 'down' ? '↓' : '→'} {c.trend}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Lecturer accountability */}
      {lecturers.length > 0 && (
        <section aria-labelledby="accountability-heading">
          <h2 id="accountability-heading" className={styles.sectionTitle}>
            Lecturer Accountability
          </h2>
          <div className={styles.accountabilityList} role="list">
            {lecturers.map((l) => (
              <div key={l.lecturerId} className={styles.accountabilityRow} role="listitem">
                <span className={styles.lecturerName}>{l.lecturerName}</span>
                <span className={styles.sessions}>
                  {l.sessionsHeld}/{l.sessionsScheduled} sessions
                </span>
                <span
                  className={`${styles.badge} ${l.accountabilityPct >= 80 ? styles.safe : l.accountabilityPct >= 60 ? styles.warn : styles.danger}`}
                >
                  {(l.accountabilityPct ?? 0).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
