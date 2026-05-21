/**
 * @file checkin-code.service.ts
 * @module modules/attendance
 *
 * Business logic for the alphanumeric code check-in method.
 *
 * Two responsibilities:
 * 1. **Code generation** (`generateSessionCode`) — called by the lecturer to
 *    produce a 6-character code from the unambiguous charset. Stored in Redis
 *    with a 15-minute TTL and persisted on the `CourseSession` record.
 * 2. **Check-in** (`checkInCode`) — called by the student after typing the code.
 *    Validates the code against Redis, then runs the same geofence + spoofing
 *    pipeline as the GPS direct method.
 *
 * Security invariants:
 * - GPS coordinates are **never stored** — only the boolean geofence result is
 *   implicit in the `AttendanceRecord` being written.
 * - Both the code AND the geofence must pass independently.
 * - Code validation runs first; geofence is only queried for valid codes.
 * - Submitted codes are normalised to uppercase before comparison.
 * - The alphanumeric charset (`ABCDEFGHJKLMNPQRTUVWXYZ23456789`) is imported
 *   from `@kwasu-ams/utils` — never hardcoded inline.
 */

import {
  AnomalyType,
  AttendanceStatus,
  CheckInMethod,
  type IAttendanceRecord,
} from '@kwasu-ams/types';
import {
  generateAlphanumericCode as utilsGenerateCode,
  validateAlphanumericCode,
  isOk,
  isErr,
  addMinutes,
} from '@kwasu-ams/utils';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { AppError } from '../../middleware/error-handler.js';
import { createAnomalyFlag } from '../anomalies/anomalies.service.js';
import { type CodeCheckinInput } from './attendance.schema.js';
import {
  validateStudentGeofence,
  detectSpoofing,
  spoofingFlagToAnomalyType,
} from './checkin-helpers.js';

// =============================================================================
// Redis key helpers
// =============================================================================

/**
 * Returns the Redis key used to store the active alphanumeric code for a session.
 *
 * @param sessionId - UUID of the `CourseSession`.
 * @returns Redis key string.
 */
function codeRedisKey(sessionId: string): string {
  return `code:session:${sessionId}`;
}

// =============================================================================
// generateSessionCode
// =============================================================================

/**
 * Generates a new 6-character alphanumeric code for the given session.
 *
 * The code is drawn from the unambiguous charset (`ABCDEFGHJKLMNPQRTUVWXYZ23456789`)
 * using `generateAlphanumericCode()` from `@kwasu-ams/utils`. It is stored in
 * Redis with a 15-minute TTL and persisted on the `CourseSession` record.
 *
 * @param sessionId - UUID of the `CourseSession` to generate a code for.
 * @param actorId   - UUID of the authenticated user (lecturer/admin) for audit trail.
 * @returns An object containing the `code` string and its `expiresAt` timestamp.
 * @throws {AppError} `NOT_FOUND` (404)         — session does not exist.
 * @throws {AppError} `SESSION_NOT_ACTIVE` (400) — session is not in `ACTIVE` state.
 * @throws {AppError} `INTERNAL_ERROR` (500)     — code generation failed unexpectedly.
 */
export async function generateSessionCode(
  sessionId: string,
  actorId: string,
): Promise<{ code: string; expiresAt: Date }> {
  const session = await prisma.courseSession.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true },
  });
  if (!session) {
    throw new AppError('NOT_FOUND', 'Session not found.', 404);
  }
  if (session.status !== 'ACTIVE') {
    throw new AppError('SESSION_NOT_ACTIVE', 'Session is not accepting check-ins.', 400);
  }

  const codeResult = utilsGenerateCode(6);
  if (isErr(codeResult)) {
    throw new AppError('INTERNAL_ERROR', 'Failed to generate alphanumeric code.', 500);
  }
  const code = codeResult.value;

  const expiresAt = addMinutes(new Date(), 15);

  // Store in Redis with 900-second TTL (15 minutes)
  await redis.set(codeRedisKey(sessionId), code, 'EX', 900);

  // Persist code and expiry on the session record
  await prisma.courseSession.update({
    where: { id: sessionId },
    data: { alphanumericCode: code, codeExpiresAt: expiresAt },
  });

  void prisma.auditLog.create({
    data: {
      actorId,
      actorRole: 'LECTURER',
      action: 'SESSION_OPENED',
      entityType: 'CourseSession',
      entityId: sessionId,
      afterJson: { event: 'CODE_GENERATED', expiresAt: expiresAt.toISOString() },
    },
  });

  return { code, expiresAt };
}

