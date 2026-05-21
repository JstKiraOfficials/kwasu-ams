/**
 * @file checkin-gps.test.ts
 * @module modules/attendance/__tests__
 *
 * Unit tests for the GPS direct check-in service (`checkInGps`).
 *
 * All Prisma, Redis, and anomaly service calls are mocked — no real database,
 * Redis, or network connections are used. The `@kwasu-ams/utils` geofence and
 * spoofing helpers are tested through their real implementations so that the
 * Haversine boundary cases (49m inside, 51m outside for a 50m radius) are
 * verified accurately.
 *
 * Test coverage:
 * - Happy path: student inside geofence → `PRESENT`, 201
 * - Boundary: 49m from 50m-radius venue → `PRESENT`
 * - Boundary: 51m from 50m-radius venue → `OUTSIDE_GEOFENCE`
 * - Outside geofence > 200m → no distance hint
 * - Outside geofence ≤ 200m → distance hint included
 * - Mock location enabled → `PENDING_REVIEW`, `AnomalyFlag` created
 * - Precision spoofing (9 decimal places) → `PENDING_REVIEW`, `AnomalyFlag` created
 * - Coordinates outside Nigeria → `OUTSIDE_GEOFENCE`
 * - Session `CLOSED` → `SESSION_CLOSED`
 * - Student not enrolled → `FORBIDDEN`
 * - Student already `PRESENT` in another active session → `CONCURRENT_SESSION`
 * - Successful check-in: no lat/lng in `AttendanceRecord`
 * - Successful check-in: Redis event published
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks — must be declared before imports that use them
// =============================================================================

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    student: { findUnique: vi.fn() },
    courseSession: { findUnique: vi.fn() },
    courseEnrollment: { findFirst: vi.fn() },
    attendanceRecord: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('../../../lib/redis.js', () => ({
  redis: { publish: vi.fn().mockResolvedValue(0) },
  connectRedis: vi.fn(),
}));

vi.mock('../../anomalies/anomalies.service.js', () => ({
  createAnomalyFlag: vi.fn().mockResolvedValue({}),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { checkInGps } from '../checkin-gps.service.js';
import { prisma } from '../../../lib/prisma.js';
import { redis } from '../../../lib/redis.js';
import { createAnomalyFlag } from '../../anomalies/anomalies.service.js';

// =============================================================================
// Helpers — compute a lat/lng offset for a given distance in metres
// =============================================================================

/**
 * Returns a latitude offset that corresponds approximately to `metres` north
 * of the given base latitude. Used to place a student at a known distance from
 * a venue centre for geofence boundary tests.
 *
 * The result is rounded to 6 decimal places (~0.1m precision) to avoid
 * triggering the PRECISION_SPOOFING check (> 8 decimal places).
 *
 * @param metres - Distance in metres.
 * @returns Latitude delta to add to the venue latitude, rounded to 6 d.p.
 */
function latOffsetForMetres(metres: number): number {
  // 1 degree of latitude ≈ 111,320 metres
  return Math.round((metres / 111_320) * 1_000_000) / 1_000_000;
}

// =============================================================================
// Fixtures
// =============================================================================

const USER_ID = 'u0000000-0000-4000-8000-000000000001';
const STUDENT_ID = 's0000000-0000-4000-8000-000000000002';
const SESSION_ID = 'se000000-0000-4000-8000-000000000003';
const SECTION_ID = 'sc000000-0000-4000-8000-000000000004';
const VENUE_ID = 'v0000000-0000-4000-8000-000000000005';
const ENROLLMENT_ID = 'e0000000-0000-4000-8000-000000000006';
const RECORD_ID = 'r0000000-0000-4000-8000-000000000007';

/** Venue centre — KWASU campus approximate coordinates (within Nigeria bounds). */
const VENUE_LAT = 8.6753;
const VENUE_LNG = 4.5228;
const GEOFENCE_RADIUS = 50; // metres

const makeStudent = () => ({
  id: STUDENT_ID,
  userId: USER_ID,
  user: { fullName: 'Test Student' },
});

const makeSession = (status = 'ACTIVE') => ({
  id: SESSION_ID,
  status,
  courseSectionId: SECTION_ID,
  venueId: VENUE_ID,
  venue: {
    id: VENUE_ID,
    name: 'LT1',
    latitude: VENUE_LAT,
    longitude: VENUE_LNG,
    geofenceRadius: GEOFENCE_RADIUS,
  },
});

const makeEnrollment = () => ({
  id: ENROLLMENT_ID,
  studentId: STUDENT_ID,
  courseSectionId: SECTION_ID,
});

const makeRecord = (status = 'PRESENT') => ({
  id: RECORD_ID,
  studentId: STUDENT_ID,
  sessionId: SESSION_ID,
  enrollmentId: ENROLLMENT_ID,
  status,
  checkInMethod: 'GPS_DIRECT',
  checkedInAt: new Date(),
  deviceRooted: false,
  spoofingFlagged: false,
});

