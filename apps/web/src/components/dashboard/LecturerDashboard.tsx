'use client';

/**
 * @file LecturerDashboard.tsx
 * @module components/dashboard/LecturerDashboard
 *
 * Dashboard for lecturers. Shows an active session banner, four stats cards,
 * quick actions, a per-course attendance trend chart (recharts LineChart),
 * and the at-risk students widget. Active session count updates via WebSocket.
 */

import { useState, useCallback, type ReactElement } from 'react';
import { Users, TrendingUp, AlertTriangle, Play, FileText } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useDashboard } from '../../hooks/use-dashboard';
import { useWebSocket } from '../../hooks/use-websocket';
import { StatsCard } from './StatsCard';
import { QuickActionGrid, type QuickAction } from './QuickActionGrid';
import { AtRiskWidget } from './AtRiskWidget';
import { ActiveSessionBanner } from './ActiveSessionBanner';
import styles from './LecturerDashboard.module.css';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Quick actions available to lecturers.
 * Each entry navigates to the relevant app route.
 */
const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Start Session',
    icon: <Play size={24} />,
    href: '/sessions/new',
    description: 'Open a new attendance session for your class.',
  },
  {
    label: 'Review Excuses',
    icon: <FileText size={24} />,
    href: '/excuses',
    description: 'Approve or reject pending excuse letters.',
  },
  {
    label: 'Students at Risk',
    icon: <AlertTriangle size={24} />,
    href: '/attendance',
    description: 'View and warn students below 75%.',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Lecturer dashboard component.
 *
 * Fetches `GET /dashboard` every 60 seconds and connects to
 * `WS /ws/dashboard` for live session count updates.
 *
 * Renders:
 * 1. Active session banner (if a session is ACTIVE right now).
 * 2. Stats row: active sessions, total students, avg rate, at-risk count.
 * 3. Quick action grid.
 * 4. Per-course trend line chart (last 5 sessions per course).
 * 5. At-risk students widget.
 *
 * @returns The rendered lecturer dashboard element.
 */
export function LecturerDashboard(): ReactElement {
  const { data, isLoading, error, refetch } = useDashboard();
  const [liveCheckins, setLiveCheckins] = useState<number | null>(null);

  /**
   * Handles incoming WebSocket events and updates the live check-in count.
   *
   * @param event - Parsed WebSocket message payload.
   */
  const handleWsEvent = useCallback((event: unknown): void => {
    const e = event as Record<string, unknown>;
    if (typeof e?.checkinCount === 'number') {
      setLiveCheckins(e.checkinCount);
    }
  }, []);

  useWebSocket({
    path: '/ws/dashboard',
    onMessage: handleWsEvent,
    enabled: !!data,
  });

  if (isLoading) {
    return <div className={styles.skeleton} aria-busy="true" aria-label="Loading dashboard" />;
  }

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

  const activeSession = data?.activeSession;
  const checkinCount = liveCheckins ?? activeSession?.checkinCount ?? 0;

  // Flatten course trends into recharts-compatible data
  const chartData = buildChartData(data?.courseTrends ?? []);
  const courseKeys = (data?.courseTrends ?? []).map((c) => c.courseCode);

  return (
    <div className={styles.page}>
      {/* ── Active session banner ── */}
      {activeSession && (
        <ActiveSessionBanner
          sessionId={activeSession.sessionId}
          courseCode={activeSession.courseCode}
          checkinCount={checkinCount}
        />
      )}

      {/* ── Stats row ── */}
      <section className={styles.statsGrid} aria-label="Lecturer statistics">
        <StatsCard
          title="Active Sessions"
          value={data?.activeSessions ?? 0}
          icon={<Play size={16} />}
          variant={data?.activeSessions ? 'success' : 'default'}
          index={0}
        />
        <StatsCard
          title="Total Students"
          value={data?.totalStudents ?? 0}
          icon={<Users size={16} />}
          index={1}
        />
        <StatsCard
          title="Avg Attendance"
          value={`${(data?.avgRate ?? 0).toFixed(1)}%`}
          icon={<TrendingUp size={16} />}
          variant={(data?.avgRate ?? 0) >= 75 ? 'success' : 'warning'}
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

      {/* ── Quick actions ── */}
      <section aria-labelledby="actions-heading">
        <h2 id="actions-heading" className={styles.sectionTitle}>
          Quick Actions
        </h2>
        <QuickActionGrid actions={QUICK_ACTIONS} />
      </section>

      {/* ── Course trend chart ── */}
      {chartData.length > 0 && (
        <section aria-labelledby="trend-heading">
          <h2 id="trend-heading" className={styles.sectionTitle}>
            Attendance Trends
          </h2>
          <div className={styles.chartContainer}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v: number) => [`${(v ?? 0).toFixed(1)}%`]} />
                <Legend />
                {courseKeys.map((code, i) => (
                  <Line
                    key={code}
                    type="monotone"
                    dataKey={code}
                    dot={false}
                    strokeWidth={2}
                    className={styles[`chartLine${i % 5}` as keyof typeof styles]}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ── At-risk widget ── */}
      {(data?.atRiskStudents?.length ?? 0) > 0 && (
        <section aria-labelledby="atrisk-heading">
          <h2 id="atrisk-heading" className={styles.sectionTitle}>
            Students at Risk
          </h2>
          <AtRiskWidget students={data!.atRiskStudents!} />
        </section>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Transforms per-course session trend arrays into a flat recharts data array
 * keyed by session label, with one property per course code.
 *
 * @param trends - Array of course trend objects from the dashboard API.
 * @returns Flat array of objects suitable for `<LineChart data={...}>`.
 */
function buildChartData(
  trends: Array<{ courseCode: string; sessions: Array<{ sessionLabel: string; rate: number }> }>,
): Record<string, string | number>[] {
  if (trends.length === 0) return [];
  const labels = trends[0]?.sessions.map((s) => s.sessionLabel) ?? [];
  return labels.map((label, i) => {
    const row: Record<string, string | number> = { label };
    for (const course of trends) {
      row[course.courseCode] = course.sessions[i]?.rate ?? 0;
    }
    return row;
  });
}
