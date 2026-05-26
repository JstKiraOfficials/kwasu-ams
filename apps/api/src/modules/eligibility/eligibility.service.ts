/**
 * @file eligibility.service.ts
 * @module modules/eligibility
 *
 * Business logic for the exam eligibility module.
 *
 * Responsibilities:
 * - `computeEligibilityForEnrollment` — Computes raw and effective attendance
 *   percentages and assigns an eligibility status for one student × course.
 * - `computeEligibilityForSemester`   — Batch computation for all enrollments
 *   in a semester. Uses upsert so it is safe to re-run.
 * - `triggerEligibilityComputation`   — Enqueues a BullMQ job and returns the
 *   job ID. Called by `POST /eligibility/compute`.
 * - `getEligibilityForStudent`        — Fetches all eligibility records for a
 *   student in a semester.
 * - `getEligibilityForCourse`         — Scope-aware paginated list for a course.
 * - `freezeEligibility`               — Sets `semester.isFrozen = true`.
 * - `overrideEligibilityStatus`       — DEAN/SUPER_ADMIN override with freeze check.
 *
 * Threshold rules (default 75% NUC minimum):
 * - `effectivePercentage >= threshold` → `ELIGIBLE`
 * - `effectivePercentage >= 70 && < threshold` + approved MEDICAL excuse → `CONDITIONAL`
 * - All other cases below threshold → `BARRED`
 * - No sessions → `PENDING`
 *
 * GPS coordinates are never stored — this service never touches coordinates.
 */

import { type AuditAction, Prisma } from '@prisma/client';
import {
  type IExamEligibility,
  type PaginatedResponse,
  Role,
  EligibilityStatus,
  ExcuseReason,
} from '@kwasu-ams/types';
import { computeAttendancePercentage } from '@kwasu-ams/utils';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error-handler.js';
import { eligibilityComputationQueue } from '../../jobs/queue.js';
import {
  type GetStudentEligibilityQuery,
  type GetCourseEligibilityQuery,
  type OverrideEligibilityInput,
} from './eligibility.schema.js';
import { dispatchWebhookEvent } from '../webhooks/webhook-dispatcher.service.js';

// =============================================================================
// Internal types
// =============================================================================

/**
 * Result of computing eligibility for a single enrollment.
 */
export interface EligibilityComputationResult {
  /** Raw attendance percentage: (PRESENT + LATE + MANUAL_OVERRIDE) / total × 100. */
  rawPercentage: number;
  /** Effective percentage: (PRESENT + LATE + MANUAL_OVERRIDE + EXCUSED) / total × 100. */
  effectivePercentage: number;
  /** Computed eligibility status. */
  status: EligibilityStatus;
  /** Total number of closed/locked sessions in the semester. */
  totalSessions: number;
  /** Count of PRESENT, LATE, and MANUAL_OVERRIDE records. */
  presentCount: number;
  /** Count of EXCUSED records. */
  excusedCount: number;
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Writes an immutable audit log entry. Errors are swallowed.
 *
 * @param actorId    - UUID of the user performing the action.
 * @param actorRole  - Role string of the actor.
 * @param action     - The {@link AuditAction} enum value.
 * @param entityType - Human-readable entity name.
 * @param entityId   - Optional UUID of the affected entity.
 * @param metadata   - Optional free-form context object.
 * @returns A promise that resolves once the log is written (or silently fails).
 */
async function writeAuditLog(
  actorId: string,
  actorRole: string,
  action: AuditAction,
  entityType: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        actorRole: actorRole as never,
        action,
        entityType,
        entityId: entityId ?? null,
        metadata: metadata !== undefined ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  } catch {
    // Fire-and-forget — audit failures must not surface to the caller
  }
}

// =============================================================================
// computeEligibilityForEnrollment
// =============================================================================

/**
 * Computes raw and effective attendance percentages and assigns an eligibility
 * status for a single student × course enrollment.
 *
 * Algorithm:
 * 1. Queries all CLOSED/LOCKED sessions for the enrollment's course section.
 * 2. Counts PRESENT/LATE/MANUAL_OVERRIDE records (raw) and EXCUSED records.
 * 3. Computes raw and effective percentages via `computeAttendancePercentage`.
 * 4. Determines status: ELIGIBLE ≥ threshold, CONDITIONAL (70–threshold + MEDICAL
 *    excuse), BARRED otherwise, PENDING if no sessions.
 *
 * @param enrollmentId - UUID of the `CourseEnrollment` record.
 * @param semesterId   - UUID of the `Semester` to compute against.
 * @returns The computed {@link EligibilityComputationResult}.
 */