/** GPS payload for a student at the venue centre (0m away — clearly inside). */
const insidePayload = {
  sessionId: SESSION_ID,
  latitude: VENUE_LAT,
  longitude: VENUE_LNG,
  deviceFingerprint: 'fp-abc123',
  mockLocationEnabled: false,
  deviceRooted: false,
};

// =============================================================================
// Shared setup
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();

  // Default happy-path mocks — individual tests override as needed
  vi.mocked(prisma.student.findUnique).mockResolvedValue(makeStudent() as never);
  vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(makeSession() as never);
  vi.mocked(prisma.courseEnrollment.findFirst).mockResolvedValue(makeEnrollment() as never);
  vi.mocked(prisma.attendanceRecord.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.attendanceRecord.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.attendanceRecord.upsert).mockResolvedValue(makeRecord() as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
});

// =============================================================================
// Happy path
// =============================================================================

describe('checkInGps — happy path', () => {
  it('returns PRESENT status when student is at the venue centre (0m)', async () => {
    const result = await checkInGps(USER_ID, insidePayload);

    expect(result.status).toBe('PRESENT');
    expect(prisma.attendanceRecord.upsert).toHaveBeenCalledOnce();
  });

  it('does not store latitude or longitude in the AttendanceRecord', async () => {
    await checkInGps(USER_ID, insidePayload);

    const upsertCall = vi.mocked(prisma.attendanceRecord.upsert).mock.calls[0]![0];
    expect(upsertCall.create).not.toHaveProperty('latitude');
    expect(upsertCall.create).not.toHaveProperty('longitude');
    expect(upsertCall.update).not.toHaveProperty('latitude');
    expect(upsertCall.update).not.toHaveProperty('longitude');
  });

  it('publishes a Redis CHECKIN event on success', async () => {
    await checkInGps(USER_ID, insidePayload);

    expect(redis.publish).toHaveBeenCalledOnce();
    const [channel, payload] = vi.mocked(redis.publish).mock.calls[0]!;
    expect(channel).toBe(`session:${SESSION_ID}:checkins`);
    const parsed = JSON.parse(payload as string) as Record<string, unknown>;
    expect(parsed.event).toBe('CHECKIN');
    expect(parsed.checkInMethod).toBe('GPS_DIRECT');
    expect(parsed.status).toBe('PRESENT');
  });

  it('writes an audit log entry (fire-and-forget)', async () => {
    await checkInGps(USER_ID, insidePayload);

    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
    const auditCall = vi.mocked(prisma.auditLog.create).mock.calls[0]![0];
    expect(auditCall.data.action).toBe('ATTENDANCE_RECORDED');
    expect(auditCall.data.entityType).toBe('AttendanceRecord');
  });
});

// =============================================================================
// Geofence boundary tests
// =============================================================================

describe('checkInGps — geofence boundary', () => {
  it('returns PRESENT for a student 49m from a 50m-radius venue', async () => {
    const lat = VENUE_LAT + latOffsetForMetres(49);
    await checkInGps(USER_ID, { ...insidePayload, latitude: lat });

    expect(prisma.attendanceRecord.upsert).toHaveBeenCalledOnce();
    const upsertCall = vi.mocked(prisma.attendanceRecord.upsert).mock.calls[0]![0];
    expect(upsertCall.create.status).toBe('PRESENT');
  });

  it('throws OUTSIDE_GEOFENCE for a student 51m from a 50m-radius venue', async () => {
    const lat = VENUE_LAT + latOffsetForMetres(51);

    await expect(checkInGps(USER_ID, { ...insidePayload, latitude: lat })).rejects.toMatchObject({
      code: 'OUTSIDE_GEOFENCE',
      statusCode: 400,
    });
  });

  it('includes distance hint when student is 180m away (≤ 200m threshold)', async () => {
    const lat = VENUE_LAT + latOffsetForMetres(180);

    await expect(checkInGps(USER_ID, { ...insidePayload, latitude: lat })).rejects.toMatchObject({
      code: 'OUTSIDE_GEOFENCE',
      details: expect.objectContaining({
        distanceMetres: expect.any(Number),
        hint: expect.stringContaining('m from the venue'),
      }),
    });
  });

  it('omits distance hint when student is 250m away (> 200m threshold)', async () => {
    const lat = VENUE_LAT + latOffsetForMetres(250);

    await expect(checkInGps(USER_ID, { ...insidePayload, latitude: lat })).rejects.toMatchObject({
      code: 'OUTSIDE_GEOFENCE',
      details: expect.objectContaining({
        distanceMetres: expect.any(Number),
        hint: undefined,
      }),
    });
  });
});

// =============================================================================
// Nigeria bounds rejection
// =============================================================================

describe('checkInGps — Nigeria bounds', () => {
  it('throws OUTSIDE_GEOFENCE for coordinates outside Nigeria (London)', async () => {
    await expect(
      checkInGps(USER_ID, { ...insidePayload, latitude: 51.5074, longitude: -0.1278 }),
    ).rejects.toMatchObject({
      code: 'OUTSIDE_GEOFENCE',
      statusCode: 400,
    });
  });
});

