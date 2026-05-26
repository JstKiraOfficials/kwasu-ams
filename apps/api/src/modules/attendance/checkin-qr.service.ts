/**
 * @file checkin-qr.service.ts
 * @module modules/attendance
 *
 * Business logic for the QR code check-in method.
 *
 * Two responsibilities:
 * 1. **Token generation** (`generateQrToken`) — called by the lecturer to produce
 *    a signed JWT displayed as a QR code. Invalidates the previous token in Redis
 *    on every call so stale QRs are immediately rejected.
 * 2. **Check-in** (`checkInQr`) — called by the student after scanning. Validates
 *    the JWT signature, checks Redis for token freshness, then runs the same
 *    geofence + spoofing pipeline as the GPS direct method.
 *
 * Security invariants:
 * - GPS coordinates are **never stored** — only the boolean geofence result is
 *   implicit in the `AttendanceRecord` being written.
 * - Both the QR token AND the geofence must pass independently.
 * - Token validation runs first; geofence is only queried for valid tokens.
 * - Redis is the source of truth for token freshness — a valid JWT that is no
 *   longer in Redis (regenerated) is rejected with `QR_TOKEN_INVALID`.
 */

import {
  AnomalyType,
  AttendanceStatus,
  CheckInMethod,
  type IAttendanceRecord,
} from '@kwasu-ams/types';
import {
  generateQrToken as utilsGenerateQrToken,
  verifyQrToken as utilsVerifyQrToken,
  isErr,
  addMinutes,
} from '@kwasu-ams/utils';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { env } from '../../config/env.js';
import { AppError } from '../../middleware/error-handler.js';
import { createAnomalyFlag } from '../anomalies/anomalies.service.js';
import { type QrCheckinInput } from './attendance.schema.js';
import {
  validateStudentGeofence,
  detectSpoofing,
  spoofingFlagToAnomalyType,
} from './checkin-helpers.js';
import { dispatchWebhookEvent } from '../webhooks/webhook-dispatcher.service.js';

// =============================================================================
// Redis key helpers
// =============================================================================

/**
 * Returns the Redis key used to store the active QR token for a session.
 *
 * @param sessionId - UUID of the `CourseSession`.
 * @returns Redis key string.
 */
function qrRedisKey(sessionId: string): string {
  return `qr:session:${sessionId}`;
}

// =============================================================================
// generateQrToken
// =============================================================================

/**
 * Generates a new signed QR token for the given session.
 *
 * The token is a HS256 JWT containing `{ sessionId, venueId, issuedAt }` with
 * a 10-minute expiry. The previous token is deleted from Redis before the new
 * one is stored, ensuring any student who scanned the old QR is rejected.
 *
 * @param sessionId - UUID of the `CourseSession` to generate a token for.
 * @param actorId   - UUID of the authenticated user (lecturer/admin) for audit trail.
 * @returns An object containing the signed `token` string and its `expiresAt` timestamp.
 * @throws {AppError} `NOT_FOUND` (404)         — session does not exist.
 * @throws {AppError} `SESSION_NOT_ACTIVE` (400) — session is not in `ACTIVE` state.
 * @throws {AppError} `INTERNAL_ERROR` (500)     — JWT signing failed unexpectedly.
 */
export async function generateQrToken(
  sessionId: string,
  actorId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const session = await prisma.courseSession.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true, venueId: true },
  });
  if (!session) {
    throw new AppError('NOT_FOUND', 'Session not found.', 404);
  }
  if (session.status !== 'ACTIVE') {
    throw new AppError('SESSION_NOT_ACTIVE', 'Session is not accepting check-ins.', 400);
  }

  const now = new Date();
  const expiresAt = addMinutes(now, 10);

  const result = utilsGenerateQrToken(
    {
      sessionId,
      venueId: session.venueId,
      issuedAt: Math.floor(now.getTime() / 1000),
      expiresAt: Math.floor(expiresAt.getTime() / 1000),
    },
    env.JWT_ACCESS_SECRET,
  );

  if (isErr(result)) {
    throw new AppError('INTERNAL_ERROR', 'Failed to generate QR token.', 500);
  }

  const token = result.value;

  // Invalidate old token, store new one (600s = 10 minutes)
  await redis.del(qrRedisKey(sessionId));
  await redis.set(qrRedisKey(sessionId), token, 'EX', 600);

  // Persist token and expiry on the session record
  await prisma.courseSession.update({
    where: { id: sessionId },
    data: { qrToken: token, qrTokenExpiresAt: expiresAt },
  });

  void prisma.auditLog.create({
    data: {
      actorId,
      actorRole: 'LECTURER',
      action: 'SESSION_OPENED',
      entityType: 'CourseSession',
      entityId: sessionId,
      afterJson: { event: 'QR_GENERATED', expiresAt: expiresAt.toISOString() },
    },
  });

  return { token, expiresAt };
}

