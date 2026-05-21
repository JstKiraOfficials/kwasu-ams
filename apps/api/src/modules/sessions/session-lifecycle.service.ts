/**
 * @file session-lifecycle.service.ts
 * @module modules/sessions
 *
 * Session lifecycle state machine for KWASU AMS.
 *
 * Valid transitions:
 *   SCHEDULED → ACTIVE  (openSession)
 *   ACTIVE    → CLOSED  (closeSession)
 *   CLOSED    → LOCKED  (lockSession)
 *
 * On close: all enrolled students without an existing AttendanceRecord are
 * marked ABSENT in a single Prisma transaction. The 48-hour override window
 * is set from `actualEnd`. Redis QR/code keys are deleted immediately.
 *
 * Redis pub/sub events are published on every lifecycle transition so that
 * WebSocket clients and the mobile app receive real-time updates.
 *
 * Phase 27 note: Replace direct `prisma.auditLog.create` calls with
 * `auditLogQueue.add()` once BullMQ is wired up.
 */

import { type AuditAction, Prisma } from '@prisma/client';
import { type ICourseSessionPublic } from '@kwasu-ams/types';
import { addHours } from '@kwasu-ams/utils';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { AppError } from '../../middleware/error-handler.js';
import { anomalyDetectionQueue } from '../../jobs/queue.js';

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Writes an immutable audit log entry via a direct Prisma call.
 * Errors are swallowed — audit failures must never surface to the caller.
 *
 * @param actorId    - UUID of the user performing the action.
 * @param actorRole  - Role string of the actor.
 * @param action     - The {@link AuditAction} enum value.
 * @param entityType - Human-readable entity name, e.g. `"CourseSession"`.
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
// Prisma select — ICourseSessionPublic fields (tokens omitted)
// =============================================================================

/**
 * Prisma `select` that returns all `ICourseSessionPublic` fields.
 * `qrToken` and `alphanumericCode` are intentionally excluded from API responses.
 */
const SESSION_PUBLIC_SELECT = {
  id: true,
  courseSectionId: true,
  venueId: true,
  lecturerId: true,
  scheduledStart: true,
  scheduledEnd: true,
  actualStart: true,
  actualEnd: true,
  status: true,
  qrTokenExpiresAt: true,
  codeExpiresAt: true,
  isMakeUp: true,
  overrideWindowEnd: true,
  createdAt: true,
  updatedAt: true,
} as const;

// =============================================================================
// openSession
// =============================================================================

/**
 * Transitions a session from `SCHEDULED` to `ACTIVE`.
 *
 * Sets `actualStart = now()` and publishes a `SESSION_OPENED` Redis event.
 * Writes a `SESSION_OPENED` AuditLog entry.
 *
 * @param sessionId - UUID of the session to open.
 * @param actorId   - UUID of the lecturer/admin opening the session (for audit trail).
 * @returns The updated session as {@link ICourseSessionPublic}.
 * @throws {AppError} `NOT_FOUND` (404) — session does not exist.
 * @throws {AppError} `SESSION_NOT_ACTIVE` (400) — session is not in `SCHEDULED` state.
 */
export async function openSession(
  sessionId: string,
  actorId: string,
): Promise<ICourseSessionPublic> {
  const session = await prisma.courseSession.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true },
  });
  if (!session) {
    throw new AppError('NOT_FOUND', 'Session not found.', 404);
  }
  if (session.status !== 'SCHEDULED') {
    throw new AppError(
      'SESSION_NOT_ACTIVE',
      'Session cannot be opened from its current state.',
      400,
    );
  }

  const updated = await prisma.courseSession.update({
    where: { id: sessionId },
    data: { status: 'ACTIVE', actualStart: new Date() },
    select: SESSION_PUBLIC_SELECT,
  });

  // Publish lifecycle event for WebSocket clients
  void redis.publish(
    `session:${sessionId}:lifecycle`,
    JSON.stringify({ event: 'SESSION_OPENED', sessionId }),
  );

  void writeAuditLog(actorId, 'LECTURER', 'SESSION_OPENED', 'CourseSession', sessionId);

  return updated as ICourseSessionPublic;
}

// =============================================================================
// closeSession
// =============================================================================

/**
 * Transitions a session from `ACTIVE` to `CLOSED`.
 *
 * In a single Prisma transaction:
 * - Creates `ABSENT` AttendanceRecords for all enrolled students who have no
 *   existing record for this session (does NOT overwrite PENDING_REVIEW records).
 * - Updates session: `status = 'CLOSED'`, `actualEnd = now()`,
 *   `overrideWindowEnd = actualEnd + 48 hours`.
 *
 * After the transaction:
 * - Deletes Redis QR/code keys (safe no-op if Phase 20 hasn't run yet).
 * - Publishes `SESSION_CLOSED` Redis event.
 * - Writes `SESSION_CLOSED` AuditLog entry.
 *
 * @param sessionId - UUID of the session to close.
 * @param actorId   - UUID of the lecturer/admin closing the session (for audit trail).
 * @returns The updated session as {@link ICourseSessionPublic}.
 * @throws {AppError} `NOT_FOUND` (404) — session does not exist.
 * @throws {AppError} `SESSION_NOT_ACTIVE` (400) — session is not in `ACTIVE` state.
 */
