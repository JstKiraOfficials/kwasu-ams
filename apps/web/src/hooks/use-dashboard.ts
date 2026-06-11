/**
 * @file use-dashboard.ts
 * @module hooks/use-dashboard
 *
 * React Query hook for the authenticated user's dashboard aggregates.
 * Polls `GET /dashboard` every 60 seconds and returns the cached data
 * between polls. The query key is scoped by role so each role's data
 * is cached independently.
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '../lib/query-keys';
import { apiGet } from '../lib/api-client';
import { useAuth } from './use-auth';

/**
 * Raw shape returned by `GET /dashboard`.
 * The actual fields depend on the requesting user's role — fields not
 * relevant to a given role are simply absent from the response.
 */
export interface DashboardData {
  // ── Shared ──────────────────────────────────────────────────────────────
  /** ISO 8601 timestamp of when this snapshot was generated. */
  generatedAt?: string;

  // ── Student ──────────────────────────────────────────────────────────────
  /** Overall attendance percentage across all enrolled courses. */
  overallPercentage?: number;
  /** Number of courses the student is enrolled in this semester. */
  coursesEnrolled?: number;
  /** Current consecutive-attendance streak in days. */
  currentStreak?: number;
  /** Per-course attendance health cards. */
  attendanceHealth?: Array<{
    courseCode: string;
    courseTitle: string;
    present: number;
    total: number;
    percentage: number;
  }>;
  /** Number of pending excuse letters awaiting review. */
  pendingExcuses?: number;
  /** ISO date of the next scheduled class, if within 24 hours. */
  nextClassAt?: string;
  /** Course code of the upcoming class. */
  nextClassCourse?: string;
  /** Venue name of the upcoming class. */
  nextClassVenue?: string;
  /** Days until the exam period starts. */
  daysTillExam?: number;
  /** Course codes the student is currently BARRED from. */
  barredCourses?: string[];

  // ── Lecturer ─────────────────────────────────────────────────────────────
  /** Number of sessions currently in ACTIVE status. */
  activeSessions?: number;
  /** Total number of students across all sections taught. */
  totalStudents?: number;
  /** Average attendance rate across all courses taught. */
  avgRate?: number;
  /** Number of students below the 75% threshold. */
  atRiskCount?: number;
  /** Students below 75% with matric, name, and percentage. */
  atRiskStudents?: Array<{
    id: string;
    matricNumber: string;
    fullName: string;
    percentage: number;
    courseCode: string;
  }>;
  /** Last-5-session attendance series, one entry per course. */
  courseTrends?: Array<{
    courseCode: string;
    sessions: Array<{ sessionLabel: string; rate: number }>;
  }>;
  /** Active session summary if one is open right now. */
  activeSession?: {
    sessionId: string;
    courseCode: string;
    checkinCount: number;
  };

  // ── HOD ──────────────────────────────────────────────────────────────────
  /** Number of courses in this department. */
  courseCount?: number;
  /** Department average attendance rate. */
  departmentAvgRate?: number;
  /** Per-course performance for the department. */
  coursePerformance?: Array<{
    courseCode: string;
    courseTitle: string;
    lecturerName: string;
    rate: number;
    trend: 'up' | 'down' | 'stable';
  }>;
  /** Lecturer accountability stats. */
  lecturerAccountability?: Array<{
    lecturerId: string;
    lecturerName: string;
    sessionsHeld: number;
    sessionsScheduled: number;
    accountabilityPct: number;
  }>;

  // ── Dean ─────────────────────────────────────────────────────────────────
  /** Number of departments in this faculty. */
  departmentCount?: number;
  /** Faculty average attendance rate. */
  facultyAvgRate?: number;
  /** Per-department breakdown for the faculty. */
  departmentBreakdown?: Array<{
    departmentId: string;
    departmentName: string;
    avgRate: number;
    studentCount: number;
  }>;

  // ── Exam Officer ─────────────────────────────────────────────────────────
  /** Total number of students registered this semester. */
  totalStudentsCount?: number;
  /** Number of students with ELIGIBLE status. */
  eligibleCount?: number;
  /** Number of students with BARRED status. */
  barredCount?: number;
  /** Number of pending eligibility appeals. */
  pendingAppealsCount?: number;
  /** Barred course summary table. */
  barredCourses2?: Array<{
    courseCode: string;
    courseTitle: string;
    barredStudents: number;
    conditionalStudents: number;
  }>;
  /** Pending appeals list. */
  pendingAppeals?: Array<{
    appealId: string;
    studentName: string;
    courseCode: string;
    submittedAt: string;
  }>;

  // ── Academic Affairs / VC / Super Admin ──────────────────────────────────
  /** Number of sessions currently ACTIVE university-wide. */
  activeSessionsNow?: number;
  /** University-wide attendance rate. */
  universityRate?: number;
  /** Number of faculties in the university. */
  totalFaculties?: number;
  /** Courses with < 60% attendance (flagged). */
  flaggedCourses?: Array<{
    courseCode: string;
    courseTitle: string;
    departmentName: string;
    lecturerName: string;
    rate: number;
  }>;
  /** Per-faculty attendance breakdown. */
  facultyBreakdown?: Array<{
    facultyId: string;
    facultyName: string;
    avgRate: number;
    studentCount: number;
  }>;
  /** 12-week university attendance trend. */
  weeklyTrend?: Array<{ week: string; rate: number }>;

  // ── Super Admin ───────────────────────────────────────────────────────────
  /** Total registered user accounts. */
  totalUsers?: number;
  /** Number of anomaly flags not yet reviewed. */
  pendingAnomalies?: number;
  /** Webhook events dispatched today. */
  webhookEventsToday?: number;
  /** System uptime string (e.g. `'14d 3h'`). */
  systemUptime?: string;
  /** Last 10 audit log entries. */
  recentAuditLogs?: Array<{
    id: string;
    actorName: string;
    action: string;
    entityType: string;
    timestamp: string;
  }>;
}

/**
 * Fetches and caches the dashboard aggregates for the current user.
 *
 * - Query key is scoped by role so different roles never share a cache entry.
 * - Refetches every 60 seconds to keep stats reasonably fresh.
 * - `staleTime` is 30 seconds — avoids a network hit on rapid navigations.
 *
 * @returns A React Query result containing `DashboardData | undefined`.
 */
export function useDashboard(): UseQueryResult<DashboardData> {
  const { user } = useAuth();
  const role = user?.role ?? 'UNKNOWN';

  return useQuery({
    queryKey: queryKeys.dashboard(role),
    queryFn: () => apiGet<DashboardData>('/dashboard'),
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled: !!user,
  });
}
