'use client';

/**
 * @file SuperAdminDashboard.tsx
 * @module components/dashboard/SuperAdminDashboard
 *
 * Dashboard for Super Admins. Shows five stats cards, quick actions, a recent
 * audit log table (last 10 entries), and a faculty breakdown bar chart.
 */

import type { ReactElement } from 'react';
import {
  Users,
  Activity,
  AlertTriangle,
  Webhook,
  Clock,
  UserCog,
  Settings,
  ClipboardList,
  Link2,
  BarChart2,
  Building2,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useDashboard } from '../../hooks/use-dashboard';
import { StatsCard } from './StatsCard';
import { QuickActionGrid, type QuickAction } from './QuickActionGrid';
import styles from './SuperAdminDashboard.module.css';

/** Quick actions for Super Admins. */
const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'User Management',
    icon: <UserCog size={24} />,
    href: '/admin/users',
    description: 'Create, edit, and deactivate user accounts.',
  },
  {
    label: 'System Settings',
    icon: <Settings size={24} />,
    href: '/admin/settings',
    description: 'Configure system-wide settings.',
  },
  {
    label: 'Audit Log',
    icon: <ClipboardList size={24} />,
    href: '/audit',
    description: 'View the complete system audit trail.',
  },
  {
    label: 'Webhooks',
    icon: <Link2 size={24} />,
    href: '/admin/webhooks',
    description: 'Manage outbound webhook endpoints.',
  },
  {
    label: 'Anomalies',
    icon: <AlertTriangle size={24} />,
    href: '/anomalies',
    description: 'Review flagged attendance anomalies.',
  },
];

/**
 * Returns a CSS colour variable for a bar chart cell based on attendance rate.
 *
 * @param rate - Attendance rate (0–100).
 * @returns CSS `var()` string for the matching threshold colour.
 */
function barColour(rate: number): string {
  if (rate >= 80) return 'var(--color-att-safe)';
  if (rate >= 75) return 'var(--color-att-warning)';
  return 'var(--color-att-danger)';
}

/**
 * Super Admin dashboard component.
 *
 * Renders:
 * 1. Stats: total users, active sessions, pending anomalies, webhook events today, system uptime.
 * 2. Quick action grid.
 * 3. Recent audit log (last 10 entries).
 * 4. Faculty breakdown bar chart.
 *
 * @returns The rendered super admin dashboard element.
 */
export function SuperAdminDashboard(): ReactElement {
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

  const logs = data?.recentAuditLogs ?? [];
  const faculties = (data?.facultyBreakdown ?? [])
    .map((f) => ({ ...f, avgRate: f.avgRate ?? 0 }))
    .sort((a, b) => b.avgRate - a.avgRate);

  return (
    <div className={styles.page}>
      {/* Stats */}
      <section className={styles.statsGrid} aria-label="System statistics">
        <StatsCard
          title="Total Users"
          value={data?.totalUsers ?? 0}
          icon={<Users size={16} />}
          index={0}
        />
        <StatsCard
          title="Students"
          value={data?.totalStudents ?? 0}
          icon={<Users size={16} />}
          index={1}
        />
        <StatsCard
          title="Staff"
          value={data?.totalStaff ?? 0}
          icon={<Users size={16} />}
          index={2}
        />
        <StatsCard
          title="Faculties"
          value={data?.totalFaculties ?? 0}
          icon={<Building2 size={16} />}
          index={3}
        />
        <StatsCard
          title="Departments"
          value={data?.totalDepartments ?? 0}
          icon={<Building2 size={16} />}
          index={4}
        />
        <StatsCard
          title="Active Sessions"
          value={data?.activeSessionsNow ?? 0}
          icon={<Activity size={16} />}
          variant={(data?.activeSessionsNow ?? 0) > 0 ? 'success' : 'default'}
          index={5}
        />
        <StatsCard
          title="Pending Anomalies"
          value={data?.pendingAnomalies ?? 0}
          icon={<AlertTriangle size={16} />}
          variant={(data?.pendingAnomalies ?? 0) > 0 ? 'warning' : 'default'}
          index={6}
        />
        <StatsCard
          title="Webhook Events Today"
          value={data?.webhookEventsToday ?? 0}
          icon={<Webhook size={16} />}
          index={7}
        />
        <StatsCard
          title="System Uptime"
          value={data?.systemUptime ?? '—'}
          icon={<Clock size={16} />}
          variant="success"
          index={8}
        />
      </section>

      {/* Quick actions */}
      <section aria-labelledby="sa-actions-heading">
        <h2 id="sa-actions-heading" className={styles.sectionTitle}>
          Quick Actions
        </h2>
        <QuickActionGrid actions={QUICK_ACTIONS} />
      </section>

      {/* Recent audit log */}
      {logs.length > 0 && (
        <section aria-labelledby="audit-heading">
          <h2 id="audit-heading" className={styles.sectionTitle}>
            Recent Audit Log
            <a href="/audit" className={styles.viewAll}>
              View all →
            </a>
          </h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Actor</th>
                  <th>ID</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{log.actorName}</td>
                    <td className={styles.identifier}>{log.actorIdentifier}</td>
                    <td>
                      <span className={styles.action}>{log.action}</span>
                    </td>
                    <td>{log.entityType}</td>
                    <td className={styles.timestamp}>{new Date(log.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Faculty chart */}
      {faculties.length > 0 && (
        <section aria-labelledby="sa-faculty-chart">
          <h2 id="sa-faculty-chart" className={styles.sectionTitle}>
            Faculty Attendance
          </h2>
          <div className={styles.chartContainer}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={faculties} margin={{ top: 4, right: 8, bottom: 40, left: -16 }}>
                <XAxis
                  dataKey="facultyName"
                  tick={{ fontSize: 10 }}
                  angle={-30}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v: number) => [`${(v ?? 0).toFixed(1)}%`]} />
                <Bar dataKey="avgRate" radius={[4, 4, 0, 0]}>
                  {faculties.map((f) => (
                    <Cell key={f.facultyId} fill={barColour(f.avgRate)} />
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
