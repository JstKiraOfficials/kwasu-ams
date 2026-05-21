/**
 * @file attendance.routes.test.ts
 * @module modules/attendance/__tests__
 *
 * Integration tests for the attendance HTTP routes.
 *
 * Uses Fastify's `inject()` to fire requests against a real app instance with
 * all middleware (authenticate, requireRoles, error handler) active. Prisma,
 * Redis, and the anomaly service are mocked so no real infrastructure is needed.
 *
 * Real JWT tokens are generated via `signAccessToken` (same approach as other
 * route integration tests in this codebase) so the `authenticate` middleware
 * runs against a genuine token rather than a mock.
 *
 * All fixture IDs use proper RFC 4122 v4 UUIDs (version nibble = 4,
 * variant nibble ∈ {8,9,a,b}) to satisfy both Fastify JSON schema and
 * Zod v4 UUID validation.
 *
 * Test coverage:
 *
 * POST /attendance/checkin/gps
 * - 401 when no Authorization header
 * - 403 when role is LECTURER (not STUDENT)
 * - 400 when request body fails schema validation (missing sessionId)
 * - 400 when latitude is out of range
 * - 201 happy path — student inside geofence
 * - 400 SESSION_CLOSED — session not ACTIVE
 * - 400 OUTSIDE_GEOFENCE — student outside venue
 * - 400 CONCURRENT_SESSION — student already PRESENT elsewhere
 * - 403 FORBIDDEN — student not enrolled
 * - 409 CONFLICT — already checked in
 *
 * GET /attendance
 * - 401 when no Authorization header
 * - 200 happy path — returns paginated records
 * - 200 with courseSectionId filter
 * - 404 when student record not found
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks — declared before any module imports
// =============================================================================

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    student: { findUnique: vi.fn() },
    courseSession: { findUnique: vi.fn() },
    courseEnrollment: { findFirst: vi.fn() },
    attendanceRecord: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('../../../lib/redis.js', () => ({
  redis: {
    publish: vi.fn().mockResolvedValue(0),
    ping: vi.fn().mockResolvedValue('PONG'),
  },
  connectRedis: vi.fn(),
}));

// Mock BullMQ so the anomaly-detection queue import doesn't try to connect
vi.mock('bullmq', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Queue: vi.fn().mockImplementation(function (this: any) {
    this.add = vi.fn().mockResolvedValue({});
    this.on = vi.fn();
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Worker: vi.fn().mockImplementation(function (this: any) {
    this.on = vi.fn();
  }),
}));

vi.mock('../../anomalies/anomalies.service.js', () => ({
  createAnomalyFlag: vi.fn().mockResolvedValue({}),
}));

// Mock infrastructure plugins — no real Redis/Helmet/CORS/Swagger connections needed
vi.mock('../../../plugins/rate-limiter.js', () => ({
  default: async (app: { register: (fn: () => Promise<void>) => Promise<void> }) =>
    app.register(async () => {}),
}));
vi.mock('../../../plugins/cors.js', () => ({
  default: async (app: { register: (fn: () => Promise<void>) => Promise<void> }) =>
    app.register(async () => {}),
}));
vi.mock('../../../plugins/helmet.js', () => ({
  default: async (app: { register: (fn: () => Promise<void>) => Promise<void> }) =>
    app.register(async () => {}),
}));
vi.mock('../../../plugins/swagger.js', () => ({
  default: async (app: { register: (fn: () => Promise<void>) => Promise<void> }) =>
    app.register(async () => {}),
}));
vi.mock('../../../plugins/multipart.js', () => ({
  default: async (app: { register: (fn: () => Promise<void>) => Promise<void> }) =>
    app.register(async () => {}),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { createApp } from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { signAccessToken } from '../../../lib/jwt.js';
import { Role } from '@kwasu-ams/types';

// =============================================================================
// Fixtures — proper RFC 4122 v4 UUIDs: version nibble = 4, variant nibble ∈ {8,9,a,b}
// =============================================================================

const USER_ID = 'a0000000-0000-4000-8000-000000000001';
const STUDENT_ID = 'a0000000-0000-4000-8000-000000000002';
const SESSION_ID = 'a0000000-0000-4000-8000-000000000003';
const SECTION_ID = 'a0000000-0000-4000-8000-000000000004';
const ENROLLMENT_ID = 'a0000000-0000-4000-8000-000000000005';
const RECORD_ID = 'a0000000-0000-4000-8000-000000000006';

/** Venue centre — within Nigeria bounds. */
const VENUE_LAT = 8.6753;
const VENUE_LNG = 4.5228;