// =============================================================================
// checkInCode
// =============================================================================

/**
 * Processes an alphanumeric code check-in for a student.
 *
 * Full algorithm:
 * 1. Resolves the `Student` record from the authenticated user's ID.
 * 2. Fetches and validates the `CourseSession` (must be `ACTIVE`).
 * 3. Validates the submitted code against Redis (case-insensitive, normalised to uppercase).
 * 4. Verifies the student is enrolled in the session's course section.
 * 5. Checks for a duplicate check-in on the same session.
 * 6. Checks for a concurrent session conflict.
 * 7. Validates the student's GPS coordinates against the venue geofence.
 * 8. Runs spoofing detection on the submitted coordinates.
 * 9. Determines `AttendanceStatus`: `PRESENT` or `PENDING_REVIEW`.
 * 10. Creates `AnomalyFlag` records for each detected spoofing signal.
 * 11. Upserts the `AttendanceRecord` (GPS coordinates are never written).
 * 12. Publishes a Redis pub/sub event to `session:{sessionId}:checkins`.
 * 13. Writes an `ATTENDANCE_RECORDED` audit log entry (fire-and-forget).
 *
 * @param studentUserId - UUID of the authenticated `User` (not the `Student` record).
 * @param data          - Validated code check-in payload from {@link CodeCheckinSchema}.
 * @returns The created or updated {@link IAttendanceRecord}.
 * @throws {AppError} `NOT_FOUND` (404)          — student or session does not exist.
 * @throws {AppError} `SESSION_CLOSED` (400)     — session is not in `ACTIVE` state.
 * @throws {AppError} `CODE_INVALID` (400)       — code is wrong, expired, or no active code exists.
 * @throws {AppError} `FORBIDDEN` (403)          — student is not enrolled in this course.
 * @throws {AppError} `CONFLICT` (409)           — student already has `PRESENT` status.
 * @throws {AppError} `CONCURRENT_SESSION` (400) — student already `PRESENT` elsewhere.
 * @throws {AppError} `OUTSIDE_GEOFENCE` (400)   — student is outside the venue geofence.
 */
