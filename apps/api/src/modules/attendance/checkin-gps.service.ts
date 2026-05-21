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
 * Velocity spoofing check is intentionally skipped: previous GPS coordinates
 * are never stored (NDPA compliance), so the server has no prior coordinates
 * to compute velocity against.
 */

import {
  AnomalyType,
  AttendanceStatus,
  CheckInMethod,
  type IAttendanceRecord,
} from '@kwasu-ams/types';
import {
  validateGeofence,
  isWithinNigeriaBounds,
  checkSpoofing,
  type SpoofingFlag,
} from '@kwasu-ams/utils';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { AppError } from '../../middleware/error-handler.js';
import { createAnomalyFlag } from '../anomalies/anomalies.service.js';
import { type GpsCheckinInput } from './attendance.schema.js';

// =============================================================================
// Internal interfaces
// =============================================================================

/**
 * Result returned by the private geofence validation helper.
 */
interface GeofenceValidationResult {
  /** Whether the student's coordinates are inside the venue geofence. */
  inside: boolean;
  /** Straight-line distance from the student to the venue centre, in metres. */
  distanceMetres: number;
  /** Human-readable venue name for error messages. */
  venueName: string;
}

/**
 * Input for the private spoofing detection helper.
 */
interface SpoofingDetectionInput {
  /** UUID of the `Student` record (not the `User`). */
  studentId: string;
  /** Student-submitted latitude. */
  latitude: number;
  /** Student-submitted longitude. */
  longitude: number;
  /** Whether the device reported mock location is enabled. */
  mockLocationEnabled: boolean;
  /** Whether the device reported it is rooted/jailbroken. */
  deviceRooted: boolean;
  /** Timestamp of the current check-in attempt. */
  currentTimestamp: Date;
}

/**
 * Result returned by the private spoofing detection helper.
 */
interface SpoofingDetectionResult {
  /** `true` if any spoofing signal was detected. */
  isSuspicious: boolean;
  /** List of detected spoofing flag strings. */
  flags: SpoofingFlag[];
}

// =============================================================================
// Private helpers
// =============================================================================

/**
 * Validates that the student's GPS coordinates are within the venue geofence
 * for the given session.
 *
 * Steps:
 * 1. Fetches the session with its venue from the database.
 * 2. Rejects coordinates outside Nigeria's bounding box before Haversine runs.
 * 3. Runs the Haversine formula via `validateGeofence()` from `@kwasu-ams/utils`.
 *
 * @param studentLat - Student-submitted latitude.
 * @param studentLng - Student-submitted longitude.
 * @param sessionId  - UUID of the `CourseSession` to validate against.
 * @returns A {@link GeofenceValidationResult} with `inside`, `distanceMetres`, and `venueName`.
 * @throws {AppError} `NOT_FOUND` (404) — session does not exist.
 * @throws {AppError} `OUTSIDE_GEOFENCE` (400) — coordinates are outside Nigeria's bounding box.
 */
async function validateStudentGeofence(
  studentLat: number,
  studentLng: number,
  sessionId: string,
): Promise<GeofenceValidationResult> {
  const session = await prisma.courseSession.findUnique({
    where: { id: sessionId },
    include: { venue: true },
  });

  if (!session) {
    throw new AppError('NOT_FOUND', 'Session not found.', 404);
  }

  if (!isWithinNigeriaBounds(studentLat, studentLng)) {
    throw new AppError('OUTSIDE_GEOFENCE', 'Location outside Nigeria.', 400);
  }

  const result = validateGeofence({
    studentLat,
    studentLng,
    venueLat: session.venue.latitude,
    venueLng: session.venue.longitude,
    radiusMetres: session.venue.geofenceRadius,
    venueName: session.venue.name,
  });

  return {
    inside: result.inside,
    distanceMetres: result.distanceMetres,
    venueName: result.venue,
  };
}