export async function closeSession(
  sessionId: string,
  actorId: string,
): Promise<ICourseSessionPublic> {
  const session = await prisma.courseSession.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true, courseSectionId: true },
  });
  if (!session) {
    throw new AppError('NOT_FOUND', 'Session not found.', 404);
  }
  if (session.status !== 'ACTIVE') {
    throw new AppError(
      'SESSION_NOT_ACTIVE',
      'Session cannot be closed from its current state.',
      400,
    );
  }

  // Fetch all enrolled students for this course section
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { courseSectionId: session.courseSectionId, droppedAt: null },
    select: { studentId: true, id: true },
  });

  // Fetch existing attendance records for this session
  const existingRecords = await prisma.attendanceRecord.findMany({
    where: { sessionId },
    select: { studentId: true },
  });
  const studentsWithRecords = new Set(existingRecords.map((r) => r.studentId));

  // Students who need an ABSENT record
  const absentStudents = enrollments.filter((e) => !studentsWithRecords.has(e.studentId));
  const actualEnd = new Date();
  const overrideWindowEnd = addHours(actualEnd, 48);

  let updatedSession: ICourseSessionPublic;

  await prisma.$transaction(async (tx) => {
    // Create ABSENT records for students with no existing record
    if (absentStudents.length > 0) {
      await tx.attendanceRecord.createMany({
        data: absentStudents.map((e) => ({
          studentId: e.studentId,
          sessionId,
          enrollmentId: e.id,
          status: 'ABSENT' as const,
        })),
        skipDuplicates: true,
      });
    }

    // Update session status
    const result = await tx.courseSession.update({
      where: { id: sessionId },
      data: { status: 'CLOSED', actualEnd, overrideWindowEnd },
      select: SESSION_PUBLIC_SELECT,
    });
    updatedSession = result as ICourseSessionPublic;
  });

  // Phase 20 creates these keys; deleting here is safe even before Phase 20 runs
  await redis.del(`qr:session:${sessionId}`);
  await redis.del(`code:session:${sessionId}`);

  void redis.publish(
    `session:${sessionId}:lifecycle`,
    JSON.stringify({ event: 'SESSION_CLOSED', sessionId, absentCount: absentStudents.length }),
  );

  // Enqueue anomaly detection job with 5-second delay to ensure all
  // check-in records are committed before the worker reads them.
  void anomalyDetectionQueue.add('detect', { sessionId }, { delay: 5000 });

  void writeAuditLog(actorId, 'LECTURER', 'SESSION_CLOSED', 'CourseSession', sessionId, {
    absentCount: absentStudents.length,
  });

  return updatedSession!;
}

// =============================================================================
// lockSession
// =============================================================================

/**
 * Transitions a session from `CLOSED` to `LOCKED`.
 *
 * Once locked, attendance records are immutable without `SUPER_ADMIN` approval.
 * Writes a `SESSION_LOCKED` AuditLog entry.
 *
 * @param sessionId - UUID of the session to lock.
 * @param actorId   - UUID of the SUPER_ADMIN locking the session (for audit trail).
 * @returns The updated session as {@link ICourseSessionPublic}.
 * @throws {AppError} `NOT_FOUND` (404) — session does not exist.
 * @throws {AppError} `SESSION_NOT_ACTIVE` (400) — session is not in `CLOSED` state.
 */
export async function lockSession(
  sessionId: string,
  actorId: string,
): Promise<ICourseSessionPublic> {
  const session = await prisma.courseSession.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true },
  });
  if (!session) {
    throw new AppError('NOT_FOUND', 'Session not found.', 404);
  }
  if (session.status !== 'CLOSED') {
    throw new AppError(
      'SESSION_NOT_ACTIVE',
      'Session cannot be locked from its current state.',
      400,
    );
  }

  const updated = await prisma.courseSession.update({
    where: { id: sessionId },
    data: { status: 'LOCKED' },
    select: SESSION_PUBLIC_SELECT,
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SESSION_LOCKED', 'CourseSession', sessionId);

  return updated as ICourseSessionPublic;
}

// =============================================================================
// autoLockExpiredSessions
// =============================================================================

/**
 * Locks all `CLOSED` sessions whose `overrideWindowEnd` has passed.
 *
 * Called by the BullMQ scheduler in Phase 27. Safe to call multiple times
 * (idempotent — already-locked sessions are not affected).
 *
 * @returns The number of sessions that were locked.
 */
export async function autoLockExpiredSessions(): Promise<number> {
  const result = await prisma.courseSession.updateMany({
    where: {
      status: 'CLOSED',
      overrideWindowEnd: { lt: new Date() },
    },
    data: { status: 'LOCKED' },
  });
  return result.count;
}
