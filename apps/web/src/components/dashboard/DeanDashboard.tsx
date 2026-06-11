'use client';

/**
 * @file DeanDashboard.tsx
 * @module components/dashboard/DeanDashboard
 *
 * Dashboard for Deans. Shows four stats cards, quick actions, a department
 * breakdown table, and a recharts BarChart comparing department rates.
 */

import type { ReactElement } from 'react';
import { Building2, Users, TrendingUp, BarChart2, FileBarChart, Layers } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useDashboard } from '../../hooks/use-dashboard';
import { StatsCard } from './StatsCard';
import { QuickActionGrid, type QuickAction } from './QuickActionGrid';
import styles from './DeanDashboard.module.css';

/** Quick actions available to Deans. */
const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Faculty Portal',
    icon: <BarChart2 size={24} />,
    href: '/analytics',
    description: 'Full faculty attendance analytics.',
  },
  {
    label: 'Dept Comparison',
    icon: <Layers size={24} />,
    href: '/analytics/departments',
    description: 'Compare department performance.',
  },
  {
    label: 'Reports',
    icon: <FileBarChart size={24} />,
    href: '/reports',
    description: 'Generate faculty attendance reports.',
  },
];

/**
 * Returns a CSS colour variable string based on an attendance rate.
 *
 * @param rate - Attendance rate (0–100).
 * @returns A CSS `var()` string for the appropriate attendance colour.
 */
function barColour(rate: number): string {
  if (rate >= 80) return 'var(--color-att-safe)';
  if (rate >= 75) return 'var(--color-att-warning)';
  return 'var(--color-att-danger)';
}

/**
 * Dean dashboard component.
 *
 * Renders:
 * 1. Stats row: departments, courses, students, faculty avg rate.
 * 2. Quick action grid.
 * 3. Department breakdown table.
 * 4. Department comparison bar chart.
 *
 * @returns The rendered dean dashboard element.
 */
export function DeanDashboard(): ReactElement {
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

  const depts = (data?.departmentBreakdown ?? []).sort((a, b) => b.avgRate - a.avgRate);

  return (
    <div className={styles.page}>
      {/* Stats */}
      <section className={styles.statsGrid} aria-label="Faculty statistics">
        <StatsCard
          title="Departments"
          value={data?.departmentCount ?? 0}
          icon={<Building2 size={16} />}
          index={0}
        />
        <StatsCard
          title="Courses"
          value={data?.courseCount ?? 0}
          icon={<Layers size={16} />}
          index={1}
        />
        <StatsCard
          title="Students"
          value={data?.totalStudents ?? 0}
          icon={<Users size={16} />}
          index={2}
        />
        <StatsCard
          title="Faculty Avg Rate"
          value={`${(data?.facultyAvgRate ?? 0).toFixed(1)}%`}
          icon={<TrendingUp size={16} />}
          variant={(data?.facultyAvgRate ?? 0) >= 75 ? 'success' : 'warning'}
          index={3}
        />
      </section>

      {/* Quick actions */}
      <section aria-labelledby="dean-actions-heading">
        <h2 id="dean-actions-heading" className={styles.sectionTitle}>
          Quick Actions
        </h2>
        <QuickActionGrid actions={QUICK_ACTIONS} />
      </section>

      {/* Department table */}
      {depts.length > 0 && (
        <section aria-labelledby="dept-table-heading">
          <h2 id="dept-table-heading" className={styles.sectionTitle}>
            Department Breakdown
          </h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Avg Rate</th>
                  <th>Students</th>
                </tr>
              </thead>
              <tbody>
                {depts.map((d) => (
                  <tr key={d.departmentId}>
                    <td>{d.departmentName}</td>
                    <td
                      className={
                        d.avgRate >= 80
                          ? styles.safe
                          : d.avgRate >= 75
                            ? styles.warn
                            : styles.danger
                      }
                    >
                      {d.avgRate.toFixed(1)}%
                    </td>
                    <td>{d.studentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Bar chart */}
      {depts.length > 0 && (
        <section aria-labelledby="dept-chart-heading">
          <h2 id="dept-chart-heading" className={styles.sectionTitle}>
            Attendance by Department
          </h2>
          <div className={styles.chartContainer}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={depts} margin={{ top: 4, right: 8, bottom: 40, left: -16 }}>
                <XAxis
                  dataKey="departmentName"
                  tick={{ fontSize: 10 }}
                  angle={-30}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`]} />
                <Bar dataKey="avgRate" radius={[4, 4, 0, 0]}>
                  {depts.map((d) => (
                    <Cell key={d.departmentId} fill={barColour(d.avgRate)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
}