/**
 * Runs all applicable server-side GPS spoofing checks against the submitted
 * coordinates.
 *
 * Checks performed:
 * - Precision spoofing (> 8 decimal places)
 * - Mock location flag
 * - Nigeria bounds (coordinates outside Nigeria)
 *
 * Velocity spoofing is intentionally skipped because previous GPS coordinates
 * are never stored (NDPA compliance), so no prior position is available.
 *
 * @param input - {@link SpoofingDetectionInput} containing coordinates and device flags.
 * @returns A {@link SpoofingDetectionResult} with `isSuspicious` and `flags`.
 */
async function detectSpoofing(input: SpoofingDetectionInput): Promise<SpoofingDetectionResult> {
  // Velocity check requires previous GPS coordinates which are never stored.
  // Pass undefined for previous coordinates — only precision, mock location,
  // and Nigeria bounds checks will run.
  const result = checkSpoofing({
    latitude: input.latitude,
    longitude: input.longitude,
    mockLocationEnabled: input.mockLocationEnabled,
    currentTimestamp: input.currentTimestamp,
  });

  return { isSuspicious: result.isSuspicious, flags: result.flags };
}

// =============================================================================
// Map spoofing flag strings to AnomalyType enum values
// =============================================================================

/**
 * Maps a `SpoofingFlag` string from `checkSpoofing()` to the corresponding
 * `AnomalyType` enum value used when creating `AnomalyFlag` records.
 *
 * @param flag - A spoofing flag string returned by `checkSpoofing()`.
 * @returns The matching {@link AnomalyType}, or `undefined` if unmapped.
 */
function spoofingFlagToAnomalyType(flag: SpoofingFlag): AnomalyType | undefined {
  const map: Record<SpoofingFlag, AnomalyType> = {
    PRECISION_SPOOFING: AnomalyType.GPS_PRECISION_SPOOFING,
    VELOCITY_SPOOFING: AnomalyType.GPS_VELOCITY_SPOOFING,
    MOCK_LOCATION: AnomalyType.MOCK_LOCATION_DETECTED,
    OUTSIDE_NIGERIA: AnomalyType.OUTSIDE_NIGERIA_BOUNDS,
  };
  return map[flag];
}

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
 * @throws {AppError} `NOT_FOUND` (404)         — student or session does not exist.
 * @throws {AppError} `SESSION_CLOSED` (400)    — session is not in `ACTIVE` state.
 * @throws {AppError} `FORBIDDEN` (403)         — student is not enrolled in this course.
 * @throws {AppError} `CONFLICT` (409)          — student already has `PRESENT` status for this session.
 * @throws {AppError} `CONCURRENT_SESSION` (400) — student is already `PRESENT` in another active session.
 * @throws {AppError} `OUTSIDE_GEOFENCE` (400)  — student is outside the venue geofence.
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
    where: {
      studentId: student.id,
      courseSectionId: session.courseSectionId,
    },
  });
  if (!enrollment) {
    throw new AppError('FORBIDDEN', 'You are not enrolled in this course.', 403);
  }

  // ── Step 4: Check for duplicate check-in ────────────────────────────────
  const existing = await prisma.attendanceRecord.findUnique({
    where: {
      studentId_sessionId: {
        studentId: student.id,
        sessionId: data.sessionId,
      },
    },
  });
  if (existing?.status === AttendanceStatus.PRESENT) {
    throw new AppError('CONFLICT', 'Already checked in to this session.', 409);
  }

  // ── Step 5: Concurrent session conflict check ────────────────────────────
  const concurrentRecord = await prisma.attendanceRecord.findFirst({
    where: {
      studentId: student.id,
      status: AttendanceStatus.PRESENT,
      session: {
        status: 'ACTIVE',
        id: { not: data.sessionId },
      },
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
    where: {
      studentId_sessionId: {
        studentId: student.id,
        sessionId: data.sessionId,
      },
    },
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
