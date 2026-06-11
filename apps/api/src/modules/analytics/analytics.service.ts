/**
 * @file analytics.service.ts
 * @module modules/analytics
 *
 * Dashboard data aggregation service for KWASU AMS.
 *
 * `getDashboardData()` returns role-scoped aggregated data shaped to match the
 * `DashboardData` interface consumed by the web frontend (`use-dashboard.ts`).
 * Results are cached in Redis with a 60-second TTL.
 *
 * Every compute function returns field names that exactly match what the
 * frontend hook/components expect — no translation layer needed.
 *
 * Role-specific shapes returned:
 * - `STUDENT`          — attendanceHealth, overallPercentage, coursesEnrolled,
 *                        pendingExcuses, barredCourses
 * - `LECTURER`         — courseTrends, activeSessions, totalStudents, avgRate,
 *                        atRiskCount, atRiskStudents, activeSession
 * - `HOD`              — coursePerformance, lecturerAccountability, courseCount,
 *                        totalStudents, departmentAvgRate, atRiskCount
 * - `DEAN`             — departmentBreakdown, facultyAvgRate, departmentCount,
 *                        courseCount, totalStudents, atRiskCount
 * - `EXAM_OFFICER`     — totalStudentsCount, eligibleCount, barredCount,
 *                        pendingAppealsCount, barredCourses2, pendingAppeals
 * - `VICE_CHANCELLOR`  — universityRate, totalFaculties, totalStudentsCount,
 *                        activeSessionsNow, facultyBreakdown, flaggedCourses,
 *                        weeklyTrend
 * - `SUPER_ADMIN`      — same as VC plus totalUsers, pendingAnomalies,
 *                        webhookEventsToday, systemUptime, recentAuditLogs
 * - `ACADEMIC_AFFAIRS` — same as VC
 *
 * Cache strategy: check Redis first; on miss, compute from DB, store 60s TTL.
 * Active semester resolution: all queries filter by `semester.isActive = true`.
 */

import { type Prisma } from '@prisma/client';
import { Role } from '@kwasu-ams/types';
import { computeAttendancePercentage, classesNeededForThreshold } from '@kwasu-ams/utils';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { getUptime } from '../../lib/uptime.js';

// =============================================================================
// Internal types
// =============================================================================

/**
 * Attendance health card for a single course (STUDENT dashboard).
 */
export interface AttendanceHealthCard {
  /** Course code, e.g. `'BIO201'`. */
  courseCode: string;
  /** Course title. */
  courseTitle: string;
  /** Number of sessions the student was present / late / override. */
  present: number;
  /** Total closed/locked sessions in the semester. */
  total: number;
  /** Attendance percentage rounded to 2 decimal places. */
  percentage: number;
  /** Eligibility status string. */
  status: string;
}

/**
 * Trend direction for course attendance over time.
 */
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
    courseCode: string;
    percentage: number;
    threshold75: number;
    threshold80: number;
    threshold90: number;
    dynamicMessage: string;
    classAverage: number;
    benchmarkMessage: string;
    absenceClustering: boolean;
  }>;
}

// =============================================================================
// Cache TTLs
// =============================================================================

/** Redis cache TTL for dashboard aggregates in seconds. */
const CACHE_TTL_SECONDS = 60;

/** Analytics cache TTL in seconds (5 minutes). */
const ANALYTICS_CACHE_TTL = 300;

// =============================================================================
// Public entry point
// =============================================================================

/**
 * Returns role-scoped dashboard data for the authenticated user.
 *
 * Checks Redis cache first. On cache miss, computes from the database and
 * stores the result with a 60-second TTL.
 *
 * If no active semester exists, returns `{ message: 'No active semester' }`.
 *
 * @param userId  - UUID of the authenticated `User`.
 * @param role    - Role of the authenticated user.
 * @param scopeId - Faculty/department UUID for scoped roles, or `null`.
 * @returns Role-specific dashboard data object shaped to match the frontend `DashboardData` interface.
 */
