/**
 * @file analytics.service.ts
 * @module modules/analytics
 *
 * Dashboard data aggregation service for KWASU AMS.
 *
 * `getDashboardData()` returns role-scoped aggregated data for the dashboard.
 * Results are cached in Redis with a 60-second TTL to avoid repeated heavy
 * database queries on every page load.
 *
 * Role-specific data shapes:
 * - `VICE_CHANCELLOR` / `SUPER_ADMIN` — university-wide rates, faculty breakdown.
 * - `DEAN`           — faculty rates, department breakdown, at-risk count.
 * - `HOD`            — department rates per course, at-risk student list.
 * - `LECTURER`       — per-course trends, live check-in list, at-risk students.
 * - `STUDENT`        — attendance health cards, upcoming class, eligibility.
 * - `EXAM_OFFICER`   — eligibility summary across all courses.
 *
 * Cache strategy: check Redis first; on miss, compute from DB, store with 60s TTL.
 * Active semester resolution: all queries filter by `semester.isActive = true`.
 */

import { type Prisma } from '@prisma/client';
import { Role } from '@kwasu-ams/types';
import { computeAttendancePercentage, classesNeededForThreshold } from '@kwasu-ams/utils';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';

// =============================================================================
// Dashboard data types
// =============================================================================

/** Attendance health card for a single course (STUDENT dashboard). */
export interface AttendanceHealthCard {
  /** Course code, e.g. `'BIO201'`. */
  courseCode: string;
  /** Course title. */
  courseTitle: string;
  /** Number of sessions the student was present/late/override. */
  present: number;
  /** Total closed/locked sessions in the semester. */
  total: number;
  /** Attendance percentage rounded to 2 decimal places. */
  percentage: number;
  /** Eligibility status string. */
  status: string;
}

/** Per-course session trend entry (LECTURER dashboard). */
export interface CourseTrend {
  /** Course code. */
  courseCode: string;
  /** Course section label. */
  sectionLabel: string;
  /** Attendance rates for the last 5 sessions (oldest first). */
  recentRates: number[];
  /** Number of students currently at exam risk (< 75%). */
  atRiskCount: number;
}

/** Role-specific dashboard data union. */
export type DashboardData =
  | {
      role: 'VICE_CHANCELLOR' | 'SUPER_ADMIN';
      universityRate: number;
      facultyBreakdown: Array<{ facultyName: string; rate: number }>;
      flaggedCourses: Array<{ courseCode: string; rate: number }>;
      activeSessionCount: number;
      noActiveSemester?: boolean;
    }
  | {
      role: 'DEAN';
      facultyRate: number;
      departmentBreakdown: Array<{ departmentName: string; rate: number }>;
      atRiskCount: number;
      noActiveSemester?: boolean;
    }
  | {
      role: 'HOD';
      courses: Array<{ courseCode: string; rate: number; atRiskCount: number }>;
      atRiskStudents: Array<{ studentName: string; matricNumber: string; percentage: number }>;
      noActiveSemester?: boolean;
    }
  | {
      role: 'LECTURER';
      trends: CourseTrend[];
      activeSession: { sessionId: string; courseCode: string } | null;
      noActiveSemester?: boolean;
    }
  | {
      role: 'STUDENT';
      healthCards: AttendanceHealthCard[];
      pendingExcuseCount: number;
      noActiveSemester?: boolean;
    }
  | {
      role: 'EXAM_OFFICER';
      totalStudents: number;
      eligibleCount: number;
      barredCount: number;
      conditionalCount: number;
      noActiveSemester?: boolean;
    }
  | { role: string; message: string };

// =============================================================================
// Cache TTL
// =============================================================================

/** Redis cache TTL for dashboard aggregates in seconds (60 seconds). */
const CACHE_TTL_SECONDS = 60;

// =============================================================================
// getDashboardData
// =============================================================================

/**
 * Returns role-scoped dashboard data for the authenticated user.
 *
 * Checks Redis cache first. On cache miss, computes from the database and
 * stores the result with a 60-second TTL.
 *
 * If no active semester exists, returns `{ role, message: 'No active semester' }`.
 *
 * @param userId  - UUID of the authenticated `User`.
 * @param role    - Role of the authenticated user.
 * @param scopeId - Faculty/department UUID for scoped roles, or `null`.
 * @returns Role-specific {@link DashboardData} object.
 */