// =============================================================================
// checkInQr
// =============================================================================

/**
 * Processes a QR code check-in for a student.
 *
 * Full algorithm:
 * 1. Resolves the `Student` record from the authenticated user's ID.
 * 2. Verifies the QR token JWT (signature + expiry).
 * 3. Checks Redis to confirm the token is still the active one (not regenerated).
 * 4. Fetches and validates the `CourseSession` (must be `ACTIVE`).
 * 5. Verifies the student is enrolled in the session's course section.
 * 6. Checks for a duplicate check-in on the same session.
 * 7. Checks for a concurrent session conflict.
 * 8. Validates the student's GPS coordinates against the venue geofence.
 * 9. Runs spoofing detection on the submitted coordinates.
 * 10. Determines `AttendanceStatus`: `PRESENT` or `PENDING_REVIEW`.
 * 11. Creates `AnomalyFlag` records for each detected spoofing signal.
 * 12. Upserts the `AttendanceRecord` (GPS coordinates are never written).
 * 13. Publishes a Redis pub/sub event to `session:{sessionId}:checkins`.
 * 14. Writes an `ATTENDANCE_RECORDED` audit log entry (fire-and-forget).
 *
 * @param studentUserId - UUID of the authenticated `User` (not the `Student` record).
 * @param data          - Validated QR check-in payload from {@link QrCheckinSchema}.
 * @returns The created or updated {@link IAttendanceRecord}.
 * @throws {AppError} `NOT_FOUND` (404)          — student or session does not exist.
 * @throws {AppError} `QR_TOKEN_EXPIRED` (400)   — JWT has expired.
 * @throws {AppError} `QR_TOKEN_INVALID` (400)   — JWT is invalid or has been regenerated.
 * @throws {AppError} `SESSION_CLOSED` (400)     — session is not in `ACTIVE` state.
 * @throws {AppError} `FORBIDDEN` (403)          — student is not enrolled in this course.
 * @throws {AppError} `CONFLICT` (409)           — student already has `PRESENT` status.
 * @throws {AppError} `CONCURRENT_SESSION` (400) — student already `PRESENT` elsewhere.
 * @throws {AppError} `OUTSIDE_GEOFENCE` (400)   — student is outside the venue geofence.
 */