export async function getDashboardData(
  userId: string,
  role: Role,
  scopeId: string | null,
): Promise<Record<string, unknown>> {
  const activeSemester = await prisma.semester.findFirst({
    where: { isActive: true },
    select: { id: true, eligibilityThreshold: true, examStartDate: true },
  });

  if (!activeSemester) {
    return { message: 'No active semester' };
  }

  const semesterId = activeSemester.id;
  const threshold = activeSemester.eligibilityThreshold;
  const examStartDate = activeSemester.examStartDate;

  const cacheKey = buildCacheKey(role, userId, scopeId, semesterId);

  const cached = await redis.get(cacheKey);
  if (cached !== null) {
    return JSON.parse(cached) as Record<string, unknown>;
  }

  const data = await computeDashboardData(
    userId,
    role,
    scopeId,
    semesterId,
    threshold,
    examStartDate,
  );

  void redis.set(cacheKey, JSON.stringify(data), 'EX', CACHE_TTL_SECONDS);

  return data;
}

// =============================================================================
// Cache key builder
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
    case Role.ACADEMIC_AFFAIRS:
      return `dashboard:vc:${semesterId}`;
    case Role.SUPER_ADMIN:
      return `dashboard:superadmin:${semesterId}`;
    case Role.DEAN:
      return `dashboard:dean:${scopeId ?? userId}:${semesterId}`;
    case Role.HOD:
      return `dashboard:hod:${scopeId ?? userId}:${semesterId}`;
    case Role.LECTURER:
      return `dashboard:lecturer:${userId}:${semesterId}`;
    case Role.STUDENT:
      return `dashboard:student:${userId}:${semesterId}`;
    case Role.EXAM_OFFICER:
      return `dashboard:examofficer:${scopeId ?? 'all'}:${semesterId}`;
    default:
      return `dashboard:${role}:${userId}:${semesterId}`;
  }
}

// =============================================================================
// Dispatcher
// =============================================================================

/**
 * Dispatches to the correct role-specific compute function.
 *
 * @param userId       - UUID of the authenticated user.
 * @param role         - Role of the authenticated user.
 * @param scopeId      - Scope UUID or null.
 * @param semesterId   - Active semester UUID.
 * @param threshold    - Eligibility threshold percentage.
 * @param examStartDate - Exam start date for eligibility banner calculation.
 * @returns Computed dashboard data record.
 */
async function computeDashboardData(
  userId: string,
  role: Role,
  scopeId: string | null,
  semesterId: string,
  threshold: number,
  examStartDate: Date | null,
): Promise<Record<string, unknown>> {
  switch (role) {
    case Role.VICE_CHANCELLOR:
    case Role.ACADEMIC_AFFAIRS:
      return computeVcDashboard(semesterId);
    case Role.SUPER_ADMIN:
      return computeSuperAdminDashboard(semesterId);
    case Role.DEAN:
      return computeDeanDashboard(scopeId, semesterId);
    case Role.HOD:
      return computeHodDashboard(scopeId, semesterId, threshold);
    case Role.LECTURER:
      return computeLecturerDashboard(userId, semesterId, threshold);
    case Role.STUDENT:
      return computeStudentDashboard(userId, semesterId, examStartDate);
    case Role.EXAM_OFFICER:
      return computeExamOfficerDashboard(semesterId, scopeId);
    default:
      return { message: 'Dashboard not available for this role.' };
  }
}

// =============================================================================
// STUDENT
// =============================================================================

/**
 * Computes student-scoped dashboard data.
 *
 * Returns fields: `attendanceHealth`, `overallPercentage`, `coursesEnrolled`,
 * `pendingExcuses`, `barredCourses`, `daysTillExam`.
 *
 * @param userId        - UUID of the student `User`.
 * @param semesterId    - Active semester UUID.
 * @param examStartDate - Exam period start date, or null if not set.
 * @returns Student dashboard data shaped to match the frontend `DashboardData` interface.
 */
