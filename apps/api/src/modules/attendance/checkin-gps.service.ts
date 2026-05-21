/**
 * @file checkin-gps.service.ts
 * @module modules/attendance
 *
 * Business logic for the GPS direct check-in method.
 *
 * This is the primary attendance capture mechanism. A student submits their
 * GPS coordinates; the server validates the geofence using the Haversine
 * formula, checks for GPS spoofing signals, verifies no concurrent session
 * conflict, and writes the `AttendanceRecord`.
 *
 * Security invariants enforced here:
 * - GPS coordinates are **never stored** — only the boolean geofence result
 *   is implicit in the `AttendanceRecord` being written.
 * - Geofence validation is mandatory server-side; the mobile GPS check is
 *   UX only and not the security control.
 * - Spoofing flags produce `PENDING_REVIEW` status, not auto-rejection.
 * - Concurrent session detection blocks check-in and raises an anomaly flag.
 *
 * Geofence validation, spoofing detection, and anomaly-type mapping are
 * delegated to `checkin-helpers.ts` so they can be shared with the QR and
 * alphanumeric code check-in services.
 */

import {
  AnomalyType,
  AttendanceStatus,
  CheckInMethod,
  type IAttendanceRecord,
} from '@kwasu-ams/types';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { AppError } from '../../middleware/error-handler.js';
import { createAnomalyFlag } from '../anomalies/anomalies.service.js';
import { type GpsCheckinInput } from './attendance.schema.js';
import {
  validateStudentGeofence,
  detectSpoofing,
  spoofingFlagToAnomalyType,
} from './checkin-helpers.js';

// =============================================================================
// checkInGps — public service function
// =============================================================================

/**
 * Processes a GPS direct check-in for a student.
 *
 * Full algorithm:
 * 1. Resolves the `Student` record from the authenticated user's ID.
 * 2. Fetches and validates the `CourseSession` (must exist and be `ACTIVE`).
 * 3. Verifies the student is enrolled in the session's course section.
 * 4. Checks for a duplicate check-in on the same session.
 * 5. Checks for a concurrent session conflict (student already `PRESENT` elsewhere).
 * 6. Validates the student's GPS coordinates against the venue geofence.
 * 7. Runs spoofing detection on the submitted coordinates.
 * 8. Determines `AttendanceStatus`: `PRESENT` or `PENDING_REVIEW` (if suspicious).
 * 9. Creates `AnomalyFlag` records for each detected spoofing signal.
 * 10. Upserts the `AttendanceRecord` (GPS coordinates are never written).
 * 11. Publishes a Redis pub/sub event to `session:{sessionId}:checkins`.
 * 12. Writes an `ATTENDANCE_RECORDED` audit log entry (fire-and-forget).
 *
 * @param studentUserId - UUID of the authenticated `User` (not the `Student` record).
 * @param data          - Validated GPS check-in payload from {@link GpsCheckinSchema}.
 * @returns The created or updated {@link IAttendanceRecord}.
 * @throws {AppError} `NOT_FOUND` (404)          — student or session does not exist.
 * @throws {AppError} `SESSION_CLOSED` (400)     — session is not in `ACTIVE` state.
 * @throws {AppError} `FORBIDDEN` (403)          — student is not enrolled in this course.
 * @throws {AppError} `CONFLICT` (409)           — student already has `PRESENT` status for this session.
 * @throws {AppError} `CONCURRENT_SESSION` (400) — student is already `PRESENT` in another active session.
 * @throws {AppError} `OUTSIDE_GEOFENCE` (400)   — student is outside the venue geofence.
 */
export async function checkInGps(
  studentUserId: string,
  data: GpsCheckinInput,
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

  // ── Step 3: Verify enrollment ────────────────────────────────────────────
  const enrollment = await prisma.courseEnrollment.findFirst({
    where: { studentId: student.id, courseSectionId: session.courseSectionId },
  });
  if (!enrollment) {
    throw new AppError('FORBIDDEN', 'You are not enrolled in this course.', 403);
  }

  // ── Step 4: Check for duplicate check-in ────────────────────────────────
  const existing = await prisma.attendanceRecord.findUnique({
    where: { studentId_sessionId: { studentId: student.id, sessionId: data.sessionId } },
  });
  if (existing?.status === AttendanceStatus.PRESENT) {
    throw new AppError('CONFLICT', 'Already checked in to this session.', 409);
  }

  // ── Step 5: Concurrent session conflict check ────────────────────────────
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
        description: `Student attempted to check in to session ${data.sessionId} while already PRESENT in session ${concurrentRecord.sessionId}.`,
      },
      studentUserId,
    );
    throw new AppError(
      'CONCURRENT_SESSION',
      'You are already checked in to another active session.',
      400,
    );
  }

  // ── Step 6: Geofence validation ──────────────────────────────────────────
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

  // ── Step 7: Spoofing detection ───────────────────────────────────────────
  const spoofingResult = await detectSpoofing({
    studentId: student.id,
    latitude: data.latitude,
    longitude: data.longitude,
    mockLocationEnabled: data.mockLocationEnabled,
    deviceRooted: data.deviceRooted,
    currentTimestamp: new Date(),
  });

  // ── Step 8: Determine attendance status ─────────────────────────────────
  const status: AttendanceStatus = spoofingResult.isSuspicious
    ? AttendanceStatus.PENDING_REVIEW
    : AttendanceStatus.PRESENT;

  // ── Step 9: Create anomaly flags for each spoofing signal ────────────────
  if (spoofingResult.isSuspicious) {
    for (const flag of spoofingResult.flags) {
      const anomalyType = spoofingFlagToAnomalyType(flag);
      if (anomalyType !== undefined) {
        void createAnomalyFlag(
          {
            studentId: student.id,
            sessionId: data.sessionId,
            flagType: anomalyType,
            description: `Spoofing signal detected during GPS check-in: ${flag}.`,
          },
          studentUserId,
        );
      }
    }
  }

  // ── Step 10: Upsert AttendanceRecord (no GPS coordinates stored) ─────────
  const now = new Date();
  const record = await prisma.attendanceRecord.upsert({
    where: { studentId_sessionId: { studentId: student.id, sessionId: data.sessionId } },
    create: {
      studentId: student.id,
      sessionId: data.sessionId,
      enrollmentId: enrollment.id,
      status,
      checkInMethod: CheckInMethod.GPS_DIRECT,
      checkedInAt: now,
      deviceRooted: data.deviceRooted,
      spoofingFlagged: spoofingResult.isSuspicious,
    },
    update: {
      status,
      checkInMethod: CheckInMethod.GPS_DIRECT,
      checkedInAt: now,
      deviceRooted: data.deviceRooted,
      spoofingFlagged: spoofingResult.isSuspicious,
    },
  });

  // ── Step 11: Publish Redis pub/sub event ─────────────────────────────────
  void redis.publish(
    `session:${data.sessionId}:checkins`,
    JSON.stringify({
      event: 'CHECKIN',
      studentId: student.id,
      studentName: student.user.fullName,
      checkedInAt: now.toISOString(),
      checkInMethod: CheckInMethod.GPS_DIRECT,
      status,
    }),
  );

  // ── Step 12: Write audit log (fire-and-forget) ───────────────────────────
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
        checkInMethod: CheckInMethod.GPS_DIRECT,
        spoofingFlagged: spoofingResult.isSuspicious,
      },
    },
  });

  return record as unknown as IAttendanceRecord;
}