export async function computeEligibilityForEnrollment(
  enrollmentId: string,
  semesterId: string,
): Promise<EligibilityComputationResult> {
  // Fetch enrollment to get courseSectionId and studentId
  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { id: enrollmentId },
    select: { id: true, studentId: true, courseSectionId: true },
  });
  if (!enrollment) {
    return {
      rawPercentage: 0,
      effectivePercentage: 0,
      status: EligibilityStatus.PENDING,
      totalSessions: 0,
      presentCount: 0,
      excusedCount: 0,
    };
  }

  // Fetch semester threshold
  const semester = await prisma.semester.findUnique({
    where: { id: semesterId },
    select: { eligibilityThreshold: true },
  });
  const threshold = semester?.eligibilityThreshold ?? 75.0;

  // Step 1: All closed/locked sessions for this course section in the semester
  const sessions = await prisma.courseSession.findMany({
    where: {
      courseSectionId: enrollment.courseSectionId,
      status: { in: ['CLOSED', 'LOCKED'] },
    },
    select: { id: true },
  });

  const totalSessions = sessions.length;

  // Step 2: Return PENDING if no sessions
  if (totalSessions === 0) {
    return {
      rawPercentage: 0,
      effectivePercentage: 0,
      status: EligibilityStatus.PENDING,
      totalSessions: 0,
      presentCount: 0,
      excusedCount: 0,
    };
  }

  const sessionIds = sessions.map((s) => s.id);

  // Step 3: Attendance records for this enrollment
  const records = await prisma.attendanceRecord.findMany({
    where: { enrollmentId, sessionId: { in: sessionIds } },
    select: { status: true },
  });

  const presentCount = records.filter((r) =>
    ['PRESENT', 'LATE', 'MANUAL_OVERRIDE'].includes(r.status),
  ).length;

  const excusedCount = records.filter((r) => r.status === 'EXCUSED').length;

  // Steps 6–7: Compute percentages
  const rawPercentage = computeAttendancePercentage(presentCount, totalSessions);
  const effectivePercentage = computeAttendancePercentage(
    presentCount + excusedCount,
    totalSessions,
  );

  // Step 9: Determine status
  let status: EligibilityStatus;

  if (effectivePercentage >= threshold) {
    status = EligibilityStatus.ELIGIBLE;
  } else if (effectivePercentage >= 70) {
    // Check for approved MEDICAL excuse covering the shortfall
    const medicalExcuse = await prisma.excuseLetter.findFirst({
      where: {
        studentId: enrollment.studentId,
        courseSectionId: enrollment.courseSectionId,
        reason: ExcuseReason.MEDICAL,
        status: { in: ['APPROVED', 'HOD_APPROVED'] },
      },
    });
    status = medicalExcuse ? EligibilityStatus.CONDITIONAL : EligibilityStatus.BARRED;
  } else {
    status = EligibilityStatus.BARRED;
  }

  return { rawPercentage, effectivePercentage, status, totalSessions, presentCount, excusedCount };
}

// =============================================================================
// computeEligibilityForSemester
// =============================================================================

/**
 * Batch-computes eligibility for all enrollments in a semester.
 *
 * Uses `upsert` so it is safe to re-run — existing records are updated with
 * fresh percentages. Returns counts of successful computations and errors.
 *
 * @param semesterId - UUID of the `Semester` to compute eligibility for.
 * @returns An object with `computed` (success count) and `errors` (failure count).
 */