async function computeStudentDashboard(
  userId: string,
  semesterId: string,
  examStartDate: Date | null,
): Promise<Record<string, unknown>> {
  const student = await prisma.student.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!student) {
    return {
      attendanceHealth: [],
      overallPercentage: 0,
      coursesEnrolled: 0,
      pendingExcuses: 0,
      barredCourses: [],
    };
  }

  const enrollments = await prisma.courseEnrollment.findMany({
    where: { studentId: student.id, courseSection: { semesterId } },
    select: {
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

  const attendanceHealth = enrollments.map((enrollment) => {
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

  const overallPercentage =
    attendanceHealth.length > 0
      ? Math.round(
          (attendanceHealth.reduce((sum, c) => sum + c.percentage, 0) / attendanceHealth.length) *
            100,
        ) / 100
      : 0;

  const barredCourses = attendanceHealth
    .filter((c) => c.status === 'BARRED')
    .map((c) => c.courseCode);

  const pendingExcuses = await prisma.excuseLetter.count({
    where: {
      studentId: student.id,
      status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'APPEAL_SUBMITTED'] },
    },
  });

  const daysTillExam =
    examStartDate !== null
      ? Math.max(0, Math.ceil((examStartDate.getTime() - Date.now()) / 86_400_000))
      : null;

  return {
    attendanceHealth,
    overallPercentage,
    coursesEnrolled: enrollments.length,
    pendingExcuses,
    barredCourses,
    ...(daysTillExam !== null ? { daysTillExam } : {}),
  };
}

// =============================================================================
// LECTURER
// =============================================================================

/**
 * Computes lecturer-scoped dashboard data.
 *
 * Returns fields: `courseTrends`, `activeSessions`, `totalStudents`,
 * `avgRate`, `atRiskCount`, `atRiskStudents`, `activeSession`.
 *
 * `courseTrends` uses `sessions: [{sessionLabel, rate}]` shape expected by
 * `buildChartData` in `LecturerDashboard.tsx`.
 *
 * @param userId     - UUID of the lecturer `User`.
 * @param semesterId - Active semester UUID.
 * @param threshold  - Eligibility threshold percentage.
 * @returns Lecturer dashboard data shaped to match the frontend `DashboardData` interface.
 */
async function computeLecturerDashboard(
  userId: string,
  semesterId: string,
  threshold: number,
): Promise<Record<string, unknown>> {
  const lecturer = await prisma.lecturer.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!lecturer) {
    return {
      courseTrends: [],
      activeSessions: 0,
      totalStudents: 0,
      avgRate: 0,
      atRiskCount: 0,
      atRiskStudents: [],
      activeSession: null,
    };
  }

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
        select: {
          student: {
            select: {
              id: true,
              matricNumber: true,
              user: { select: { fullName: true } },
            },
          },
          attendanceRecords: { select: { status: true } },
        },
      },
    },
  });

  // courseTrends shaped as [{courseCode, sessions:[{sessionLabel, rate}]}]
  // to match what LecturerDashboard's buildChartData expects.
  const courseTrends = sections.map((section) => {
    const orderedSessions = section.sessions.slice().reverse(); // oldest first
    const sessions = orderedSessions.map((session, idx) => {
      const total = session.attendanceRecords.length;
      const present = session.attendanceRecords.filter((r) =>
        ['PRESENT', 'LATE', 'MANUAL_OVERRIDE', 'EXCUSED'].includes(r.status),
      ).length;
      return {
        sessionLabel: `S${idx + 1}`,
        rate: computeAttendancePercentage(present, total),
      };
    });
    return { courseCode: section.course.code, sessions };
  });

  // Aggregate stats
  let totalStudents = 0;
  let atRiskCount = 0;
  let rateSum = 0;
  let rateCount = 0;
  const atRiskStudents: Array<{
    id: string;
    matricNumber: string;
    fullName: string;
    percentage: number;
    courseCode: string;
  }> = [];

  for (const section of sections) {
    const sessionCount = section.sessions.length;
    totalStudents += section.enrollments.length;

    for (const enrollment of section.enrollments) {
      const present = enrollment.attendanceRecords.filter((r) =>
        ['PRESENT', 'LATE', 'MANUAL_OVERRIDE', 'EXCUSED'].includes(r.status),
      ).length;
      const pct = computeAttendancePercentage(present, sessionCount);
      rateSum += pct;
      rateCount++;
      if (pct < threshold) {
        atRiskCount++;
        atRiskStudents.push({
          id: enrollment.student.id,
          matricNumber: enrollment.student.matricNumber,
          fullName: enrollment.student.user.fullName,
          percentage: pct,
          courseCode: section.course.code,
        });
      }
    }
  }

  const avgRate = rateCount > 0 ? Math.round((rateSum / rateCount) * 100) / 100 : 0;

  const activeSessions = await prisma.courseSession.count({
    where: { lecturerId: lecturer.id, status: 'ACTIVE' },
  });

  const activeSessionRecord = await prisma.courseSession.findFirst({
    where: { lecturerId: lecturer.id, status: 'ACTIVE' },
    select: {
      id: true,
      courseSection: { select: { course: { select: { code: true } } } },
      attendanceRecords: { select: { id: true } },
    },
  });

  const activeSession = activeSessionRecord
    ? {
        sessionId: activeSessionRecord.id,
        courseCode: activeSessionRecord.courseSection.course.code,
        checkinCount: activeSessionRecord.attendanceRecords.length,
      }
    : null;

  return {
    courseTrends,
    activeSessions,
    totalStudents,
    avgRate,
    atRiskCount,
    atRiskStudents,
    activeSession,
  };
}

