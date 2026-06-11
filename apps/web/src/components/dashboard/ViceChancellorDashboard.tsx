'use client';

/**
 * @file ViceChancellorDashboard.tsx
 * @module components/dashboard/ViceChancellorDashboard
 *
 * Dashboard for the Vice Chancellor. Shows a full-width hero KPI card with
 * the university attendance rate and NUC compliance badge, three supporting
 * stats cards, a faculty performance bar chart, a 12-week trend area chart,
 * and quick navigation links.
 */

import type { ReactElement } from 'react';
import { Users, TrendingUp, Building2, BarChart2, FileBarChart, Map } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import { useDashboard } from '../../hooks/use-dashboard';
import { StatsCard } from './StatsCard';
import { QuickActionGrid, type QuickAction } from './QuickActionGrid';
import styles from './ViceChancellorDashboard.module.css';

/** Quick links for the Vice Chancellor. */
const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Full Analytics',
    icon: <BarChart2 size={24} />,
    href: '/analytics',
    description: 'University-wide attendance analytics.',
  },
  {
    label: 'Reports',
    icon: <FileBarChart size={24} />,
    href: '/reports',
    description: 'NUC and executive attendance reports.',
  },
  {
    label: 'Live Map',
    icon: <Map size={24} />,
    href: '/venues',
    description: 'Live session venue map.',
  },
];

/**
 * Returns a CSS colour variable based on a rate value.
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
 * Vice Chancellor dashboard component.
 *
 * Renders:
 * 1. Full-width hero KPI glassmorphism card: university rate + NUC badge.
 * 2. Supporting stats: active students, 12-week trend summary, faculties.
 * 3. Faculty performance bar chart.
 * 4. 12-week trend area chart.
 * 5. Quick links.
 *
 * @returns The rendered VC dashboard element.
 */
export function ViceChancellorDashboard(): ReactElement {
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

  const univRate = data?.universityRate ?? 0;
  const isCompliant = univRate >= 75;
  const faculties = (data?.facultyBreakdown ?? []).sort((a, b) => b.avgRate - a.avgRate);
  const trend = data?.weeklyTrend ?? [];

  return (
    <div className={styles.page}>
      {/* Hero KPI card */}
      <div className={styles.heroCard} aria-label="University attendance rate">
        <div className={styles.heroLeft}>
          <span className={styles.heroLabel}>University Attendance Rate</span>
          <span className={styles.heroValue}>{(univRate ?? 0).toFixed(1)}%</span>
          <span
            className={`${styles.complianceBadge} ${isCompliant ? styles.compliant : styles.nonCompliant}`}
          >
            {isCompliant ? '✓ NUC Compliant' : '⚠ Below NUC Minimum (75%)'}
          </span>
        </div>
        <div className={styles.heroRight} aria-hidden="true">
          <Building2 size={48} strokeWidth={1} />
        </div>
      </div>

      {/* Supporting stats */}
      <section className={styles.statsGrid} aria-label="University statistics">
        <StatsCard
          title="Active Students"
          value={data?.totalStudentsCount ?? 0}
          icon={<Users size={16} />}
          index={0}
        />
        <StatsCard
          title="12-Week Avg"
          value={
            trend.length > 0
              ? `${(trend.reduce((s, w) => s + w.rate, 0) / trend.length).toFixed(1)}%`
              : '—'
          }
          icon={<TrendingUp size={16} />}
          index={1}
        />
        <StatsCard
          title="Faculties"
          value={data?.totalFaculties ?? 0}
          icon={<Building2 size={16} />}
          index={2}
        />
      </section>

      {/* Faculty bar chart */}
      {faculties.length > 0 && (
        <section aria-labelledby="vc-faculty-chart">
          <h2 id="vc-faculty-chart" className={styles.sectionTitle}>
            Faculty Performance
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

      {/* 12-week trend area chart */}
      {trend.length > 0 && (
        <section aria-labelledby="vc-trend-chart">
          <h2 id="vc-trend-chart" className={styles.sectionTitle}>
            12-Week Trend
          </h2>
          <div className={styles.chartContainer}>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v: number) => [`${(v ?? 0).toFixed(1)}%`]} />
                <Area
                  type="monotone"
                  dataKey="rate"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  fill="url(#trendFill)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Quick links */}
      <section aria-labelledby="vc-links-heading">
        <h2 id="vc-links-heading" className={styles.sectionTitle}>
          Quick Links
        </h2>
        <QuickActionGrid actions={QUICK_ACTIONS} />
      </section>
    </div>
  );
}