export async function getDashboardData(
  userId: string,
  role: Role,
  scopeId: string | null,
): Promise<DashboardData> {
  const activeSemester = await prisma.semester.findFirst({
    where: { isActive: true },
    select: { id: true, eligibilityThreshold: true },
  });

  if (!activeSemester) {
    return { role, message: 'No active semester' };
  }

  const semesterId = activeSemester.id;
  const threshold = activeSemester.eligibilityThreshold;

  // Build cache key based on role
  const cacheKey = buildCacheKey(role, userId, scopeId, semesterId);

  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached !== null) {
    return JSON.parse(cached) as DashboardData;
  }

  // Compute fresh data
  const data = await computeDashboardData(userId, role, scopeId, semesterId, threshold);

  // Store in cache
  void redis.set(cacheKey, JSON.stringify(data), 'EX', CACHE_TTL_SECONDS);

  return data;
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Builds the Redis cache key for a given role and scope.
 *
 * @param role       - Role of the user.
 * @param userId     - UUID of the user.
 * @param scopeId    - Scope UUID or null.
 * @param semesterId - Active semester UUID.
 * @returns Redis cache key string.
 */
function buildCacheKey(
  role: Role,
  userId: string,
  scopeId: string | null,
  semesterId: string,
): string {
  switch (role) {
    case Role.VICE_CHANCELLOR:
    case Role.SUPER_ADMIN:
      return `dashboard:vc:${semesterId}`;
    case Role.DEAN:
      return `dashboard:dean:${scopeId ?? userId}:${semesterId}`;
    case Role.HOD:
      return `dashboard:hod:${scopeId ?? userId}:${semesterId}`;
    case Role.LECTURER:
      return `dashboard:lecturer:${userId}:${semesterId}`;
    case Role.STUDENT:
      return `dashboard:student:${userId}:${semesterId}`;
    case Role.EXAM_OFFICER:
      return `dashboard:examofficer:${semesterId}`;
    default:
      return `dashboard:${role}:${userId}:${semesterId}`;
  }
}

/**
 * Computes fresh dashboard data from the database for the given role.
 *
 * @param userId     - UUID of the authenticated user.
 * @param role       - Role of the authenticated user.
 * @param scopeId    - Scope UUID or null.
 * @param semesterId - Active semester UUID.
 * @param threshold  - Eligibility threshold percentage.
 * @returns Computed {@link DashboardData}.
 */
async function computeDashboardData(
  userId: string,
  role: Role,
  scopeId: string | null,
  semesterId: string,
  threshold: number,
): Promise<DashboardData> {
  switch (role) {
    case Role.VICE_CHANCELLOR:
    case Role.SUPER_ADMIN:
      return computeVcDashboard(semesterId);
    case Role.DEAN:
      return computeDeanDashboard(scopeId, semesterId);
    case Role.HOD:
      return computeHodDashboard(scopeId, semesterId, threshold);
    case Role.LECTURER:
      return computeLecturerDashboard(userId, semesterId, threshold);
    case Role.STUDENT:
      return computeStudentDashboard(userId, semesterId);
    case Role.EXAM_OFFICER:
      return computeExamOfficerDashboard(semesterId);
    default:
      return { role, message: 'Dashboard not available for this role.' };
  }
}

/**
 * Computes university-wide dashboard data for VC/SUPER_ADMIN.
 *
 * @param semesterId - Active semester UUID.
 * @returns VC dashboard data with faculty breakdown and flagged courses.
 */