export async function computeEligibilityForSemester(
  semesterId: string,
): Promise<{ computed: number; errors: number }> {
  // All enrollments for course sections in this semester
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { courseSection: { semesterId }, droppedAt: null },
    select: { id: true, studentId: true },
  });

  let computed = 0;
  let errors = 0;
  const now = new Date();

  for (const enrollment of enrollments) {
    try {
      const result = await computeEligibilityForEnrollment(enrollment.id, semesterId);

      await prisma.examEligibility.upsert({
        where: {
          studentId_enrollmentId_semesterId: {
            studentId: enrollment.studentId,
            enrollmentId: enrollment.id,
            semesterId,
          },
        },
        create: {
          studentId: enrollment.studentId,
          enrollmentId: enrollment.id,
          semesterId,
          rawPercentage: result.rawPercentage,
          effectivePercentage: result.effectivePercentage,
          status: result.status,
          computedAt: now,
        },
        update: {
          rawPercentage: result.rawPercentage,
          effectivePercentage: result.effectivePercentage,
          status: result.status,
          computedAt: now,
        },
      });

      // Fire-and-forget webhook dispatch for terminal eligibility statuses
      if (result.status === EligibilityStatus.BARRED) {
        void dispatchWebhookEvent('student.eligibility.barred', {
          studentId: enrollment.studentId,
          enrollmentId: enrollment.id,
          semesterId,
          effectivePercentage: result.effectivePercentage,
        });
      } else if (result.status === EligibilityStatus.ELIGIBLE) {
        void dispatchWebhookEvent('student.eligibility.confirmed', {
          studentId: enrollment.studentId,
          enrollmentId: enrollment.id,
          semesterId,
          effectivePercentage: result.effectivePercentage,
        });
      }

      computed++;
    } catch {
      errors++;
    }
  }

  return { computed, errors };
}

// =============================================================================
// triggerEligibilityComputation
// =============================================================================

/**
 * Enqueues an `eligibility-computation` BullMQ job for the given semester.
 *
 * Called by `POST /eligibility/compute`. The actual computation runs
 * asynchronously in the worker. Returns the BullMQ job ID immediately.
 *
 * @param semesterId - UUID of the `Semester` to compute eligibility for.
 * @param actorId    - UUID of the user triggering the computation (for audit trail).
 * @returns An object containing the BullMQ `jobId` string.
 */
export async function triggerEligibilityComputation(
  semesterId: string,
  actorId: string,
): Promise<{ jobId: string }> {
  const job = await eligibilityComputationQueue.add('compute', { semesterId });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'ELIGIBILITY_COMPUTED', 'Semester', semesterId, {
    jobId: job.id,
  });

  return { jobId: job.id ?? 'unknown' };
}

// =============================================================================
// getEligibilityForStudent
// =============================================================================

/**
 * Returns all eligibility records for a student, optionally filtered by semester.
 *
 * @param studentId - UUID of the `Student` record.
 * @param query     - Validated query params from {@link GetStudentEligibilityQuerySchema}.
 * @returns Array of {@link IExamEligibility} records with course details.
 * @throws {AppError} `NOT_FOUND` (404) — student does not exist.
 */