// =============================================================================
// HOD
// =============================================================================

/**
 * Computes department-scoped dashboard data for HOD.
 *
 * Returns fields: `coursePerformance`, `lecturerAccountability`, `courseCount`,
 * `totalStudents`, `departmentAvgRate`, `atRiskCount`.
 *
 * @param departmentId - UUID of the HOD's department scope.
 * @param semesterId   - Active semester UUID.
 * @param threshold    - Eligibility threshold percentage.
 * @returns HOD dashboard data shaped to match the frontend `DashboardData` interface.
 */
async function computeHodDashboard(
  departmentId: string | null,
  semesterId: string,
  threshold: number,
): Promise<Record<string, unknown>> {
  const courseWhere: Prisma.CourseSectionWhereInput = {
    semesterId,
    ...(departmentId ? { course: { departmentId } } : {}),
  };

  const sections = await prisma.courseSection.findMany({
    where: courseWhere,
    select: {
      id: true,
      course: { select: { code: true, title: true } },
      lecturer: {
        select: {
          id: true,
          staffId: true,
          user: { select: { fullName: true } },
          assignedSections: {
            where: { semesterId },
            select: {
              sessions: {
                select: { status: true, scheduledStart: true },
              },
            },
          },
        },
      },
      sessions: {
        where: { status: { in: ['CLOSED', 'LOCKED'] } },
        select: {
          scheduledStart: true,
          attendanceRecords: { select: { status: true } },
        },
        orderBy: { scheduledStart: 'asc' },
      },
      enrollments: {
        select: {
          student: {
            select: { matricNumber: true, user: { select: { fullName: true } } },
          },
          attendanceRecords: { select: { status: true } },
        },
      },
    },
  });

  let totalPresent = 0;
  let totalRecords = 0;
  let atRiskCount = 0;
  let totalStudents = 0;

  const coursePerformance = sections.map((section) => {
    let present = 0;
    let total = 0;

    for (const session of section.sessions) {
      for (const record of session.attendanceRecords) {
        total++;
        if (['PRESENT', 'LATE', 'MANUAL_OVERRIDE', 'EXCUSED'].includes(record.status)) {
          present++;
        }
      }
    }

    totalPresent += present;
    totalRecords += total;
    totalStudents += section.enrollments.length;

    const rate = computeAttendancePercentage(present, total);

    // Trend: compare last 2 sessions vs previous 2
    const rates = section.sessions.map((s) => {
      const sp = s.attendanceRecords.filter((r) =>
        ['PRESENT', 'LATE', 'MANUAL_OVERRIDE', 'EXCUSED'].includes(r.status),
      ).length;
      return computeAttendancePercentage(sp, s.attendanceRecords.length);
    });
    const last2Avg =
      rates.length >= 2 ? (rates[rates.length - 1]! + rates[rates.length - 2]!) / 2 : rate;
    const prev2Avg =
      rates.length >= 4 ? (rates[rates.length - 3]! + rates[rates.length - 4]!) / 2 : rate;
    const trend: 'up' | 'down' | 'stable' =
      last2Avg - prev2Avg > 3 ? 'up' : last2Avg - prev2Avg < -3 ? 'down' : 'stable';

    for (const enrollment of section.enrollments) {
      const sp = enrollment.attendanceRecords.filter((r) =>
        ['PRESENT', 'LATE', 'MANUAL_OVERRIDE', 'EXCUSED'].includes(r.status),
      ).length;
      if (computeAttendancePercentage(sp, section.sessions.length) < threshold) atRiskCount++;
    }

    return {
      courseCode: section.course.code,
      courseTitle: section.course.title,
      lecturerName: section.lecturer?.user.fullName ?? '—',
      rate,
      trend,
    };
  });

  const departmentAvgRate = computeAttendancePercentage(totalPresent, totalRecords);

  // Lecturer accountability — sessions held vs total timetabled
  const lecturerMap = new Map<
    string,
    { lecturerName: string; sessionsHeld: number; sessionsScheduled: number }
  >();
  for (const section of sections) {
    if (!section.lecturer) continue;
    const lid = section.lecturer.id;
    if (!lecturerMap.has(lid)) {
      lecturerMap.set(lid, {
        lecturerName: section.lecturer.user.fullName,
        sessionsHeld: 0,
        sessionsScheduled: 0,
      });
    }
    const entry = lecturerMap.get(lid)!;
    const allSessions = section.lecturer.assignedSections.flatMap((s) => s.sessions);
    entry.sessionsHeld += allSessions.filter((s) =>
      ['CLOSED', 'LOCKED', 'ACTIVE'].includes(s.status),
    ).length;
    entry.sessionsScheduled += allSessions.length;
  }

  const lecturerAccountability = Array.from(lecturerMap.entries()).map(([lecturerId, v]) => ({
    lecturerId,
    lecturerName: v.lecturerName,
    sessionsHeld: v.sessionsHeld,
    sessionsScheduled: v.sessionsScheduled,
    accountabilityPct:
      v.sessionsScheduled > 0
        ? Math.round((v.sessionsHeld / v.sessionsScheduled) * 10_000) / 100
        : 0,
  }));

  return {
    courseCount: sections.length,
    totalStudents,
    departmentAvgRate,
    atRiskCount,
    coursePerformance,
    lecturerAccountability,
  };
}

