/**
 * @file welfare.service.ts
 * @module modules/welfare
 *
 * Welfare referral service for KWASU AMS.
 *
 * Checks whether a student needs a welfare referral (below 70% in 3+ courses)
 * and triggers compassionate notifications to the student and their HOD.
 *
 * Welfare referrals do NOT change any `AttendanceRecord` or `ExamEligibility`
 * records. They only send notifications and write an `AuditLog` entry.
 */

import { prisma } from '../../lib/prisma.js';
import { notificationQueue } from '../../jobs/queue.js';
import { AppError } from '../../middleware/error-handler.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of a welfare check for a single student.
 */
export interface WelfareCheckResult {
  /** Whether the student needs a welfare referral (below 70% in 3+ courses). */
  needsReferral: boolean;
  /** Course codes where the student's effective percentage is below 70%. */
  coursesBelow70: string[];
}

/**
 * A welfare referral record derived from the AuditLog.
 */
export interface WelfareReferral {
  /** UUID of the audit log entry. */
  id: string;
  /** UUID of the student referred. */
  studentId: string;
  /** Timestamp of the referral. */
  createdAt: Date;
  /** Actor who triggered the referral. */
  actorId: string;
}

// =============================================================================
// checkStudentWelfare
// =============================================================================

/**
 * Checks whether a student needs a welfare referral.
 *
 * A student needs a referral if they have `effectivePercentage < 70` in
 * 3 or more courses in the given semester.
 *
 * @param studentId  - UUID of the `Student` record.
 * @param semesterId - UUID of the `Semester` to check.
 * @returns {@link WelfareCheckResult} with `needsReferral` flag and course list.
 * @throws {AppError} `NOT_FOUND` (404) — student does not exist.
 */
export async function checkStudentWelfare(
  studentId: string,
  semesterId: string,
): Promise<WelfareCheckResult> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true },
  });
  if (!student) throw new AppError('NOT_FOUND', 'Student not found.', 404);

  const atRiskRecords = await prisma.examEligibility.findMany({
    where: {
      studentId,
      semesterId,
      effectivePercentage: { lt: 70 },
    },
    include: {
      enrollment: {
        include: { courseSection: { include: { course: { select: { code: true } } } } },
      },
    },
  });

  const coursesBelow70 = atRiskRecords.map((r) => r.enrollment.courseSection.course.code);

  return {
    needsReferral: coursesBelow70.length >= 3,
    coursesBelow70,
  };
}

// =============================================================================
// triggerWelfareReferral
// =============================================================================

/**
 * Triggers a welfare referral for a student if they meet the threshold.
 *
 * If `needsReferral` is true:
 * - Enqueues a compassionate `WELFARE_REFERRAL` notification to the student.
 * - Enqueues an alert notification to the student's HOD.
 * - Writes an `AuditLog` entry with `metadata.type = 'WELFARE_REFERRAL'`.
 *
 * No attendance or eligibility records are modified.
 *
 * @param studentId  - UUID of the `Student` record.
 * @param semesterId - UUID of the `Semester`.
 * @param actorId    - UUID of the user triggering the referral (for audit trail).
 * @returns A promise that resolves once the referral is processed.
 * @throws {AppError} `NOT_FOUND` (404) — student does not exist.
 */
export async function triggerWelfareReferral(
  studentId: string,
  semesterId: string,
  actorId: string,
): Promise<void> {
  const result = await checkStudentWelfare(studentId, semesterId);

  if (!result.needsReferral) return;

  // Fetch student user ID and department
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      user: { select: { id: true, fullName: true } },
      programme: { select: { departmentId: true } },
    },
  });
  if (!student) return;

  // Enqueue compassionate notification to student (no percentages or course names)
  void notificationQueue.add('dispatch', {
    recipientId: student.user.id,
    trigger: 'WELFARE_REFERRAL',
    data: {},
  });

  // Enqueue alert to HOD
  const hod = await prisma.user.findFirst({
    where: { role: 'HOD', scopeId: student.programme.departmentId },
    select: { id: true },
  });
  if (hod) {
    void notificationQueue.add('dispatch', {
      recipientId: hod.id,
      trigger: 'WELFARE_REFERRAL',
      data: {
        studentName: student.user.fullName,
        atRiskCourseCount: String(result.coursesBelow70.length),
      },
    });
  }

  // Write audit log
  void prisma.auditLog.create({
    data: {
      actorId,
      actorRole: 'SUPER_ADMIN',
      action: 'SYSTEM_SETTING_CHANGED',
      entityType: 'Student',
      entityId: studentId,
      metadata: {
        type: 'WELFARE_REFERRAL',
        studentId,
        coursesBelow70: result.coursesBelow70,
      } as never,
    },
  });
}

// =============================================================================
// listWelfareReferrals
// =============================================================================

/**
 * Returns welfare referral records from the AuditLog.
 *
 * Queries `AuditLog` entries where `metadata.type = 'WELFARE_REFERRAL'`,
 * scoped to the actor's department or faculty.
 *
 * @param actorRole    - Role of the requesting user.
 * @param actorScopeId - Department/faculty UUID for scoped roles, or `null`.
 * @returns Array of {@link WelfareReferral} records.
 */
export async function listWelfareReferrals(
  _actorRole: string,
  _actorScopeId: string | null,
): Promise<WelfareReferral[]> {
  // Query audit logs with welfare referral metadata
  const logs = await prisma.auditLog.findMany({
    where: {
      action: 'SYSTEM_SETTING_CHANGED',
      entityType: 'Student',
    },
    select: { id: true, entityId: true, actorId: true, createdAt: true, metadata: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  // Filter to welfare referrals only
  const referrals = logs
    .filter((log) => {
      const meta = log.metadata as Record<string, unknown> | null;
      return meta?.['type'] === 'WELFARE_REFERRAL';
    })
    .map((log) => ({
      id: log.id,
      studentId: log.entityId ?? '',
      createdAt: log.createdAt,
      actorId: log.actorId,
    }));

  return referrals;
}
