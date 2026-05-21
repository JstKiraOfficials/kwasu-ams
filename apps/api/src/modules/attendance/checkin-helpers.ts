/**
 * @file checkin-helpers.ts
 * @module modules/attendance
 *
 * Shared geofence validation, spoofing detection, and anomaly-type mapping
 * helpers used by all three check-in services (GPS, QR, alphanumeric code).
 *
 * Extracted from `checkin-gps.service.ts` so that `checkin-qr.service.ts` and
 * `checkin-code.service.ts` can reuse the same logic without duplication.
 *
 * Security invariants:
 * - GPS coordinates are **never stored** — only the boolean geofence result is
 *   used downstream.
 * - Velocity spoofing is intentionally skipped: previous GPS coordinates are
 *   never stored (NDPA compliance), so no prior position is available.
 */

import { AnomalyType } from '@kwasu-ams/types';
import {
  validateGeofence,
  isWithinNigeriaBounds,
  checkSpoofing,
  type SpoofingFlag,
} from '@kwasu-ams/utils';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error-handler.js';

// =============================================================================
// Exported interfaces
// =============================================================================

/**
 * Result returned by {@link validateStudentGeofence}.
 */
export interface GeofenceValidationResult {
  /** Whether the student's coordinates are inside the venue geofence. */
  inside: boolean;
  /** Straight-line distance from the student to the venue centre, in metres. */
  distanceMetres: number;
  /** Human-readable venue name for error messages. */
  venueName: string;
}

/**
 * Input for {@link detectSpoofing}.
 */
export interface SpoofingDetectionInput {
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
 * Result returned by {@link detectSpoofing}.
 */
export interface SpoofingDetectionResult {
  /** `true` if any spoofing signal was detected. */
  isSuspicious: boolean;
  /** List of detected spoofing flag strings. */
  flags: SpoofingFlag[];
}

// =============================================================================
// validateStudentGeofence
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
 * @throws {AppError} `NOT_FOUND` (404)        — session does not exist.
 * @throws {AppError} `OUTSIDE_GEOFENCE` (400) — coordinates are outside Nigeria's bounding box.
 */
export async function validateStudentGeofence(
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

// =============================================================================
// detectSpoofing
// =============================================================================

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
export async function detectSpoofing(
  input: SpoofingDetectionInput,
): Promise<SpoofingDetectionResult> {
  const result = checkSpoofing({
    latitude: input.latitude,
    longitude: input.longitude,
    mockLocationEnabled: input.mockLocationEnabled,
    currentTimestamp: input.currentTimestamp,
  });

  return { isSuspicious: result.isSuspicious, flags: result.flags };
}

// =============================================================================
// spoofingFlagToAnomalyType
// =============================================================================

/**
 * Maps a `SpoofingFlag` string from `checkSpoofing()` to the corresponding
 * `AnomalyType` enum value used when creating `AnomalyFlag` records.
 *
 * @param flag - A spoofing flag string returned by `checkSpoofing()`.
 * @returns The matching {@link AnomalyType}, or `undefined` if unmapped.
 */
export function spoofingFlagToAnomalyType(flag: SpoofingFlag): AnomalyType | undefined {
  const map: Record<SpoofingFlag, AnomalyType> = {
    PRECISION_SPOOFING: AnomalyType.GPS_PRECISION_SPOOFING,
    VELOCITY_SPOOFING: AnomalyType.GPS_VELOCITY_SPOOFING,
    MOCK_LOCATION: AnomalyType.MOCK_LOCATION_DETECTED,
    OUTSIDE_NIGERIA: AnomalyType.OUTSIDE_NIGERIA_BOUNDS,
  };
  return map[flag];
}
