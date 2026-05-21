/**
 * @file checkin-qr.test.ts
 * @module modules/attendance/__tests__
 *
 * Unit tests for the QR code check-in service (`generateQrToken`, `checkInQr`).
 *
 * All Prisma, Redis, and anomaly service calls are mocked. The `@kwasu-ams/utils`
 * QR token helpers run through their real implementations so JWT signing and
 * verification behaviour is tested accurately.
 *
 * Test coverage:
 *
 * generateQrToken:
 * - Returns a valid JWT token and expiresAt timestamp.
 * - Deletes the old Redis key before storing the new token.
 * - Throws NOT_FOUND when session does not exist.
 * - Throws SESSION_NOT_ACTIVE when session is not ACTIVE.
 *
 * checkInQr:
 * - Valid token + inside geofence → PRESENT, 201.
 * - Expired JWT → QR_TOKEN_EXPIRED.
 * - Tampered/invalid JWT → QR_TOKEN_INVALID.
 * - Valid JWT but Redis token mismatch (regenerated) → QR_TOKEN_INVALID.
 * - Valid token + outside geofence → OUTSIDE_GEOFENCE.
 * - Valid token + mockLocationEnabled → PENDING_REVIEW, AnomalyFlag created.
 * - Session CLOSED → SESSION_CLOSED.
 * - Student not enrolled → FORBIDDEN.
 * - Already PRESENT → CONFLICT.
 * - Concurrent session → CONCURRENT_SESSION, AnomalyFlag created.
 * - Successful check-in: no lat/lng in AttendanceRecord.
 * - Successful check-in: Redis event published.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    del: vi.fn().mockResolvedValue(1),
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

import { generateQrToken, checkInQr } from '../checkin-qr.service.js';
import { prisma } from '../../../lib/prisma.js';
import { redis } from '../../../lib/redis.js';
import { createAnomalyFlag } from '../../anomalies/anomalies.service.js';
import { generateQrToken as utilsGenerateQrToken } from '@kwasu-ams/utils';

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
  checkInMethod: 'QR_CODE',
  checkedInAt: new Date(),
  deviceRooted: false,
  spoofingFlagged: false,
});

/**
 * Generates a real signed QR token for SESSION_ID using the test JWT secret.
 * The token is valid for 10 minutes from now.
 *
 * @returns A signed JWT string.
 */
function makeValidQrToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const result = utilsGenerateQrToken(
    {
      sessionId: SESSION_ID,
      venueId: VENUE_ID,
      issuedAt: now,
      expiresAt: now + 600,
    },
    process.env['JWT_ACCESS_SECRET']!,
  );
  if (!result.ok) throw new Error('Failed to generate test QR token');
  return result.value;
}

const baseCheckinPayload = {
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
});

// =============================================================================
// generateQrToken
// =============================================================================

