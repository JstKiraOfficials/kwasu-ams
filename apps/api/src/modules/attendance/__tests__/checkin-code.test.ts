/**
 * @file checkin-code.test.ts
 * @module modules/attendance/__tests__
 *
 * Unit tests for the alphanumeric code check-in service
 * (`generateSessionCode`, `checkInCode`).
 *
 * All Prisma, Redis, and anomaly service calls are mocked. The
 * `generateAlphanumericCode` and `validateAlphanumericCode` helpers from
 * `@kwasu-ams/utils` run through their real implementations so charset
 * compliance is verified accurately.
 *
 * Test coverage:
 *
 * generateSessionCode:
 * - Returns a 6-character code containing only ALPHANUMERIC_CHARSET characters.
 * - Code contains no excluded characters (O, I, S, 0, 1).
 * - Stores code in Redis with 900-second TTL.
 * - Throws NOT_FOUND when session does not exist.
 * - Throws SESSION_NOT_ACTIVE when session is not ACTIVE.
 *
 * checkInCode:
 * - Correct code + inside geofence → PRESENT.
 * - Wrong code → CODE_INVALID.
 * - No Redis key (expired/deleted) → CODE_INVALID.
 * - Correct code + outside geofence → OUTSIDE_GEOFENCE.
 * - Correct code + mockLocationEnabled → PENDING_REVIEW, AnomalyFlag created.
 * - Session CLOSED → SESSION_CLOSED.
 * - Student not enrolled → FORBIDDEN.
 * - Already PRESENT → CONFLICT.
 * - Concurrent session → CONCURRENT_SESSION, AnomalyFlag created.
 * - Successful check-in: no lat/lng in AttendanceRecord.
 * - Successful check-in: Redis event published.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ALPHANUMERIC_CHARSET } from '@kwasu-ams/utils';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    student: { findUnique: vi.fn() },
    courseSession: { findUnique: vi.fn(), update: vi.fn() },
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
  redis: {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn(),
    publish: vi.fn().mockResolvedValue(0),
  },
  connectRedis: vi.fn(),
}));

vi.mock('../../anomalies/anomalies.service.js', () => ({
  createAnomalyFlag: vi.fn().mockResolvedValue({}),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { generateSessionCode, checkInCode } from '../checkin-code.service.js';
import { prisma } from '../../../lib/prisma.js';
import { redis } from '../../../lib/redis.js';
import { createAnomalyFlag } from '../../anomalies/anomalies.service.js';

// =============================================================================
// Fixtures
// =============================================================================

const USER_ID = 'a0000000-0000-4000-8000-000000000001';
const STUDENT_ID = 'a0000000-0000-4000-8000-000000000002';
const SESSION_ID = 'a0000000-0000-4000-8000-000000000003';
const VENUE_ID = 'a0000000-0000-4000-8000-000000000004';
const SECTION_ID = 'a0000000-0000-4000-8000-000000000005';
const ENROLLMENT_ID = 'a0000000-0000-4000-8000-000000000006';
const RECORD_ID = 'a0000000-0000-4000-8000-000000000007';

const VENUE_LAT = 8.6753;
const VENUE_LNG = 4.5228;

/** A valid 6-character code from the unambiguous charset. */
const VALID_CODE = 'ABCDEF';

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
    geofenceRadius: 50,
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
  checkInMethod: 'ALPHANUMERIC_CODE',
  checkedInAt: new Date(),
  deviceRooted: false,
  spoofingFlagged: false,
});

const baseCheckinPayload = {
  sessionId: SESSION_ID,
  code: VALID_CODE,
  latitude: VENUE_LAT,
  longitude: VENUE_LNG,
  deviceFingerprint: 'fp-test',
  mockLocationEnabled: false,
  deviceRooted: false,
};

// =============================================================================
// Shared setup
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.student.findUnique).mockResolvedValue(makeStudent() as never);
  vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(makeSession() as never);
  vi.mocked(prisma.courseSession.update).mockResolvedValue(makeSession() as never);
  vi.mocked(prisma.courseEnrollment.findFirst).mockResolvedValue(makeEnrollment() as never);
  vi.mocked(prisma.attendanceRecord.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.attendanceRecord.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.attendanceRecord.upsert).mockResolvedValue(makeRecord() as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  // Default: Redis has the valid code stored
  vi.mocked(redis.get).mockResolvedValue(VALID_CODE);
});

// =============================================================================
// generateSessionCode
// =============================================================================

