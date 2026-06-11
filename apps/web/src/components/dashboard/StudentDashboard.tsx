'use client';

/**
 * @file StudentDashboard.tsx
 * @module components/dashboard/StudentDashboard
 *
 * Dashboard for students. Shows eligibility banner (when exam < 21 days and
 * barred courses exist), three stats cards, an upcoming class card, a grid
 * of attendance health cards per enrolled course, and a pending excuses link.
 */

import Link from 'next/link';
import { BookOpen, TrendingUp, Flame } from 'lucide-react';
import type { ReactElement } from 'react';
import { useDashboard } from '../../hooks/use-dashboard';
import { StatsCard } from './StatsCard';
import { AttendanceHealthCard } from './AttendanceHealthCard';
import styles from './StudentDashboard.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Formats a future ISO date string as a relative "in X hrs" or "in X days" string.
 *
 * @param isoDate - ISO 8601 date string of the upcoming event.
 * @returns Human-readable relative time string.
 */
function relativeTime(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now();
  const hrs = Math.round(diff / 3_600_000);
  if (hrs < 1) return 'soon';
  if (hrs < 24) return `in ${hrs} hr${hrs !== 1 ? 's' : ''}`;
  const days = Math.round(hrs / 24);
  return `in ${days} day${days !== 1 ? 's' : ''}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Student dashboard component.
 *
 * Fetches `GET /dashboard` (60-second poll) and renders:
 * 1. Eligibility warning banner if exam ≤ 21 days away and barred courses exist.
 * 2. Stats row: overall %, courses enrolled, current streak.
 * 3. Upcoming class card (if next class ≤ 24 hrs).
 * 4. Attendance health card grid — one per enrolled course.
 * 5. Pending excuses link card.
 *
 * @returns The rendered student dashboard element.
 */
export function StudentDashboard(): ReactElement {
  const { data, isLoading, error, refetch } = useDashboard();

  if (isLoading) {
    return (
      <div className={styles.skeletonGrid} aria-busy="true" aria-label="Loading dashboard">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={styles.skeleton} />
        ))}
      </div>
    );
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

  const overallPct = data?.overallPercentage ?? 0;
  const coursesEnrolled = data?.coursesEnrolled ?? 0;
  const streak = data?.currentStreak ?? 0;
  const health = data?.attendanceHealth ?? [];
  const pendingExcuses = data?.pendingExcuses ?? 0;
  const showEligibilityBanner =
    (data?.daysTillExam ?? 999) <= 21 && (data?.barredCourses?.length ?? 0) > 0;

  return (
    <div className={styles.page}>
      {/* ── Eligibility warning ── */}
      {showEligibilityBanner && (
        <div className={styles.eligibilityBanner} role="alert">
          <strong>⚠ Eligibility warning:</strong> You are barred from {data!.barredCourses!.length}{' '}
          course{data!.barredCourses!.length !== 1 ? 's' : ''}. Exams start in {data!.daysTillExam}{' '}
          days.{' '}
          <Link href="/eligibility" className={styles.eligibilityLink}>
            View eligibility →
          </Link>
        </div>
      )}

      {/* ── Stats row ── */}
      <section className={styles.statsGrid} aria-label="Attendance summary">
        <StatsCard
          title="Overall Attendance"
          value={`${(overallPct ?? 0).toFixed(1)}%`}
          icon={<TrendingUp size={16} />}
          variant={overallPct >= 80 ? 'success' : overallPct >= 75 ? 'warning' : 'danger'}
          index={0}
        />
        <StatsCard
          title="Courses Enrolled"
          value={coursesEnrolled}
          icon={<BookOpen size={16} />}
          index={1}
        />
        <StatsCard
          title="Current Streak"
          value={`${streak} day${streak !== 1 ? 's' : ''}`}
          icon={<Flame size={16} />}
          variant={streak >= 7 ? 'success' : 'default'}
          index={2}
        />
      </section>

      {/* ── Upcoming class ── */}
      {data?.nextClassAt && (
        <div className={styles.upcomingCard} aria-label="Upcoming class">
          <div className={styles.upcomingLeft}>
            <span className={styles.upcomingTime}>{relativeTime(data.nextClassAt)}</span>
            <span className={styles.upcomingCourse}>{data.nextClassCourse}</span>
          </div>
          <span className={styles.upcomingVenue}>{data.nextClassVenue}</span>
        </div>
      )}

      {/* ── Attendance health grid ── */}
      <section aria-labelledby="health-heading">
        <h2 id="health-heading" className={styles.sectionTitle}>
          Attendance Health
        </h2>
        {health.length === 0 ? (
          <p className={styles.emptyText}>No courses enrolled this semester.</p>
        ) : (
          <div className={styles.healthGrid}>
            {health.map((course, i) => (
              <AttendanceHealthCard
                key={course.courseCode}
                courseCode={course.courseCode}
                courseTitle={course.courseTitle}
                present={course.present}
                total={course.total}
                percentage={course.percentage}
                index={i}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Pending excuses ── */}
      {pendingExcuses > 0 && (
        <Link href="/excuses" className={styles.excusesCard}>
          You have <strong>{pendingExcuses}</strong> pending excuse{pendingExcuses !== 1 ? 's' : ''}{' '}
          awaiting review →
        </Link>
      )}
    </div>
  );
}
