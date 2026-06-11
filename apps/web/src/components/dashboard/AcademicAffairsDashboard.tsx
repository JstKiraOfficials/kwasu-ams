'use client';

/**
 * @file AcademicAffairsDashboard.tsx
 * @module components/dashboard/AcademicAffairsDashboard
 *
 * Dashboard for Academic Affairs officers. Shows five stats cards (with live
 * active session count via WebSocket), quick actions, a faculty attendance bar
 * chart, and a flagged courses table (< 60% attendance).
 */

import { useState, useCallback, type ReactElement } from 'react';
import {
  Activity,
  TrendingUp,
  Building2,
  AlertTriangle,
  Users,
  BarChart2,
  Map,
  Calendar,
  FileBarChart,
  ClipboardList,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useDashboard } from '../../hooks/use-dashboard';
import { useWebSocket } from '../../hooks/use-websocket';
import { StatsCard } from './StatsCard';
import { QuickActionGrid, type QuickAction } from './QuickActionGrid';
import styles from './AcademicAffairsDashboard.module.css';

/** Quick actions for Academic Affairs. */
const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Manage Sessions',
    icon: <Calendar size={24} />,
    href: '/sessions',
    description: 'View and manage all active sessions.',
  },
  {
    label: 'Venues',
    icon: <Map size={24} />,
    href: '/venues',
    description: 'Manage lecture venues and geofences.',
  },
  {
    label: 'Timetable',
    icon: <BarChart2 size={24} />,
    href: '/timetable',
    description: 'View and update the academic timetable.',
  },
  {
    label: 'NUC Report',
    icon: <FileBarChart size={24} />,
    href: '/reports/nuc',
    description: 'Generate NUC compliance attendance report.',
  },
  {
    label: 'Audit Log',
    icon: <ClipboardList size={24} />,
    href: '/audit',
    description: 'View the system-wide audit trail.',
  },
];

/**
 * Returns a CSS colour variable based on an attendance rate.
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
 * Academic Affairs dashboard component.
 *
 * Renders:
 * 1. Stats: active sessions (live), university rate, faculties, flagged courses, students.
 * 2. Quick action grid.
 * 3. Faculty attendance bar chart.
 * 4. Flagged courses table (< 60% attendance).
 *
 * @returns The rendered academic affairs dashboard element.
 */
export function AcademicAffairsDashboard(): ReactElement {
  const { data, isLoading, error, refetch } = useDashboard();
  const [liveActiveSessions, setLiveActiveSessions] = useState<number | null>(null);

  /**
   * Updates live active session count from WebSocket events.
   *
   * @param event - Parsed WebSocket message payload.
   */
  const handleWsEvent = useCallback((event: unknown): void => {
    const e = event as Record<string, unknown>;
    if (typeof e?.activeSessionsNow === 'number') {
      setLiveActiveSessions(e.activeSessionsNow);
    }
  }, []);

  useWebSocket({ path: '/ws/dashboard', onMessage: handleWsEvent, enabled: !!data });

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

  const activeSessions = liveActiveSessions ?? data?.activeSessionsNow ?? 0;
  const faculties = (data?.facultyBreakdown ?? [])
    .map((f) => ({ ...f, avgRate: f.avgRate ?? 0 }))
    .sort((a, b) => b.avgRate - a.avgRate);
  const flagged = data?.flaggedCourses ?? [];

  return (
    <div className={styles.page}>
      {/* Stats */}
      <section className={styles.statsGrid} aria-label="University statistics">
        <StatsCard
          title="Active Sessions"
          value={activeSessions}
          icon={<Activity size={16} />}
          variant={activeSessions > 0 ? 'success' : 'default'}
          index={0}
          subtitle="Live"
        />
        <StatsCard
          title="University Rate"
          value={`${(data?.universityRate ?? 0).toFixed(1)}%`}
          icon={<TrendingUp size={16} />}
          variant={(data?.universityRate ?? 0) >= 75 ? 'success' : 'warning'}
          index={1}
        />
        <StatsCard
          title="Faculties"
          value={data?.totalFaculties ?? 0}
          icon={<Building2 size={16} />}
          index={2}
        />
        <StatsCard
          title="Flagged Courses"
          value={flagged.length}
          icon={<AlertTriangle size={16} />}
          variant={flagged.length > 0 ? 'warning' : 'default'}
          index={3}
        />
        <StatsCard
          title="Total Students"
          value={data?.totalStudentsCount ?? 0}
          icon={<Users size={16} />}
          index={4}
        />
      </section>

      {/* Quick actions */}
      <section aria-labelledby="aa-actions-heading">
        <h2 id="aa-actions-heading" className={styles.sectionTitle}>
          Quick Actions
        </h2>
        <QuickActionGrid actions={QUICK_ACTIONS} />
      </section>

      {/* Faculty bar chart */}
      {faculties.length > 0 && (
        <section aria-labelledby="faculty-chart-heading">
          <h2 id="faculty-chart-heading" className={styles.sectionTitle}>
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

      {/* Flagged courses */}
      {flagged.length > 0 && (
        <section aria-labelledby="flagged-heading">
          <h2 id="flagged-heading" className={styles.sectionTitle}>
            Flagged Courses (&lt; 60%)
          </h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Department</th>
                  <th>Lecturer</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {flagged.map((c) => (
                  <tr key={c.courseCode}>
                    <td>
                      <span className={styles.code}>{c.courseCode}</span>
                      <br />
                      <span className={styles.subtext}>{c.courseTitle}</span>
                    </td>
                    <td>{c.departmentName}</td>
                    <td>{c.lecturerName}</td>
                    <td className={styles.danger}>{(c.rate ?? 0).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
