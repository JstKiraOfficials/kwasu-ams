'use client';

/**
 * @file ExamOfficerDashboard.tsx
 * @module components/dashboard/ExamOfficerDashboard
 *
 * Dashboard for Exam Officers. Shows four stats cards (total, eligible, barred,
 * pending appeals), quick actions, a barred courses table, and a pending
 * appeals list.
 */

import type { ReactElement } from 'react';
import {
  Users,
  CheckCircle,
  XCircle,
  Clock,
  ClipboardList,
  Download,
  FileCheck,
} from 'lucide-react';
import { useDashboard } from '../../hooks/use-dashboard';
import { StatsCard } from './StatsCard';
import { QuickActionGrid, type QuickAction } from './QuickActionGrid';
import styles from './ExamOfficerDashboard.module.css';

/** Quick actions for Exam Officers. */
const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Review Eligibility',
    icon: <ClipboardList size={24} />,
    href: '/eligibility',
    description: 'Review and update student eligibility.',
  },
  {
    label: 'Generate Clearance',
    icon: <FileCheck size={24} />,
    href: '/reports/clearance',
    description: 'Generate exam clearance lists.',
  },
  {
    label: 'Export Reports',
    icon: <Download size={24} />,
    href: '/reports',
    description: 'Download eligibility summary reports.',
  },
];

/**
 * Exam Officer dashboard component.
 *
 * Renders:
 * 1. Stats: total students, eligible, barred, pending appeals.
 * 2. Quick actions.
 * 3. Barred courses table.
 * 4. Pending appeals list.
 *
 * @returns The rendered exam officer dashboard element.
 */
export function ExamOfficerDashboard(): ReactElement {
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

  const barred = data?.barredCourses2 ?? [];
  const appeals = data?.pendingAppeals ?? [];

  return (
    <div className={styles.page}>
      {/* Stats */}
      <section className={styles.statsGrid} aria-label="Eligibility statistics">
        <StatsCard
          title="Total Students"
          value={data?.totalStudentsCount ?? 0}
          icon={<Users size={16} />}
          index={0}
        />
        <StatsCard
          title="Eligible"
          value={data?.eligibleCount ?? 0}
          icon={<CheckCircle size={16} />}
          variant="success"
          index={1}
        />
        <StatsCard
          title="Barred"
          value={data?.barredCount ?? 0}
          icon={<XCircle size={16} />}
          variant={(data?.barredCount ?? 0) > 0 ? 'danger' : 'default'}
          index={2}
        />
        <StatsCard
          title="Pending Appeals"
          value={data?.pendingAppealsCount ?? 0}
          icon={<Clock size={16} />}
          variant={(data?.pendingAppealsCount ?? 0) > 0 ? 'warning' : 'default'}
          index={3}
        />
      </section>

      {/* Quick actions */}
      <section aria-labelledby="exam-actions-heading">
        <h2 id="exam-actions-heading" className={styles.sectionTitle}>
          Quick Actions
        </h2>
        <QuickActionGrid actions={QUICK_ACTIONS} />
      </section>

      {/* Barred courses */}
      {barred.length > 0 && (
        <section aria-labelledby="barred-heading">
          <h2 id="barred-heading" className={styles.sectionTitle}>
            Barred Courses
          </h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Barred</th>
                  <th>Conditional</th>
                </tr>
              </thead>
              <tbody>
                {barred.map((c) => (
                  <tr key={c.courseCode}>
                    <td>
                      <span className={styles.code}>{c.courseCode}</span>
                      <br />
                      <span className={styles.subtext}>{c.courseTitle}</span>
                    </td>
                    <td className={styles.danger}>{c.barredStudents}</td>
                    <td className={styles.warn}>{c.conditionalStudents}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Pending appeals */}
      {appeals.length > 0 && (
        <section aria-labelledby="appeals-heading">
          <h2 id="appeals-heading" className={styles.sectionTitle}>
            Pending Appeals
          </h2>
          <div className={styles.appealsList} role="list">
            {appeals.map((a) => (
              <div key={a.appealId} className={styles.appealRow} role="listitem">
                <div className={styles.appealInfo}>
                  <span className={styles.appealName}>{a.studentName}</span>
                  <span className={styles.appealCourse}>{a.courseCode}</span>
                </div>
                <span className={styles.appealDate}>
                  {new Date(a.submittedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