const STUDENT_DB = {
  id: USER_ID,
  role: 'STUDENT' as const,
  scopeId: null,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};

const LECTURER_DB = {
  id: USER_ID,
  role: 'LECTURER' as const,
  scopeId: null,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};

/**
 * Generates a signed JWT access token for the given user record.
 * Uses the real `signAccessToken` so the `authenticate` middleware
 * processes a genuine token rather than a mock.
 *
 * @param user - User record with id, role, and scopeId.
 * @returns A signed JWT string suitable for use as a Bearer token.
 */
function tokenFor(user: { id: string; role: Role | string; scopeId: string | null }): string {
  return signAccessToken({
    userId: user.id,
    role: user.role as Role,
    scopeId: user.scopeId,
    sessionId: 'sess-test',
  });
}

const makeStudent = () => ({
  id: STUDENT_ID,
  userId: USER_ID,
  user: { fullName: 'Test Student' },
});

const makeSession = (status = 'ACTIVE') => ({
  id: SESSION_ID,
  status,
  courseSectionId: SECTION_ID,
  venueId: 'a0000000-0000-4000-8000-000000000010',
  venue: {
    id: 'a0000000-0000-4000-8000-000000000010',
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
  checkInMethod: 'GPS_DIRECT',
  checkedInAt: new Date(),
  deviceRooted: false,
  spoofingFlagged: false,
});

/** Valid GPS check-in body — student at venue centre (inside geofence). */
const validGpsBody = {
  sessionId: SESSION_ID,
  latitude: VENUE_LAT,
  longitude: VENUE_LNG,
  deviceFingerprint: 'fp-test-123',
  mockLocationEnabled: false,
  deviceRooted: false,
};

// =============================================================================
// Shared setup
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// POST /attendance/checkin/gps
// =============================================================================

describe('POST /attendance/checkin/gps', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/attendance/checkin/gps',
      payload: validGpsBody,
    });
    await app.close();

    expect(response.statusCode).toBe(401);
  });

  it('returns 403 when the authenticated user has LECTURER role', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(LECTURER_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/attendance/checkin/gps',
      headers: { authorization: `Bearer ${tokenFor(LECTURER_DB)}` },
      payload: validGpsBody,
    });
    await app.close();

    expect(response.statusCode).toBe(403);
  });

  it('returns 400 when request body is missing required sessionId', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(STUDENT_DB as never);

    const { sessionId: _omitted, ...bodyWithoutSessionId } = validGpsBody;
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/attendance/checkin/gps',
      headers: { authorization: `Bearer ${tokenFor(STUDENT_DB)}` },
      payload: bodyWithoutSessionId,
    });
    await app.close();

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when latitude is out of range', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(STUDENT_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/attendance/checkin/gps',
      headers: { authorization: `Bearer ${tokenFor(STUDENT_DB)}` },
      payload: { ...validGpsBody, latitude: 200 },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
  });

  it('returns 201 with PRESENT status on a successful check-in', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(STUDENT_DB as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValue(makeStudent() as never);
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(makeSession() as never);
    vi.mocked(prisma.courseEnrollment.findFirst).mockResolvedValue(makeEnrollment() as never);
    vi.mocked(prisma.attendanceRecord.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.attendanceRecord.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.attendanceRecord.upsert).mockResolvedValue(makeRecord() as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/attendance/checkin/gps',
      headers: { authorization: `Bearer ${tokenFor(STUDENT_DB)}` },
      payload: validGpsBody,
    });
    await app.close();

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as { status: string };
    expect(body.status).toBe('PRESENT');
  });

  it('returns 400 SESSION_CLOSED when session is not ACTIVE', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(STUDENT_DB as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValue(makeStudent() as never);
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(makeSession('CLOSED') as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/attendance/checkin/gps',
      headers: { authorization: `Bearer ${tokenFor(STUDENT_DB)}` },
      payload: validGpsBody,
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { errors?: Array<{ code: string }>; code?: string };
    const code = body.errors?.[0]?.code ?? body.code;
    expect(code).toBe('SESSION_CLOSED');
  });

  it('returns 400 OUTSIDE_GEOFENCE when student is outside the venue', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(STUDENT_DB as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValue(makeStudent() as never);
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(makeSession() as never);
    vi.mocked(prisma.courseEnrollment.findFirst).mockResolvedValue(makeEnrollment() as never);
    vi.mocked(prisma.attendanceRecord.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.attendanceRecord.findFirst).mockResolvedValue(null);

    // Place student ~500m north of venue — clearly outside 50m radius
    const outsideLat = VENUE_LAT + Math.round((500 / 111_320) * 1_000_000) / 1_000_000;

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/attendance/checkin/gps',
      headers: { authorization: `Bearer ${tokenFor(STUDENT_DB)}` },
      payload: { ...validGpsBody, latitude: outsideLat },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { errors?: Array<{ code: string }>; code?: string };
    const code = body.errors?.[0]?.code ?? body.code;
    expect(code).toBe('OUTSIDE_GEOFENCE');
  });

  it('returns 400 CONCURRENT_SESSION when student is already PRESENT in another active session', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(STUDENT_DB as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValue(makeStudent() as never);
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(makeSession() as never);
    vi.mocked(prisma.courseEnrollment.findFirst).mockResolvedValue(makeEnrollment() as never);
    vi.mocked(prisma.attendanceRecord.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.attendanceRecord.findFirst).mockResolvedValue({
      id: 'a0000000-0000-4000-8000-000000000099',
      studentId: STUDENT_ID,
      sessionId: 'a0000000-0000-4000-8000-000000000088',
      status: 'PRESENT',
    } as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/attendance/checkin/gps',
      headers: { authorization: `Bearer ${tokenFor(STUDENT_DB)}` },
      payload: validGpsBody,
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { errors?: Array<{ code: string }>; code?: string };
    const code = body.errors?.[0]?.code ?? body.code;
    expect(code).toBe('CONCURRENT_SESSION');
  });

  it('returns 403 FORBIDDEN when student is not enrolled in the course', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(STUDENT_DB as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValue(makeStudent() as never);
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(makeSession() as never);
    vi.mocked(prisma.courseEnrollment.findFirst).mockResolvedValue(null);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/attendance/checkin/gps',
      headers: { authorization: `Bearer ${tokenFor(STUDENT_DB)}` },
      payload: validGpsBody,
    });
    await app.close();

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body) as { errors?: Array<{ code: string }>; code?: string };
    const code = body.errors?.[0]?.code ?? body.code;
    expect(code).toBe('FORBIDDEN');
  });

  it('returns 409 CONFLICT when student already has PRESENT status for this session', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(STUDENT_DB as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValue(makeStudent() as never);
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(makeSession() as never);
    vi.mocked(prisma.courseEnrollment.findFirst).mockResolvedValue(makeEnrollment() as never);
    vi.mocked(prisma.attendanceRecord.findUnique).mockResolvedValue(makeRecord('PRESENT') as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/attendance/checkin/gps',
      headers: { authorization: `Bearer ${tokenFor(STUDENT_DB)}` },
      payload: validGpsBody,
    });
    await app.close();

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body) as { errors?: Array<{ code: string }>; code?: string };
    const code = body.errors?.[0]?.code ?? body.code;
    expect(code).toBe('CONFLICT');
  });
});