export async function checkInQr(
  studentUserId: string,
  data: QrCheckinInput,
): Promise<IAttendanceRecord> {
  // ── Step 1: Resolve student ──────────────────────────────────────────────
  const student = await prisma.student.findUnique({
    where: { userId: studentUserId },
    include: { user: { select: { fullName: true } } },
  });
  if (!student) {
    throw new AppError('NOT_FOUND', 'Student not found.', 404);
  }

  // ── Step 2: Verify QR token JWT ──────────────────────────────────────────
  const tokenResult = utilsVerifyQrToken(data.qrToken, env.JWT_ACCESS_SECRET);
  if (isErr(tokenResult)) {
    if (tokenResult.error === 'TOKEN_EXPIRED') {
      throw new AppError('QR_TOKEN_EXPIRED', 'QR code has expired.', 400);
    }
    throw new AppError('QR_TOKEN_INVALID', 'Invalid QR code.', 400);
  }
  const payload = tokenResult.value;

  // ── Step 3: Check Redis freshness ────────────────────────────────────────
  const storedToken = await redis.get(qrRedisKey(payload.sessionId));
  if (storedToken !== data.qrToken) {
    throw new AppError('QR_TOKEN_INVALID', 'QR code has been regenerated.', 400);
  }

  // ── Step 4: Fetch and validate session ───────────────────────────────────
  const session = await prisma.courseSession.findUnique({
    where: { id: payload.sessionId },
  });
  if (!session) {
    throw new AppError('NOT_FOUND', 'Session not found.', 404);
  }
  if (session.status !== 'ACTIVE') {
    throw new AppError('SESSION_CLOSED', 'This session is not accepting check-ins.', 400);
  }

  // ── Step 5: Verify enrollment ────────────────────────────────────────────
  const enrollment = await prisma.courseEnrollment.findFirst({
    where: { studentId: student.id, courseSectionId: session.courseSectionId },
  });
  if (!enrollment) {
    throw new AppError('FORBIDDEN', 'You are not enrolled in this course.', 403);
  }

  // ── Step 6: Check for duplicate check-in ────────────────────────────────
  const existing = await prisma.attendanceRecord.findUnique({
    where: { studentId_sessionId: { studentId: student.id, sessionId: payload.sessionId } },
  });
  if (existing?.status === AttendanceStatus.PRESENT) {
    throw new AppError('CONFLICT', 'Already checked in to this session.', 409);
  }

  // ── Step 7: Concurrent session conflict check ────────────────────────────
  const concurrentRecord = await prisma.attendanceRecord.findFirst({
    where: {
      studentId: student.id,
      status: AttendanceStatus.PRESENT,
      session: { status: 'ACTIVE', id: { not: payload.sessionId } },
    },
  });
  if (concurrentRecord) {
    void createAnomalyFlag(
      {
        studentId: student.id,
        sessionId: payload.sessionId,
        flagType: AnomalyType.CONCURRENT_SESSION_CONFLICT,
        description: `Student attempted QR check-in to session ${payload.sessionId} while already PRESENT in session ${concurrentRecord.sessionId}.`,
      },
      studentUserId,
    );
    throw new AppError(
      'CONCURRENT_SESSION',
      'You are already checked in to another active session.',
      400,
    );
  }

  // ── Step 8: Geofence validation ──────────────────────────────────────────
  const geofenceResult = await validateStudentGeofence(
    data.latitude,
    data.longitude,
    payload.sessionId,
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

  // ── Step 9: Spoofing detection ───────────────────────────────────────────
  const spoofingResult = await detectSpoofing({
    studentId: student.id,
    latitude: data.latitude,
    longitude: data.longitude,
    mockLocationEnabled: data.mockLocationEnabled,
    deviceRooted: data.deviceRooted,
    currentTimestamp: new Date(),
  });

  // ── Step 10 & 11: Determine status and create anomaly flags ──────────────
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
            sessionId: payload.sessionId,
            flagType: anomalyType,
            description: `Spoofing signal detected during QR check-in: ${flag}.`,
          },
          studentUserId,
        );
      }
    }
  }

  // ── Step 12: Upsert AttendanceRecord (no GPS coordinates stored) ─────────
  const now = new Date();
  const record = await prisma.attendanceRecord.upsert({
    where: { studentId_sessionId: { studentId: student.id, sessionId: payload.sessionId } },
    create: {
      studentId: student.id,
      sessionId: payload.sessionId,
      enrollmentId: enrollment.id,
      status,
      checkInMethod: CheckInMethod.QR_CODE,
      checkedInAt: now,
      deviceRooted: data.deviceRooted,
      spoofingFlagged: spoofingResult.isSuspicious,
    },
    update: {
      status,
      checkInMethod: CheckInMethod.QR_CODE,
      checkedInAt: now,
      deviceRooted: data.deviceRooted,
      spoofingFlagged: spoofingResult.isSuspicious,
    },
  });

  // ── Step 13: Publish Redis pub/sub event ─────────────────────────────────
  void redis.publish(
    `session:${payload.sessionId}:checkins`,
    JSON.stringify({
      event: 'CHECKIN',
      studentId: student.id,
      studentName: student.user.fullName,
      checkedInAt: now.toISOString(),
      checkInMethod: CheckInMethod.QR_CODE,
      status,
    }),
  );

  // ── Step 14: Write audit log (fire-and-forget) ───────────────────────────
  void prisma.auditLog.create({
    data: {
      actorId: studentUserId,
      actorRole: 'STUDENT',
      action: 'ATTENDANCE_RECORDED',
      entityType: 'AttendanceRecord',
      entityId: record.id,
      afterJson: {
        sessionId: payload.sessionId,
        status,
        checkInMethod: CheckInMethod.QR_CODE,
        spoofingFlagged: spoofingResult.isSuspicious,
      },
    },
  });

  // Fire-and-forget webhook dispatch
  void dispatchWebhookEvent('attendance.checkin.recorded', {
    recordId: record.id,
    sessionId: payload.sessionId,
    studentId: student.id,
    checkInMethod: CheckInMethod.QR_CODE,
    status,
  });

  return record as unknown as IAttendanceRecord;
}