describe('generateQrToken', () => {
  it('returns a token string and expiresAt date', async () => {
    const result = await generateQrToken(SESSION_ID, USER_ID);

    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(10);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('deletes the old Redis key before storing the new token', async () => {
    await generateQrToken(SESSION_ID, USER_ID);

    const delCall = vi.mocked(redis.del).mock.calls[0];
    const setCall = vi.mocked(redis.set).mock.calls[0];
    expect(delCall![0]).toBe(`qr:session:${SESSION_ID}`);
    expect(setCall![0]).toBe(`qr:session:${SESSION_ID}`);
    // del must be called before set
    expect(vi.mocked(redis.del).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(redis.set).mock.invocationCallOrder[0]!,
    );
  });

  it('stores the token in Redis with 600-second TTL', async () => {
    const { token } = await generateQrToken(SESSION_ID, USER_ID);

    expect(redis.set).toHaveBeenCalledWith(`qr:session:${SESSION_ID}`, token, 'EX', 600);
  });

  it('throws NOT_FOUND when session does not exist', async () => {
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(null);

    await expect(generateQrToken(SESSION_ID, USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });

  it('throws SESSION_NOT_ACTIVE when session is CLOSED', async () => {
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(makeSession('CLOSED') as never);

    await expect(generateQrToken(SESSION_ID, USER_ID)).rejects.toMatchObject({
      code: 'SESSION_NOT_ACTIVE',
      statusCode: 400,
    });
  });
});

// =============================================================================
// checkInQr — happy path
// =============================================================================

describe('checkInQr — happy path', () => {
  it('returns PRESENT when token is valid and student is inside geofence', async () => {
    const token = makeValidQrToken();
    vi.mocked(redis.get).mockResolvedValue(token);

    const result = await checkInQr(USER_ID, { ...baseCheckinPayload, qrToken: token });

    expect(result.status).toBe('PRESENT');
    expect(prisma.attendanceRecord.upsert).toHaveBeenCalledOnce();
  });

  it('does not store latitude or longitude in the AttendanceRecord', async () => {
    const token = makeValidQrToken();
    vi.mocked(redis.get).mockResolvedValue(token);

    await checkInQr(USER_ID, { ...baseCheckinPayload, qrToken: token });

    const upsertCall = vi.mocked(prisma.attendanceRecord.upsert).mock.calls[0]![0];
    expect(upsertCall.create).not.toHaveProperty('latitude');
    expect(upsertCall.create).not.toHaveProperty('longitude');
  });

  it('publishes a Redis CHECKIN event on success', async () => {
    const token = makeValidQrToken();
    vi.mocked(redis.get).mockResolvedValue(token);

    await checkInQr(USER_ID, { ...baseCheckinPayload, qrToken: token });

    expect(redis.publish).toHaveBeenCalledOnce();
    const [channel, payload] = vi.mocked(redis.publish).mock.calls[0]!;
    expect(channel).toBe(`session:${SESSION_ID}:checkins`);
    const parsed = JSON.parse(payload as string) as Record<string, unknown>;
    expect(parsed.checkInMethod).toBe('QR_CODE');
  });
});

// =============================================================================
// checkInQr — token validation
// =============================================================================

describe('checkInQr — token validation', () => {
  it('throws QR_TOKEN_EXPIRED for an expired JWT', async () => {
    // Generate a token that expired 1 second ago
    const now = Math.floor(Date.now() / 1000);
    const expiredResult = utilsGenerateQrToken(
      { sessionId: SESSION_ID, venueId: VENUE_ID, issuedAt: now - 700, expiresAt: now - 100 },
      process.env['JWT_ACCESS_SECRET']!,
    );
    if (!expiredResult.ok) throw new Error('setup failed');

    await expect(
      checkInQr(USER_ID, { ...baseCheckinPayload, qrToken: expiredResult.value }),
    ).rejects.toMatchObject({ code: 'QR_TOKEN_EXPIRED', statusCode: 400 });
  });

  it('throws QR_TOKEN_INVALID for a tampered token', async () => {
    await expect(
      checkInQr(USER_ID, { ...baseCheckinPayload, qrToken: 'not.a.valid.jwt' }),
    ).rejects.toMatchObject({ code: 'QR_TOKEN_INVALID', statusCode: 400 });
  });

  it('throws QR_TOKEN_INVALID when Redis token does not match (regenerated)', async () => {
    const token = makeValidQrToken();
    // Redis has a different (newer) token
    vi.mocked(redis.get).mockResolvedValue('different-token-value');

    await expect(
      checkInQr(USER_ID, { ...baseCheckinPayload, qrToken: token }),
    ).rejects.toMatchObject({ code: 'QR_TOKEN_INVALID', statusCode: 400 });
  });
});

// =============================================================================
// checkInQr — geofence and spoofing
// =============================================================================

describe('checkInQr — geofence and spoofing', () => {
  it('throws OUTSIDE_GEOFENCE when student is outside the venue', async () => {
    const token = makeValidQrToken();
    vi.mocked(redis.get).mockResolvedValue(token);

    const outsideLat = VENUE_LAT + Math.round((500 / 111_320) * 1_000_000) / 1_000_000;

    await expect(
      checkInQr(USER_ID, { ...baseCheckinPayload, latitude: outsideLat, qrToken: token }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_GEOFENCE', statusCode: 400 });
  });

  it('returns PENDING_REVIEW and creates AnomalyFlag when mockLocationEnabled is true', async () => {
    const token = makeValidQrToken();
    vi.mocked(redis.get).mockResolvedValue(token);
    vi.mocked(prisma.attendanceRecord.upsert).mockResolvedValue(
      makeRecord('PENDING_REVIEW') as never,
    );

    const result = await checkInQr(USER_ID, {
      ...baseCheckinPayload,
      qrToken: token,
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
// checkInQr — session and enrollment errors
// =============================================================================

describe('checkInQr — session and enrollment errors', () => {
  it('throws SESSION_CLOSED when session is not ACTIVE', async () => {
    const token = makeValidQrToken();
    vi.mocked(redis.get).mockResolvedValue(token);
    // The service queries the session once (step 4) to check status.
    // The geofence helper (step 8) is never reached when the session is CLOSED.
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(makeSession('CLOSED') as never);

    await expect(
      checkInQr(USER_ID, { ...baseCheckinPayload, qrToken: token }),
    ).rejects.toMatchObject({ code: 'SESSION_CLOSED', statusCode: 400 });
  });

  it('throws FORBIDDEN when student is not enrolled', async () => {
    const token = makeValidQrToken();
    vi.mocked(redis.get).mockResolvedValue(token);
    vi.mocked(prisma.courseEnrollment.findFirst).mockResolvedValue(null);

    await expect(
      checkInQr(USER_ID, { ...baseCheckinPayload, qrToken: token }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });

  it('throws CONFLICT when student already has PRESENT status', async () => {
    const token = makeValidQrToken();
    vi.mocked(redis.get).mockResolvedValue(token);
    vi.mocked(prisma.attendanceRecord.findUnique).mockResolvedValue(makeRecord('PRESENT') as never);

    await expect(
      checkInQr(USER_ID, { ...baseCheckinPayload, qrToken: token }),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
  });

  it('throws CONCURRENT_SESSION and creates AnomalyFlag when student is PRESENT elsewhere', async () => {
    const token = makeValidQrToken();
    vi.mocked(redis.get).mockResolvedValue(token);
    vi.mocked(prisma.attendanceRecord.findFirst).mockResolvedValue({
      id: 'a0000000-0000-4000-8000-000000000099',
      studentId: STUDENT_ID,
      sessionId: 'a0000000-0000-4000-8000-000000000088',
      status: 'PRESENT',
    } as never);

    await expect(
      checkInQr(USER_ID, { ...baseCheckinPayload, qrToken: token }),
    ).rejects.toMatchObject({ code: 'CONCURRENT_SESSION', statusCode: 400 });

    expect(createAnomalyFlag).toHaveBeenCalledWith(
      expect.objectContaining({ flagType: 'CONCURRENT_SESSION_CONFLICT' }),
      USER_ID,
    );
  });
});