// =============================================================================
// GET /attendance
// =============================================================================

describe('GET /attendance', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/attendance',
    });
    await app.close();

    expect(response.statusCode).toBe(401);
  });

  it('returns 200 with paginated records for the authenticated student', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(STUDENT_DB as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValue({ id: STUDENT_ID } as never);
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([makeRecord()] as never);
    vi.mocked(prisma.attendanceRecord.count).mockResolvedValue(1);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/attendance',
      headers: { authorization: `Bearer ${tokenFor(STUDENT_DB)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { data: unknown[]; meta: { total: number } };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.total).toBe(1);
  });

  it('returns 200 with filtered records when courseSectionId query param is provided', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(STUDENT_DB as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValue({ id: STUDENT_ID } as never);
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValue([makeRecord()] as never);
    vi.mocked(prisma.attendanceRecord.count).mockResolvedValue(1);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: `/attendance?courseSectionId=${SECTION_ID}`,
      headers: { authorization: `Bearer ${tokenFor(STUDENT_DB)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
  });

  it('returns 404 when no Student record is linked to the authenticated user', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(STUDENT_DB as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValue(null);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/attendance',
      headers: { authorization: `Bearer ${tokenFor(STUDENT_DB)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body) as { errors?: Array<{ code: string }>; code?: string };
    const code = body.errors?.[0]?.code ?? body.code;
    expect(code).toBe('NOT_FOUND');
  });
});