// =============================================================================
// Spoofing detection
// =============================================================================

describe('checkInGps — spoofing detection', () => {
  it('returns PENDING_REVIEW and creates AnomalyFlag when mockLocationEnabled is true', async () => {
    vi.mocked(prisma.attendanceRecord.upsert).mockResolvedValue(
      makeRecord('PENDING_REVIEW') as never,
    );

    const result = await checkInGps(USER_ID, { ...insidePayload, mockLocationEnabled: true });

    expect(result.status).toBe('PENDING_REVIEW');
    expect(createAnomalyFlag).toHaveBeenCalledWith(
      expect.objectContaining({ flagType: 'MOCK_LOCATION_DETECTED' }),
      USER_ID,
    );
  });

  it('returns PENDING_REVIEW and creates AnomalyFlag for coordinates with 9 decimal places', async () => {
    vi.mocked(prisma.attendanceRecord.upsert).mockResolvedValue(
      makeRecord('PENDING_REVIEW') as never,
    );

    // 9 decimal places triggers PRECISION_SPOOFING
    const result = await checkInGps(USER_ID, {
      ...insidePayload,
      latitude: 8.675300001,
      longitude: 4.522800001,
    });

    expect(result.status).toBe('PENDING_REVIEW');
    expect(createAnomalyFlag).toHaveBeenCalledWith(
      expect.objectContaining({ flagType: 'GPS_PRECISION_SPOOFING' }),
      USER_ID,
    );
  });

  it('does not create AnomalyFlag for a clean check-in', async () => {
    await checkInGps(USER_ID, insidePayload);

    expect(createAnomalyFlag).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Session state validation
// =============================================================================

describe('checkInGps — session state', () => {
  it('throws SESSION_CLOSED when session status is CLOSED', async () => {
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(makeSession('CLOSED') as never);

    await expect(checkInGps(USER_ID, insidePayload)).rejects.toMatchObject({
      code: 'SESSION_CLOSED',
      statusCode: 400,
    });
  });

  it('throws SESSION_CLOSED when session status is SCHEDULED', async () => {
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(makeSession('SCHEDULED') as never);

    await expect(checkInGps(USER_ID, insidePayload)).rejects.toMatchObject({
      code: 'SESSION_CLOSED',
      statusCode: 400,
    });
  });

  it('throws SESSION_CLOSED when session status is LOCKED', async () => {
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(makeSession('LOCKED') as never);

    await expect(checkInGps(USER_ID, insidePayload)).rejects.toMatchObject({
      code: 'SESSION_CLOSED',
      statusCode: 400,
    });
  });

  it('throws NOT_FOUND when session does not exist', async () => {
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(null);

    await expect(checkInGps(USER_ID, insidePayload)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });
});

// =============================================================================
// Enrollment validation
// =============================================================================

describe('checkInGps — enrollment', () => {
  it('throws FORBIDDEN when student is not enrolled in the course', async () => {
    vi.mocked(prisma.courseEnrollment.findFirst).mockResolvedValue(null);

    await expect(checkInGps(USER_ID, insidePayload)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    });
  });
});

// =============================================================================
// Duplicate check-in
// =============================================================================

describe('checkInGps — duplicate check-in', () => {
  it('throws CONFLICT when student already has PRESENT status for this session', async () => {
    vi.mocked(prisma.attendanceRecord.findUnique).mockResolvedValue(makeRecord('PRESENT') as never);

    await expect(checkInGps(USER_ID, insidePayload)).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });
  });

  it('allows re-check-in when existing record has PENDING_REVIEW status', async () => {
    vi.mocked(prisma.attendanceRecord.findUnique).mockResolvedValue(
      makeRecord('PENDING_REVIEW') as never,
    );

    const result = await checkInGps(USER_ID, insidePayload);
    expect(result).toBeDefined();
  });
});

// =============================================================================
// Concurrent session detection
// =============================================================================

describe('checkInGps — concurrent session', () => {
  it('throws CONCURRENT_SESSION and creates AnomalyFlag when student is PRESENT in another active session', async () => {
    vi.mocked(prisma.attendanceRecord.findFirst).mockResolvedValue({
      id: 'other-record',
      studentId: STUDENT_ID,
      sessionId: 'other-session-id',
      status: 'PRESENT',
    } as never);

    await expect(checkInGps(USER_ID, insidePayload)).rejects.toMatchObject({
      code: 'CONCURRENT_SESSION',
      statusCode: 400,
    });

    expect(createAnomalyFlag).toHaveBeenCalledWith(
      expect.objectContaining({ flagType: 'CONCURRENT_SESSION_CONFLICT' }),
      USER_ID,
    );
  });
});

// =============================================================================
// Student not found
// =============================================================================

describe('checkInGps — student not found', () => {
  it('throws NOT_FOUND when no Student record is linked to the user', async () => {
    vi.mocked(prisma.student.findUnique).mockResolvedValue(null);

    await expect(checkInGps(USER_ID, insidePayload)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });
});