export async function checkInCode(
  studentUserId: string,
  data: CodeCheckinInput,
): Promise<IAttendanceRecord> {
  // ── Step 1: Resolve student ──────────────────────────────────────────────
  const student = await prisma.student.findUnique({
    where: { userId: studentUserId },
    include: { user: { select: { fullName: true } } },
  });
  if (!student) {
    throw new AppError('NOT_FOUND', 'Student not found.', 404);
  }

  // ── Step 2: Fetch and validate session ───────────────────────────────────
  const session = await prisma.courseSession.findUnique({
    where: { id: data.sessionId },
  });
  if (!session) {
    throw new AppError('NOT_FOUND', 'Session not found.', 404);
  }
  if (session.status !== 'ACTIVE') {
    throw new AppError('SESSION_CLOSED', 'This session is not accepting check-ins.', 400);
  }

  // ── Step 3: Validate code against Redis ──────────────────────────────────
  const storedCode = await redis.get(codeRedisKey(data.sessionId));
  if (storedCode === null) {
    throw new AppError('CODE_INVALID', 'Code has expired or session has no active code.', 400);
  }
  const submittedCode = data.code.toUpperCase();
  if (storedCode !== submittedCode) {
    throw new AppError('CODE_INVALID', 'Invalid code.', 400);
  }
  // Validate charset and length (defence-in-depth — Redis value is already valid)
  if (!validateAlphanumericCode(submittedCode)) {
    throw new AppError('CODE_INVALID', 'Invalid code format.', 400);
  }

  // ── Step 4: Verify enrollment ────────────────────────────────────────────
  const enrollment = await prisma.courseEnrollment.findFirst({
    where: { studentId: student.id, courseSectionId: session.courseSectionId },
  });
  if (!enrollment) {
    throw new AppError('FORBIDDEN', 'You are not enrolled in this course.', 403);
  }

  // ── Step 5: Check for duplicate check-in ────────────────────────────────
  const existing = await prisma.attendanceRecord.findUnique({
    where: { studentId_sessionId: { studentId: student.id, sessionId: data.sessionId } },
  });
  if (existing?.status === AttendanceStatus.PRESENT) {
    throw new AppError('CONFLICT', 'Already checked in to this session.', 409);
  }

  // ── Step 6: Concurrent session conflict check ────────────────────────────
  const concurrentRecord = await prisma.attendanceRecord.findFirst({
    where: {
      studentId: student.id,
      status: AttendanceStatus.PRESENT,
      session: { status: 'ACTIVE', id: { not: data.sessionId } },
    },
  });
  if (concurrentRecord) {
    void createAnomalyFlag(
      {
        studentId: student.id,
        sessionId: data.sessionId,
        flagType: AnomalyType.CONCURRENT_SESSION_CONFLICT,
        description: `Student attempted code check-in to session ${data.sessionId} while already PRESENT in session ${concurrentRecord.sessionId}.`,
      },
      studentUserId,
    );
    throw new AppError(
      'CONCURRENT_SESSION',
      'You are already checked in to another active session.',
      400,
    );
  }

  // ── Step 7: Geofence validation ──────────────────────────────────────────
  const geofenceResult = await validateStudentGeofence(
    data.latitude,
    data.longitude,
    data.sessionId,
  );
  if (!geofenceResult.inside) {
    const hint =
      geofenceResult.distanceMetres <= 200
        ? `You are ${geofenceResult.distanceMetres}m from the venue.`
        : undefined;
    throw new AppError(
      'OUTSIDE_GEOFENCE',
      'You must be physically inside the lecture venue to mark attendance.',
      400,
      undefined,
      { distanceMetres: geofenceResult.distanceMetres, hint },
    );
  }

  // ── Step 8: Spoofing detection ───────────────────────────────────────────
  const spoofingResult = await detectSpoofing({
    studentId: student.id,
    latitude: data.latitude,
    longitude: data.longitude,
    mockLocationEnabled: data.mockLocationEnabled,
    deviceRooted: data.deviceRooted,
    currentTimestamp: new Date(),
  });

  // ── Step 9 & 10: Determine status and create anomaly flags ───────────────
  const status: AttendanceStatus = spoofingResult.isSuspicious
    ? AttendanceStatus.PENDING_REVIEW
    : AttendanceStatus.PRESENT;

  if (spoofingResult.isSuspicious) {
    for (const flag of spoofingResult.flags) {
      const anomalyType = spoofingFlagToAnomalyType(flag);
      if (anomalyType !== undefined) {
        void createAnomalyFlag(
          {
            studentId: student.id,
            sessionId: data.sessionId,
            flagType: anomalyType,
            description: `Spoofing signal detected during code check-in: ${flag}.`,
          },
          studentUserId,
        );
      }
    }
  }

  // ── Step 11: Upsert AttendanceRecord (no GPS coordinates stored) ─────────
  const now = new Date();
  const record = await prisma.attendanceRecord.upsert({
    where: { studentId_sessionId: { studentId: student.id, sessionId: data.sessionId } },
    create: {
      studentId: student.id,
      sessionId: data.sessionId,
      enrollmentId: enrollment.id,
      status,
      checkInMethod: CheckInMethod.ALPHANUMERIC_CODE,
      checkedInAt: now,
      deviceRooted: data.deviceRooted,
      spoofingFlagged: spoofingResult.isSuspicious,
    },
    update: {
      status,
      checkInMethod: CheckInMethod.ALPHANUMERIC_CODE,
      checkedInAt: now,
      deviceRooted: data.deviceRooted,
      spoofingFlagged: spoofingResult.isSuspicious,
    },
  });

  // ── Step 12: Publish Redis pub/sub event ─────────────────────────────────
  void redis.publish(
    `session:${data.sessionId}:checkins`,
    JSON.stringify({
      event: 'CHECKIN',
      studentId: student.id,
      studentName: student.user.fullName,
      checkedInAt: now.toISOString(),
      checkInMethod: CheckInMethod.ALPHANUMERIC_CODE,
      status,
    }),
  );

  // ── Step 13: Write audit log (fire-and-forget) ───────────────────────────
  void prisma.auditLog.create({
    data: {
      actorId: studentUserId,
      actorRole: 'STUDENT',
      action: 'ATTENDANCE_RECORDED',
      entityType: 'AttendanceRecord',
      entityId: record.id,
      afterJson: {
        sessionId: data.sessionId,
        status,
        checkInMethod: CheckInMethod.ALPHANUMERIC_CODE,
        spoofingFlagged: spoofingResult.isSuspicious,
      },
    },
  });

  return record as unknown as IAttendanceRecord;
}