describe('generateSessionCode', () => {
  it('returns a 6-character code', async () => {
    const result = await generateSessionCode(SESSION_ID, USER_ID);

    expect(result.code).toHaveLength(6);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('returns a code containing only ALPHANUMERIC_CHARSET characters', async () => {
    const result = await generateSessionCode(SESSION_ID, USER_ID);

    for (const char of result.code) {
      expect(ALPHANUMERIC_CHARSET).toContain(char);
    }
  });

  it('returns a code containing no excluded characters (O, I, S, 0, 1)', async () => {
    // Run multiple times to reduce probability of false pass
    for (let i = 0; i < 20; i++) {
      const result = await generateSessionCode(SESSION_ID, USER_ID);
      expect(result.code).not.toMatch(/[OIS01]/);
    }
  });

  it('stores the code in Redis with 900-second TTL', async () => {
    const result = await generateSessionCode(SESSION_ID, USER_ID);

    expect(redis.set).toHaveBeenCalledWith(`code:session:${SESSION_ID}`, result.code, 'EX', 900);
  });

  it('throws NOT_FOUND when session does not exist', async () => {
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(null);

    await expect(generateSessionCode(SESSION_ID, USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });

  it('throws SESSION_NOT_ACTIVE when session is CLOSED', async () => {
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(makeSession('CLOSED') as never);

    await expect(generateSessionCode(SESSION_ID, USER_ID)).rejects.toMatchObject({
      code: 'SESSION_NOT_ACTIVE',
      statusCode: 400,
    });
  });
});

// =============================================================================
// checkInCode — happy path
// =============================================================================

describe('checkInCode — happy path', () => {
  it('returns PRESENT when code is correct and student is inside geofence', async () => {
    const result = await checkInCode(USER_ID, baseCheckinPayload);

    expect(result.status).toBe('PRESENT');
    expect(prisma.attendanceRecord.upsert).toHaveBeenCalledOnce();
  });

  it('does not store latitude or longitude in the AttendanceRecord', async () => {
    await checkInCode(USER_ID, baseCheckinPayload);

    const upsertCall = vi.mocked(prisma.attendanceRecord.upsert).mock.calls[0]![0];
    expect(upsertCall.create).not.toHaveProperty('latitude');
    expect(upsertCall.create).not.toHaveProperty('longitude');
  });

  it('publishes a Redis CHECKIN event on success', async () => {
    await checkInCode(USER_ID, baseCheckinPayload);

    expect(redis.publish).toHaveBeenCalledOnce();
    const [channel, payload] = vi.mocked(redis.publish).mock.calls[0]!;
    expect(channel).toBe(`session:${SESSION_ID}:checkins`);
    const parsed = JSON.parse(payload as string) as Record<string, unknown>;
    expect(parsed.checkInMethod).toBe('ALPHANUMERIC_CODE');
  });

  it('accepts code submitted in lowercase (normalised to uppercase)', async () => {
    const result = await checkInCode(USER_ID, {
      ...baseCheckinPayload,
      code: VALID_CODE.toLowerCase(),
    });

    expect(result.status).toBe('PRESENT');
  });
});

// =============================================================================
// checkInCode — code validation
// =============================================================================

describe('checkInCode — code validation', () => {
  it('throws CODE_INVALID when submitted code does not match Redis', async () => {
    vi.mocked(redis.get).mockResolvedValue('XXXXXX');

    await expect(checkInCode(USER_ID, baseCheckinPayload)).rejects.toMatchObject({
      code: 'CODE_INVALID',
      statusCode: 400,
    });
  });

  it('throws CODE_INVALID when Redis key does not exist (expired or session closed)', async () => {
    vi.mocked(redis.get).mockResolvedValue(null);

    await expect(checkInCode(USER_ID, baseCheckinPayload)).rejects.toMatchObject({
      code: 'CODE_INVALID',
      statusCode: 400,
    });
  });
});

// =============================================================================
// checkInCode — geofence and spoofing
// =============================================================================

describe('checkInCode — geofence and spoofing', () => {
  it('throws OUTSIDE_GEOFENCE when student is outside the venue', async () => {
    const outsideLat = VENUE_LAT + Math.round((500 / 111_320) * 1_000_000) / 1_000_000;

    await expect(
      checkInCode(USER_ID, { ...baseCheckinPayload, latitude: outsideLat }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_GEOFENCE', statusCode: 400 });
  });

  it('returns PENDING_REVIEW and creates AnomalyFlag when mockLocationEnabled is true', async () => {
    vi.mocked(prisma.attendanceRecord.upsert).mockResolvedValue(
      makeRecord('PENDING_REVIEW') as never,
    );

    const result = await checkInCode(USER_ID, {
      ...baseCheckinPayload,
      mockLocationEnabled: true,
    });

    expect(result.status).toBe('PENDING_REVIEW');
    expect(createAnomalyFlag).toHaveBeenCalledWith(
      expect.objectContaining({ flagType: 'MOCK_LOCATION_DETECTED' }),
      USER_ID,
    );
  });
});

// =============================================================================
// checkInCode — session and enrollment errors
// =============================================================================

describe('checkInCode — session and enrollment errors', () => {
  it('throws SESSION_CLOSED when session is not ACTIVE', async () => {
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(makeSession('CLOSED') as never);

    await expect(checkInCode(USER_ID, baseCheckinPayload)).rejects.toMatchObject({
      code: 'SESSION_CLOSED',
      statusCode: 400,
    });
  });

  it('throws FORBIDDEN when student is not enrolled', async () => {
    vi.mocked(prisma.courseEnrollment.findFirst).mockResolvedValue(null);

    await expect(checkInCode(USER_ID, baseCheckinPayload)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    });
  });

  it('throws CONFLICT when student already has PRESENT status', async () => {
    vi.mocked(prisma.attendanceRecord.findUnique).mockResolvedValue(makeRecord('PRESENT') as never);

    await expect(checkInCode(USER_ID, baseCheckinPayload)).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });
  });

  it('throws CONCURRENT_SESSION and creates AnomalyFlag when student is PRESENT elsewhere', async () => {
    vi.mocked(prisma.attendanceRecord.findFirst).mockResolvedValue({
      id: 'a0000000-0000-4000-8000-000000000099',
      studentId: STUDENT_ID,
      sessionId: 'a0000000-0000-4000-8000-000000000088',
      status: 'PRESENT',
    } as never);

    await expect(checkInCode(USER_ID, baseCheckinPayload)).rejects.toMatchObject({
      code: 'CONCURRENT_SESSION',
      statusCode: 400,
    });

    expect(createAnomalyFlag).toHaveBeenCalledWith(
      expect.objectContaining({ flagType: 'CONCURRENT_SESSION_CONFLICT' }),
      USER_ID,
    );
  });
});