async function computeVcDashboard(semesterId: string): Promise<DashboardData> {
  const faculties = await prisma.faculty.findMany({
    select: {
      name: true,
      departments: {
        select: {
          programmes: {
            select: {
              students: {
                select: {
                  enrollments: {
                    where: { courseSection: { semesterId } },
                    select: { attendanceRecords: { select: { status: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const facultyBreakdown = faculties.map((f) => {
    let present = 0;
    let total = 0;
    for (const dept of f.departments) {
      for (const prog of dept.programmes) {
        for (const student of prog.students) {
          for (const enrollment of student.enrollments) {
            for (const record of enrollment.attendanceRecords) {
              total++;
              if (['PRESENT', 'LATE', 'MANUAL_OVERRIDE', 'EXCUSED'].includes(record.status)) {
                present++;
              }
            }
          }
        }
      }
    }
    return { facultyName: f.name, rate: computeAttendancePercentage(present, total) };
  });

  const universityRate =
    facultyBreakdown.length > 0
      ? Math.round(
          (facultyBreakdown.reduce((sum, f) => sum + f.rate, 0) / facultyBreakdown.length) * 100,
        ) / 100
      : 0;

  const activeSessionCount = await prisma.courseSession.count({
    where: { status: 'ACTIVE' },
  });

  const flaggedCourses = await prisma.courseSection.findMany({
    where: { semesterId },
    select: {
      course: { select: { code: true } },
      sessions: {
        where: { status: { in: ['CLOSED', 'LOCKED'] } },
        select: { attendanceRecords: { select: { status: true } } },
      },
    },
  });

  const flagged = flaggedCourses
    .map((cs) => {
      let present = 0;
      let total = 0;
      for (const session of cs.sessions) {
        for (const record of session.attendanceRecords) {
          total++;
          if (['PRESENT', 'LATE', 'MANUAL_OVERRIDE', 'EXCUSED'].includes(record.status)) {
            present++;
          }
        }
      }
      return { courseCode: cs.course.code, rate: computeAttendancePercentage(present, total) };
    })
    .filter((c) => c.rate < 60 && c.rate > 0);

  return {
    role: 'VICE_CHANCELLOR',
    universityRate,
    facultyBreakdown,
    flaggedCourses: flagged,
    activeSessionCount,
  };
}

/**
 * Computes faculty-scoped dashboard data for DEAN.
 *
 * @param facultyId  - UUID of the dean's faculty scope.
 * @param semesterId - Active semester UUID.
 * @returns DEAN dashboard data with department breakdown.
 */
async function computeDeanDashboard(
  facultyId: string | null,
  semesterId: string,
): Promise<DashboardData> {
  const where: Prisma.DepartmentWhereInput = facultyId ? { facultyId } : {};

  const departments = await prisma.department.findMany({
    where,
    select: {
      name: true,
      programmes: {
        select: {
          students: {
            select: {
              enrollments: {
                where: { courseSection: { semesterId } },
                select: {
                  attendanceRecords: { select: { status: true } },
                  examEligibilities: {
                    where: { semesterId },
                    select: { status: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  let totalPresent = 0;
  let totalRecords = 0;
  let atRiskCount = 0;

  const departmentBreakdown = departments.map((dept) => {
    let present = 0;
    let total = 0;
    for (const prog of dept.programmes) {
      for (const student of prog.students) {
        for (const enrollment of student.enrollments) {
          for (const record of enrollment.attendanceRecords) {
            total++;
            totalRecords++;
            if (['PRESENT', 'LATE', 'MANUAL_OVERRIDE', 'EXCUSED'].includes(record.status)) {
              present++;
              totalPresent++;
            }
          }
          for (const elig of enrollment.examEligibilities) {
            if (elig.status === 'BARRED') atRiskCount++;
          }
        }
      }
    }
    return { departmentName: dept.name, rate: computeAttendancePercentage(present, total) };
  });

  return {
    role: 'DEAN',
    facultyRate: computeAttendancePercentage(totalPresent, totalRecords),
    departmentBreakdown,
    atRiskCount,
  };
}

/**
 * Computes department-scoped dashboard data for HOD.
 *
 * @param departmentId - UUID of the HOD's department scope.
 * @param semesterId   - Active semester UUID.
 * @param threshold    - Eligibility threshold percentage.
 * @returns HOD dashboard data with per-course rates and at-risk students.
 */
async function computeHodDashboard(
  departmentId: string | null,
  semesterId: string,
  threshold: number,
): Promise<DashboardData> {
  const courseWhere: Prisma.CourseSectionWhereInput = {
    semesterId,
    ...(departmentId ? { course: { departmentId } } : {}),
  };

  const sections = await prisma.courseSection.findMany({
    where: courseWhere,
    select: {
      course: { select: { code: true } },
      sessions: {
        where: { status: { in: ['CLOSED', 'LOCKED'] } },
        select: { attendanceRecords: { select: { status: true } } },
      },
      enrollments: {
        select: {
          student: {
            select: {
              matricNumber: true,
              user: { select: { fullName: true } },
            },
          },
          attendanceRecords: { select: { status: true } },
        },
      },
    },
  });

  const courses = sections.map((section) => {
    let present = 0;
    let total = 0;
    let atRiskCount = 0;

    for (const session of section.sessions) {
      for (const record of session.attendanceRecords) {
        total++;
        if (['PRESENT', 'LATE', 'MANUAL_OVERRIDE', 'EXCUSED'].includes(record.status)) {
          present++;
        }
      }
    }

    for (const enrollment of section.enrollments) {
      const sessionCount = section.sessions.length;
      if (sessionCount === 0) continue;
      const studentPresent = enrollment.attendanceRecords.filter((r) =>
        ['PRESENT', 'LATE', 'MANUAL_OVERRIDE', 'EXCUSED'].includes(r.status),
      ).length;
      const pct = computeAttendancePercentage(studentPresent, sessionCount);
      if (pct < threshold) atRiskCount++;
    }

    return {
      courseCode: section.course.code,
      rate: computeAttendancePercentage(present, total),
      atRiskCount,
    };
  });

  // At-risk students across all sections
  const atRiskStudents: Array<{ studentName: string; matricNumber: string; percentage: number }> =
    [];
  for (const section of sections) {
    const sessionCount = section.sessions.length;
    if (sessionCount === 0) continue;
    for (const enrollment of section.enrollments) {
      const studentPresent = enrollment.attendanceRecords.filter((r) =>
        ['PRESENT', 'LATE', 'MANUAL_OVERRIDE', 'EXCUSED'].includes(r.status),
      ).length;
      const pct = computeAttendancePercentage(studentPresent, sessionCount);
      if (pct < threshold) {
        atRiskStudents.push({
          studentName: enrollment.student.user.fullName,
          matricNumber: enrollment.student.matricNumber,
          percentage: pct,
        });
      }
    }
  }

  return { role: 'HOD', courses, atRiskStudents };
}

/**
 * Computes lecturer-scoped dashboard data.
 *
 * @param userId     - UUID of the lecturer `User`.
 * @param semesterId - Active semester UUID.
 * @param threshold  - Eligibility threshold percentage.
 * @returns LECTURER dashboard data with course trends and active session.
 */
async function computeLecturerDashboard(
  userId: string,
  semesterId: string,
  threshold: number,
): Promise<DashboardData> {
  const lecturer = await prisma.lecturer.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!lecturer) return { role: 'LECTURER', trends: [], activeSession: null };

  const sections = await prisma.courseSection.findMany({
    where: { semesterId, lecturerId: lecturer.id },
    select: {
      sectionLabel: true,
      course: { select: { code: true } },
      sessions: {
        where: { status: { in: ['CLOSED', 'LOCKED'] } },
        select: {
          id: true,
          scheduledStart: true,
          attendanceRecords: { select: { status: true } },
        },
        orderBy: { scheduledStart: 'desc' },
        take: 5,
      },
      enrollments: {
        select: { attendanceRecords: { select: { status: true } } },
      },
    },
  });

  const trends: CourseTrend[] = sections.map((section) => {
    const recentRates = section.sessions
      .slice()
      .reverse()
      .map((session) => {
        const total = session.attendanceRecords.length;
        const present = session.attendanceRecords.filter((r) =>
          ['PRESENT', 'LATE', 'MANUAL_OVERRIDE', 'EXCUSED'].includes(r.status),
        ).length;
        return computeAttendancePercentage(present, total);
      });

    const totalSessions = section.sessions.length;
    let atRiskCount = 0;
    for (const enrollment of section.enrollments) {
      const present = enrollment.attendanceRecords.filter((r) =>
        ['PRESENT', 'LATE', 'MANUAL_OVERRIDE', 'EXCUSED'].includes(r.status),
      ).length;
      if (computeAttendancePercentage(present, totalSessions) < threshold) atRiskCount++;
    }

    return {
      courseCode: section.course.code,
      sectionLabel: section.sectionLabel,
      recentRates,
      atRiskCount,
    };
  });

  // Check for active session
  const activeSession = await prisma.courseSession.findFirst({
    where: { lecturerId: lecturer.id, status: 'ACTIVE' },
    select: {
      id: true,
      courseSection: { select: { course: { select: { code: true } } } },
    },
  });

  return {
    role: 'LECTURER',
    trends,
    activeSession: activeSession
      ? { sessionId: activeSession.id, courseCode: activeSession.courseSection.course.code }
      : null,
  };
}

/**
 * Computes student-scoped dashboard data.
 *
 * @param userId     - UUID of the student `User`.
 * @param semesterId - Active semester UUID.
 * @returns STUDENT dashboard data with health cards and pending excuse count.
 */
async function computeStudentDashboard(userId: string, semesterId: string): Promise<DashboardData> {
  const student = await prisma.student.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!student) return { role: 'STUDENT', healthCards: [], pendingExcuseCount: 0 };

  const enrollments = await prisma.courseEnrollment.findMany({
    where: { studentId: student.id, courseSection: { semesterId } },
    select: {
      id: true,
      courseSection: {
        select: {
          course: { select: { code: true, title: true } },
          sessions: {
            where: { status: { in: ['CLOSED', 'LOCKED'] } },
            select: { id: true },
          },
        },
      },
      attendanceRecords: { select: { status: true } },
      examEligibilities: {
        where: { semesterId },
        select: { status: true },
      },
    },
  });

  const healthCards: AttendanceHealthCard[] = enrollments.map((enrollment) => {
    const total = enrollment.courseSection.sessions.length;
    const present = enrollment.attendanceRecords.filter((r) =>
      ['PRESENT', 'LATE', 'MANUAL_OVERRIDE'].includes(r.status),
    ).length;
    const percentage = computeAttendancePercentage(present, total);
    const eligStatus = enrollment.examEligibilities[0]?.status ?? 'PENDING';

    return {
      courseCode: enrollment.courseSection.course.code,
      courseTitle: enrollment.courseSection.course.title,
      present,
      total,
      percentage,
      status: eligStatus,
    };
  });

  const pendingExcuseCount = await prisma.excuseLetter.count({
    where: {
      studentId: student.id,
      status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'APPEAL_SUBMITTED'] },
    },
  });

  return { role: 'STUDENT', healthCards, pendingExcuseCount };
}

/**
 * Computes exam officer dashboard data with eligibility summary.
 *
 * @param semesterId - Active semester UUID.
 * @returns EXAM_OFFICER dashboard data with eligibility counts.
 */
async function computeExamOfficerDashboard(semesterId: string): Promise<DashboardData> {
  const [totalStudents, eligibleCount, barredCount, conditionalCount] = await Promise.all([
    prisma.examEligibility.count({ where: { semesterId } }),
    prisma.examEligibility.count({ where: { semesterId, status: 'ELIGIBLE' } }),
    prisma.examEligibility.count({ where: { semesterId, status: 'BARRED' } }),
    prisma.examEligibility.count({ where: { semesterId, status: 'CONDITIONAL' } }),
  ]);

  return { role: 'EXAM_OFFICER', totalStudents, eligibleCount, barredCount, conditionalCount };
}

// =============================================================================
// Course and Student Analytics (Phase 28 additions)
// =============================================================================

/** Trend direction for course attendance over time. */
export type TrendDirection = 'IMPROVING' | 'DECLINING' | 'STABLE';

/**
 * Analytics data for a single course section.
 */
export interface CourseAnalytics {
  /** Attendance rate per session, ordered chronologically. */
  sessionRates: Array<{ sessionId: string; date: Date; rate: number }>;
  /** 4-week trend direction. */
  trend: TrendDirection;
  /** Session with the highest attendance rate. */
  highestSession: { sessionId: string; rate: number };
  /** Session with the lowest attendance rate. */
  lowestSession: { sessionId: string; rate: number };
  /** Distribution histogram in 25% buckets. */
  distribution: Array<{ range: string; count: number }>;
  /** Average attendance rate across all sessions. */
  averageRate: number;
}

/**
 * Analytics data for a single student across all enrolled courses.
 */
export interface StudentAnalytics {
  /** Per-course analytics entries. */
  courses: Array<{
    /** Course code. */
    courseCode: string;
    /** Student's current attendance percentage. */
    percentage: number;
    /** Classes needed to reach 75% threshold. */
    threshold75: number;
    /** Classes needed to reach 80% threshold. */
    threshold80: number;
    /** Classes needed to reach 90% threshold. */
    threshold90: number;
    /** Dynamic eligibility message. */
    dynamicMessage: string;
    /** Class average attendance percentage. */
    classAverage: number;
    /** Benchmark message comparing student to class average. */
    benchmarkMessage: string;
    /** Whether the student has 3+ absences on the same weekday. */
    absenceClustering: boolean;
  }>;
}

/** Analytics cache TTL in seconds (5 minutes). */
const ANALYTICS_CACHE_TTL = 300;

/**
 * Returns course-level analytics for a course section in a semester.
 *
 * Computes session attendance rates, 4-week trend, distribution histogram,
 * and caches the result in Redis for 5 minutes.
 *
 * @param courseSectionId - UUID of the `CourseSection`.
 * @param semesterId      - UUID of the `Semester`.
 * @returns {@link CourseAnalytics} for the course section.
 */
export async function getCourseAnalytics(
  courseSectionId: string,
  semesterId: string,
): Promise<CourseAnalytics> {
  const cacheKey = `analytics:course:${courseSectionId}:${semesterId}`;
  const cached = await redis.get(cacheKey);
  if (cached !== null) return JSON.parse(cached) as CourseAnalytics;

  const sessions = await prisma.courseSession.findMany({
    where: { courseSectionId, status: { in: ['CLOSED', 'LOCKED'] } },
    select: {
      id: true,
      scheduledStart: true,
      attendanceRecords: { select: { status: true } },
      courseSection: { select: { enrollments: { select: { id: true } } } },
    },
    orderBy: { scheduledStart: 'asc' },
  });

  if (sessions.length === 0) {
    const empty: CourseAnalytics = {
      sessionRates: [],
      trend: 'STABLE',
      highestSession: { sessionId: '', rate: 0 },
      lowestSession: { sessionId: '', rate: 0 },
      distribution: [
        { range: '0-25%', count: 0 },
        { range: '25-50%', count: 0 },
        { range: '50-75%', count: 0 },
        { range: '75-100%', count: 0 },
      ],
      averageRate: 0,
    };
    return empty;
  }

  const sessionRates = sessions.map((s) => {
    const enrolled = s.courseSection.enrollments.length;
    const present = s.attendanceRecords.filter((r) =>
      ['PRESENT', 'LATE', 'MANUAL_OVERRIDE'].includes(r.status),
    ).length;
    return {
      sessionId: s.id,
      date: s.scheduledStart,
      rate: computeAttendancePercentage(present, enrolled),
    };
  });

  // Trend: compare last 4 vs previous 4
  const last4 = sessionRates.slice(-4);
  const prev4 = sessionRates.slice(-8, -4);
  let trend: TrendDirection = 'STABLE';
  if (last4.length >= 2 && prev4.length >= 2) {
    const last4Avg = last4.reduce((s, r) => s + r.rate, 0) / last4.length;
    const prev4Avg = prev4.reduce((s, r) => s + r.rate, 0) / prev4.length;
    const diff = last4Avg - prev4Avg;
    if (diff > 5) trend = 'IMPROVING';
    else if (diff < -5) trend = 'DECLINING';
  }

  const rates = sessionRates.map((r) => r.rate);
  const maxRate = Math.max(...rates);
  const minRate = Math.min(...rates);
  const highestSession = sessionRates.find((r) => r.rate === maxRate)!;
  const lowestSession = sessionRates.find((r) => r.rate === minRate)!;
  const averageRate = Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) / 100;

  // Distribution histogram
  const distribution = [
    { range: '0-25%', count: rates.filter((r) => r < 25).length },
    { range: '25-50%', count: rates.filter((r) => r >= 25 && r < 50).length },
    { range: '50-75%', count: rates.filter((r) => r >= 50 && r < 75).length },
    { range: '75-100%', count: rates.filter((r) => r >= 75).length },
  ];

  const result: CourseAnalytics = {
    sessionRates,
    trend,
    highestSession: { sessionId: highestSession.sessionId, rate: highestSession.rate },
    lowestSession: { sessionId: lowestSession.sessionId, rate: lowestSession.rate },
    distribution,
    averageRate,
  };

  void redis.set(cacheKey, JSON.stringify(result), 'EX', ANALYTICS_CACHE_TTL);
  return result;
}

/**
 * Returns student-level analytics across all enrolled courses in a semester.
 *
 * Computes attendance percentage, classes needed for thresholds, dynamic
 * eligibility messages, class benchmarks, and absence clustering detection.
 *
 * @param studentId  - UUID of the `Student` record.
 * @param semesterId - UUID of the `Semester`.
 * @returns {@link StudentAnalytics} for the student.
 */
export async function getStudentAnalytics(
  studentId: string,
  semesterId: string,
): Promise<StudentAnalytics> {
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { studentId, courseSection: { semesterId } },
    select: {
      id: true,
      courseSection: {
        select: {
          course: { select: { code: true } },
          sessions: {
            where: { status: { in: ['CLOSED', 'LOCKED'] } },
            select: { id: true, scheduledStart: true },
          },
          enrollments: {
            select: {
              attendanceRecords: {
                select: { status: true },
              },
            },
          },
        },
      },
      attendanceRecords: {
        select: { status: true, session: { select: { scheduledStart: true } } },
      },
    },
  });

  const courses = await Promise.all(
    enrollments.map(async (enrollment) => {
      const courseCode = enrollment.courseSection.course.code;
      const totalSessions = enrollment.courseSection.sessions.length;
      const presentCount = enrollment.attendanceRecords.filter((r) =>
        ['PRESENT', 'LATE', 'MANUAL_OVERRIDE'].includes(r.status),
      ).length;
      const percentage = computeAttendancePercentage(presentCount, totalSessions);

      // Classes needed for thresholds (assume 10 remaining sessions)
      const remainingSessions = 10;
      const threshold75 = classesNeededForThreshold(
        presentCount,
        totalSessions,
        remainingSessions,
        75,
      );
      const threshold80 = classesNeededForThreshold(
        presentCount,
        totalSessions,
        remainingSessions,
        80,
      );
      const threshold90 = classesNeededForThreshold(
        presentCount,
        totalSessions,
        remainingSessions,
        90,
      );

      const dynamicMessage =
        percentage >= 75
          ? `You are eligible for ${courseCode} exams.`
          : `You need ${threshold75} more classes for exam eligibility in ${courseCode}.`;

      // Class average
      const allEnrollmentRecords = enrollment.courseSection.enrollments.flatMap(
        (e) => e.attendanceRecords,
      );
      const classPresent = allEnrollmentRecords.filter((r) =>
        ['PRESENT', 'LATE', 'MANUAL_OVERRIDE'].includes(r.status),
      ).length;
      const classTotal = enrollment.courseSection.enrollments.length * totalSessions;
      const classAverage = computeAttendancePercentage(classPresent, classTotal);

      const diff = classAverage > 0 ? ((percentage - classAverage) / classAverage) * 100 : 0;
      const absDiff = Math.abs(diff).toFixed(1);
      const benchmarkMessage =
        diff >= 0
          ? `Your attendance is ${absDiff}% above the class average.`
          : `Your attendance is ${absDiff}% below the class average.`;

      // Absence clustering: 3+ absences on same weekday
      const absencesByDay: Record<number, number> = {};
      for (const record of enrollment.attendanceRecords) {
        if (record.status === 'ABSENT' && record.session?.scheduledStart) {
          const day = new Date(record.session.scheduledStart).getDay();
          absencesByDay[day] = (absencesByDay[day] ?? 0) + 1;
        }
      }
      const absenceClustering = Object.values(absencesByDay).some((count) => count >= 3);

      return {
        courseCode,
        percentage,
        threshold75,
        threshold80,
        threshold90,
        dynamicMessage,
        classAverage,
        benchmarkMessage,
        absenceClustering,
      };
    }),
  );

  return { courses };
}