// =============================================================================
// DEAN
// =============================================================================

/**
 * Computes faculty-scoped dashboard data for DEAN.
 *
 * Returns fields: `departmentBreakdown`, `facultyAvgRate`, `departmentCount`,
 * `courseCount`, `totalStudents`, `atRiskCount`.
 *
 * @param facultyId  - UUID of the dean's faculty scope, or null for all.
 * @param semesterId - Active semester UUID.
 * @returns Dean dashboard data shaped to match the frontend `DashboardData` interface.
 */
async function computeDeanDashboard(
  facultyId: string | null,
  semesterId: string,
): Promise<Record<string, unknown>> {
  const where: Prisma.DepartmentWhereInput = facultyId ? { facultyId } : {};

  const departments = await prisma.department.findMany({
    where,
    select: {
      id: true,
      name: true,
      programmes: {
        select: {
          students: {
            select: {
              enrollments: {
                where: { courseSection: { semesterId } },
                select: {
                  courseSection: { select: { id: true } },
                  attendanceRecords: { select: { status: true } },
                  examEligibilities: { where: { semesterId }, select: { status: true } },
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
  let totalStudents = 0;
  const courseSectionIds = new Set<string>();

  const departmentBreakdown = departments.map((dept) => {
    let present = 0;
    let total = 0;
    let deptStudentCount = 0;

    for (const prog of dept.programmes) {
      for (const student of prog.students) {
        deptStudentCount++;
        for (const enrollment of student.enrollments) {
          courseSectionIds.add(enrollment.courseSection.id);
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

    totalStudents += deptStudentCount;

    return {
      departmentId: dept.id,
      departmentName: dept.name,
      avgRate: computeAttendancePercentage(present, total),
      studentCount: deptStudentCount,
    };
  });

  return {
    departmentCount: departments.length,
    courseCount: courseSectionIds.size,
    totalStudents,
    facultyAvgRate: computeAttendancePercentage(totalPresent, totalRecords),
    atRiskCount,
    departmentBreakdown,
  };
}

// =============================================================================
// EXAM OFFICER
// =============================================================================

/**
 * Computes exam officer dashboard data with eligibility summary.
 *
 * Scoped to the exam officer's department via `scopeId`. Counts distinct
 * students (not eligibility rows) to avoid inflated totals from multi-course
 * enrollments.
 *
 * Returns fields: `totalStudentsCount`, `eligibleCount`, `barredCount`,
 * `pendingAppealsCount`, `barredCourses2`, `pendingAppeals`.
 *
 * @param semesterId   - Active semester UUID.
 * @param departmentId - UUID of the exam officer's department scope, or null for all.
 * @returns Exam officer dashboard data shaped to match the frontend `DashboardData` interface.
 */
async function computeExamOfficerDashboard(
  semesterId: string,
  departmentId: string | null,
): Promise<Record<string, unknown>> {
  // Base filter: eligibility records for this semester, scoped to department
  const eligWhere: Prisma.ExamEligibilityWhereInput = {
    semesterId,
    ...(departmentId
      ? {
          enrollment: {
            courseSection: { course: { departmentId } },
          },
        }
      : {}),
  };

  // Count distinct students (not eligibility rows)
  const [allStudentIds, eligibleStudentIds, barredStudentIds] = await Promise.all([
    prisma.examEligibility
      .findMany({ where: eligWhere, select: { studentId: true }, distinct: ['studentId'] })
      .then((rows) => rows.map((r) => r.studentId)),
    prisma.examEligibility
      .findMany({
        where: { ...eligWhere, status: 'ELIGIBLE' },
        select: { studentId: true },
        distinct: ['studentId'],
      })
      .then((rows) => rows.map((r) => r.studentId)),
    prisma.examEligibility
      .findMany({
        where: { ...eligWhere, status: 'BARRED' },
        select: { studentId: true },
        distinct: ['studentId'],
      })
      .then((rows) => rows.map((r) => r.studentId)),
  ]);

  const totalStudentsCount = allStudentIds.length;
  const eligibleCount = eligibleStudentIds.length;
  const barredCount = barredStudentIds.length;

  // Barred courses summary
  const barredRecords = await prisma.examEligibility.findMany({
    where: { ...eligWhere, status: { in: ['BARRED', 'CONDITIONAL'] } },
    select: {
      status: true,
      enrollment: {
        select: {
          courseSection: {
            select: { course: { select: { code: true, title: true } } },
          },
        },
      },
    },
  });

  const barredCourseMap = new Map<
    string,
    { courseTitle: string; barredStudents: number; conditionalStudents: number }
  >();
  for (const rec of barredRecords) {
    const code = rec.enrollment.courseSection.course.code;
    const title = rec.enrollment.courseSection.course.title;
    if (!barredCourseMap.has(code)) {
      barredCourseMap.set(code, { courseTitle: title, barredStudents: 0, conditionalStudents: 0 });
    }
    const entry = barredCourseMap.get(code)!;
    if (rec.status === 'BARRED') entry.barredStudents++;
    else entry.conditionalStudents++;
  }

  const barredCourses2 = Array.from(barredCourseMap.entries()).map(([courseCode, v]) => ({
    courseCode,
    courseTitle: v.courseTitle,
    barredStudents: v.barredStudents,
    conditionalStudents: v.conditionalStudents,
  }));

  // Pending appeals scoped to department
  const appealsWhere: Prisma.ExcuseLetterWhereInput = {
    status: 'APPEAL_SUBMITTED',
    courseSectionId: {
      in: await prisma.courseSection
        .findMany({
          where: {
            semesterId,
            ...(departmentId ? { course: { departmentId } } : {}),
          },
          select: { id: true },
        })
        .then((rows) => rows.map((r) => r.id)),
    },
  };

  const appealsRaw = await prisma.excuseLetter.findMany({
    where: appealsWhere,
    select: {
      id: true,
      student: { select: { user: { select: { fullName: true } } } },
      courseSection: { select: { course: { select: { code: true } } } },
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });

  const pendingAppeals = appealsRaw.map((a) => ({
    appealId: a.id,
    studentName: a.student.user.fullName,
    courseCode: a.courseSection.course.code,
    submittedAt: a.createdAt.toISOString(),
  }));

  return {
    totalStudentsCount,
    eligibleCount,
    barredCount,
    pendingAppealsCount: pendingAppeals.length,
    barredCourses2,
    pendingAppeals,
  };
}

// =============================================================================
// VICE CHANCELLOR / ACADEMIC AFFAIRS
// =============================================================================

/**
 * Computes university-wide dashboard data for VC and Academic Affairs.
 *
 * Returns fields: `universityRate`, `totalFaculties`, `totalStudentsCount`,
 * `activeSessionsNow`, `facultyBreakdown`, `flaggedCourses`, `weeklyTrend`.
 *
 * @param semesterId - Active semester UUID.
 * @returns VC/Academic Affairs dashboard data shaped to match the frontend `DashboardData` interface.
 */
async function computeVcDashboard(semesterId: string): Promise<Record<string, unknown>> {
  const faculties = await prisma.faculty.findMany({
    select: {
      id: true,
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

  let uniPresent = 0;
  let uniTotal = 0;
  let totalStudentsCount = 0;

  const facultyBreakdown = faculties.map((f) => {
    let present = 0;
    let total = 0;
    let studentCount = 0;

    for (const dept of f.departments) {
      for (const prog of dept.programmes) {
        for (const student of prog.students) {
          studentCount++;
          for (const enrollment of student.enrollments) {
            for (const record of enrollment.attendanceRecords) {
              total++;
              uniTotal++;
              if (['PRESENT', 'LATE', 'MANUAL_OVERRIDE', 'EXCUSED'].includes(record.status)) {
                present++;
                uniPresent++;
              }
            }
          }
        }
      }
    }

    totalStudentsCount += studentCount;
    return {
      facultyId: f.id,
      facultyName: f.name,
      avgRate: computeAttendancePercentage(present, total),
      studentCount,
    };
  });

  const universityRate = computeAttendancePercentage(uniPresent, uniTotal);
  const activeSessionsNow = await prisma.courseSession.count({ where: { status: 'ACTIVE' } });

  // Flagged courses — sections with < 60% attendance, include dept + lecturer
  const flaggedSections = await prisma.courseSection.findMany({
    where: { semesterId },
    select: {
      course: {
        select: {
          code: true,
          title: true,
          department: { select: { name: true } },
        },
      },
      lecturer: { select: { user: { select: { fullName: true } } } },
      sessions: {
        where: { status: { in: ['CLOSED', 'LOCKED'] } },
        select: { attendanceRecords: { select: { status: true } } },
      },
    },
  });

  const flaggedCourses = flaggedSections
    .map((cs) => {
      let present = 0;
      let total = 0;
      for (const session of cs.sessions) {
        for (const record of session.attendanceRecords) {
          total++;
          if (['PRESENT', 'LATE', 'MANUAL_OVERRIDE', 'EXCUSED'].includes(record.status)) present++;
        }
      }
      const rate = computeAttendancePercentage(present, total);
      return {
        courseCode: cs.course.code,
        courseTitle: cs.course.title,
        departmentName: cs.course.department.name,
        lecturerName: cs.lecturer?.user.fullName ?? '—',
        rate,
      };
    })
    .filter((c) => c.rate < 60 && c.rate > 0);

  // 12-week attendance trend — one data point per week
  const weeklyTrend = await buildWeeklyTrend(semesterId, 12);

  return {
    universityRate,
    totalFaculties: faculties.length,
    totalStudentsCount,
    activeSessionsNow,
    facultyBreakdown,
    flaggedCourses,
    weeklyTrend,
  };
}

// =============================================================================
// SUPER ADMIN
// =============================================================================

/**
 * Computes super admin dashboard data — extends VC data with system stats.
 *
 * Returns all VC fields plus: `totalUsers`, `pendingAnomalies`,
 * `webhookEventsToday`, `systemUptime`, `recentAuditLogs`.
 *
 * @param semesterId - Active semester UUID.
 * @returns Super admin dashboard data shaped to match the frontend `DashboardData` interface.
 */
async function computeSuperAdminDashboard(semesterId: string): Promise<Record<string, unknown>> {
  const [
    vcData,
    totalUsers,
    totalStudents,
    totalStaff,
    totalDepartments,
    pendingAnomalies,
    webhookEventsToday,
    recentAuditLogsRaw,
  ] = await Promise.all([
    computeVcDashboard(semesterId),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.student.count(),
    prisma.lecturer.count(),
    prisma.department.count(),
    prisma.anomalyFlag.count({ where: { isReviewed: false } }),
    // No WebhookEvent model — count WEBHOOK_FIRED audit entries today as a proxy
    prisma.auditLog.count({
      where: {
        action: 'WEBHOOK_FIRED',
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        action: true,
        entityType: true,
        createdAt: true,
        actor: {
          select: {
            fullName: true,
            identifier: true, // matric number for students, staff ID for staff
          },
        },
      },
    }),
  ]);

  const recentAuditLogs = recentAuditLogsRaw.map((log) => ({
    id: log.id,
    actorName: log.actor?.fullName ?? 'System',
    actorIdentifier: log.actor?.identifier ?? '—',
    action: log.action,
    entityType: log.entityType,
    timestamp: log.createdAt.toISOString(),
  }));

  return {
    ...vcData,
    totalUsers,
    registeredStudents: totalStudents,
    totalStaff,
    totalDepartments,
    pendingAnomalies,
    webhookEventsToday,
    systemUptime: getUptime(),
    recentAuditLogs,
  };
}

// =============================================================================
// Weekly trend helper
// =============================================================================

/**
 * Builds a per-week attendance rate series for the given semester.
 *
 * Queries closed/locked sessions grouped by ISO week and computes the
 * university-wide attendance rate for each week.
 *
 * @param semesterId - Active semester UUID.
 * @param weeks      - Number of past weeks to include (most recent first, then reversed).
 * @returns Array of `{ week: string; rate: number }` objects, oldest week first.
 */
async function buildWeeklyTrend(
  semesterId: string,
  weeks: number,
): Promise<Array<{ week: string; rate: number }>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeks * 7);

  const sessions = await prisma.courseSession.findMany({
    where: {
      courseSection: { semesterId },
      status: { in: ['CLOSED', 'LOCKED'] },
      scheduledStart: { gte: cutoff },
    },
    select: {
      scheduledStart: true,
      attendanceRecords: { select: { status: true } },
    },
    orderBy: { scheduledStart: 'asc' },
  });

  // Group by ISO week label "YYYY-Www"
  const weekMap = new Map<string, { present: number; total: number }>();
  for (const session of sessions) {
    const d = new Date(session.scheduledStart);
    const weekLabel = isoWeekLabel(d);
    const entry = weekMap.get(weekLabel) ?? { present: 0, total: 0 };
    for (const record of session.attendanceRecords) {
      entry.total++;
      if (['PRESENT', 'LATE', 'MANUAL_OVERRIDE', 'EXCUSED'].includes(record.status)) {
        entry.present++;
      }
    }
    weekMap.set(weekLabel, entry);
  }

  return Array.from(weekMap.entries()).map(([week, v]) => ({
    week,
    rate: computeAttendancePercentage(v.present, v.total),
  }));
}

/**
 * Returns an ISO week label string in `'YYYY-Www'` format for a given date.
 *
 * @param date - The date to format.
 * @returns ISO week label string, e.g. `'2026-W24'`.
 */
function isoWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// =============================================================================
// Course and Student Analytics
// =============================================================================

/**
 * Returns course-level analytics for a course section in a semester.
 *
 * Computes session attendance rates, 4-week trend direction, distribution
 * histogram, and caches the result in Redis for 5 minutes.
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
    return {
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
 * Computes attendance percentage, classes needed for each threshold, dynamic
 * eligibility messages, class benchmark comparison, and absence clustering.
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
      courseSection: {
        select: {
          course: { select: { code: true } },
          sessions: {
            where: { status: { in: ['CLOSED', 'LOCKED'] } },
            select: { id: true, scheduledStart: true },
          },
          enrollments: {
            select: { attendanceRecords: { select: { status: true } } },
          },
        },
      },
      attendanceRecords: {
        select: { status: true, session: { select: { scheduledStart: true } } },
      },
    },
  });

  const courses = enrollments.map((enrollment) => {
    const courseCode = enrollment.courseSection.course.code;
    const totalSessions = enrollment.courseSection.sessions.length;
    const presentCount = enrollment.attendanceRecords.filter((r) =>
      ['PRESENT', 'LATE', 'MANUAL_OVERRIDE'].includes(r.status),
    ).length;
    const percentage = computeAttendancePercentage(presentCount, totalSessions);

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

    const allRecords = enrollment.courseSection.enrollments.flatMap((e) => e.attendanceRecords);
    const classPresent = allRecords.filter((r) =>
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
  });

  return { courses };
}