export async function getEligibilityForStudent(
  studentId: string,
  query: GetStudentEligibilityQuery,
): Promise<IExamEligibility[]> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true },
  });
  if (!student) throw new AppError('NOT_FOUND', 'Student not found.', 404);

  const where: Prisma.ExamEligibilityWhereInput = { studentId };
  if (query.semesterId !== undefined) where.semesterId = query.semesterId;

  const records = await prisma.examEligibility.findMany({
    where,
    include: {
      enrollment: {
        include: {
          courseSection: { include: { course: { select: { code: true, title: true } } } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return records as unknown as IExamEligibility[];
}

// =============================================================================
// getEligibilityForCourse
// =============================================================================

/**
 * Returns a paginated, scope-aware list of eligibility records for a course section.
 *
 * @param courseSectionId - UUID of the `CourseSection`.
 * @param query           - Validated query params from {@link GetCourseEligibilityQuerySchema}.
 * @param actorRole       - Role of the requesting user (for scope enforcement).
 * @param actorScopeId    - Department UUID for HOD scope, or `null`.
 * @returns Paginated list of {@link IExamEligibility} records.
 */
export async function getEligibilityForCourse(
  courseSectionId: string,
  query: GetCourseEligibilityQuery,
  actorRole: Role,
  actorScopeId: string | null,
): Promise<PaginatedResponse<IExamEligibility>> {
  const { page, pageSize, semesterId } = query;
  const skip = (page - 1) * pageSize;

  const where: Prisma.ExamEligibilityWhereInput = {
    enrollment: { courseSectionId },
  };

  if (semesterId !== undefined) where.semesterId = semesterId;

  // HOD scope: only their department's courses
  if (actorRole === Role.HOD && actorScopeId !== null) {
    where.enrollment = {
      courseSectionId,
      courseSection: { course: { departmentId: actorScopeId } },
    };
  }

  const [records, total] = await Promise.all([
    prisma.examEligibility.findMany({
      where,
      skip,
      take: pageSize,
      include: {
        student: { include: { user: { select: { fullName: true } } } },
        enrollment: {
          include: { courseSection: { include: { course: { select: { code: true } } } } },
        },
      },
      orderBy: { student: { matricNumber: 'asc' } },
    }),
    prisma.examEligibility.count({ where }),
  ]);

  return {
    data: records as unknown as IExamEligibility[],
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

// =============================================================================
// freezeEligibility
// =============================================================================

/**
 * Freezes eligibility for a semester by setting `semester.isFrozen = true`.
 *
 * Once frozen, status changes require `DEAN` or `SUPER_ADMIN` approval.
 * Writes an audit log entry.
 *
 * @param semesterId - UUID of the `Semester` to freeze.
 * @param actorId    - UUID of the `SUPER_ADMIN` performing the freeze.
 * @returns A promise that resolves once the semester is frozen.
 * @throws {AppError} `NOT_FOUND` (404) — semester does not exist.
 */
export async function freezeEligibility(semesterId: string, actorId: string): Promise<void> {
  const semester = await prisma.semester.findUnique({
    where: { id: semesterId },
    select: { id: true },
  });
  if (!semester) throw new AppError('NOT_FOUND', 'Semester not found.', 404);

  await prisma.semester.update({
    where: { id: semesterId },
    data: { isFrozen: true },
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SYSTEM_SETTING_CHANGED', 'Semester', semesterId, {
    action: 'ELIGIBILITY_FROZEN',
  });
}

// =============================================================================
// overrideEligibilityStatus
// =============================================================================

/**
 * Overrides the eligibility status for a student × course record.
 *
 * If the semester is frozen, only `DEAN` and `SUPER_ADMIN` may override.
 * Writes an audit log entry with before/after snapshots.
 *
 * @param eligibilityId - UUID of the `ExamEligibility` record to override.
 * @param data          - Validated override payload from {@link OverrideEligibilitySchema}.
 * @param actorId       - UUID of the actor performing the override.
 * @param actorRole     - Role of the actor (for freeze check).
 * @returns The updated {@link IExamEligibility} record.
 * @throws {AppError} `NOT_FOUND` (404)          — eligibility record does not exist.
 * @throws {AppError} `ELIGIBILITY_FROZEN` (403) — semester is frozen and actor lacks DEAN/SUPER_ADMIN role.
 */
export async function overrideEligibilityStatus(
  eligibilityId: string,
  data: OverrideEligibilityInput,
  actorId: string,
  actorRole: Role,
): Promise<IExamEligibility> {
  const eligibility = await prisma.examEligibility.findUnique({
    where: { id: eligibilityId },
    include: { semester: { select: { id: true, isFrozen: true } } },
  });
  if (!eligibility) throw new AppError('NOT_FOUND', 'Eligibility record not found.', 404);

  // Freeze check
  if (eligibility.semester.isFrozen) {
    if (actorRole !== Role.DEAN && actorRole !== Role.SUPER_ADMIN) {
      throw new AppError(
        'ELIGIBILITY_FROZEN',
        'Eligibility is frozen. Changes require DEAN approval.',
        403,
      );
    }
  }

  const beforeStatus = eligibility.status;
  const now = new Date();

  const updated = await prisma.examEligibility.update({
    where: { id: eligibilityId },
    data: {
      status: data.status,
      ...(eligibility.semester.isFrozen ? { frozenAt: now } : {}),
    },
  });

  void writeAuditLog(
    actorId,
    actorRole,
    'ELIGIBILITY_OVERRIDDEN',
    'ExamEligibility',
    eligibilityId,
    {
      beforeStatus,
      afterStatus: data.status,
      reason: data.reason,
      frozen: eligibility.semester.isFrozen,
    },
  );

  return updated as unknown as IExamEligibility;
}
