/**
 * @file override.test.ts
 * @module modules/sessions/__tests__
 *
 * Integration tests for the manual override HTTP routes.
 *
 * Uses Fastify's `inject()` against a real app instance with all middleware
 * active. Prisma is mocked so no real database is needed. Real JWT tokens are
 * generated via `signAccessToken` so the `authenticate` middleware runs
 * against genuine tokens.
 *
 * All fixture IDs use proper RFC 4122 v4 UUIDs (version nibble = 4,
 * variant nibble ∈ {8,9,a,b}).
 *
 * Test coverage:
 *
 * PATCH /sessions/:id/attendance/:studentId/override
 * - 401 when no Authorization header
 * - 403 when role is STUDENT
 * - 400 when justification is shorter than 20 characters
 * - 400 SESSION_NOT_ACTIVE when session is ACTIVE
 * - 200 within window — AttendanceRecord updated, ManualOverride created
 * - 200 beyond window — ManualOverride created with requiresAdminApproval=true,
 *       AttendanceRecord NOT updated
 *
 * GET /sessions/:id/overrides
 * - 401 when no Authorization header
 * - 200 returns array of overrides for the session
 *
 * POST /overrides/:id/approve
 * - 401 when no Authorization header
 * - 403 when role is LECTURER
 * - 404 when override not found
 * - 409 when override does not require approval
 * - 409 when override already processed
 * - 200 happy path — AttendanceRecord updated, approvedById set
 *
 * POST /overrides/:id/reject
 * - 403 when role is LECTURER
 * - 404 when override not found
 * - 200 happy path — rejectedById and rejectionReason set
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks — declared before any module imports
// =============================================================================

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    courseSession: { findUnique: vi.fn() },
    attendanceRecord: { findUnique: vi.fn(), update: vi.fn() },
    manualOverride: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    lecturer: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../lib/redis.js', () => ({
  redis: {
    publish: vi.fn().mockResolvedValue(0),
    del: vi.fn().mockResolvedValue(0),
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
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
// Fixtures
// =============================================================================

const ACTOR_ID = 'a0000000-0000-4000-8000-000000000001';
const STUDENT_ID = 'a0000000-0000-4000-8000-000000000002';
const SESSION_ID = 'a0000000-0000-4000-8000-000000000003';
const RECORD_ID = 'a0000000-0000-4000-8000-000000000004';
const OVERRIDE_ID = 'a0000000-0000-4000-8000-000000000005';
const LECTURER_DB_ID = 'a0000000-0000-4000-8000-000000000006';

/** 48 hours in the future — within the override window. */
const FUTURE_WINDOW = new Date(Date.now() + 48 * 60 * 60 * 1000);
/** 1 millisecond in the past — beyond the override window. */
const EXPIRED_WINDOW = new Date(Date.now() - 1);

/** User record shape returned by `prisma.user.findUnique` in `authenticate`. */
const LECTURER_USER = {
  id: ACTOR_ID,
  role: 'LECTURER' as const,
  scopeId: null,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};

const SUPER_ADMIN_USER = {
  id: ACTOR_ID,
  role: 'SUPER_ADMIN' as const,
  scopeId: null,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};

const STUDENT_USER = {
  id: ACTOR_ID,
  role: 'STUDENT' as const,
  scopeId: null,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};

/**
 * Generates a signed JWT access token for the given user record.
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

const makeSession = (status = 'CLOSED', overrideWindowEnd: Date | null = FUTURE_WINDOW) => ({
  id: SESSION_ID,
  status,
  overrideWindowEnd,
  lecturerId: LECTURER_DB_ID,
  courseSectionId: 'a0000000-0000-4000-8000-000000000007',
  courseSection: {
    course: { departmentId: 'a0000000-0000-4000-8000-000000000099' },
  },
});

const makeRecord = (status = 'ABSENT') => ({
  id: RECORD_ID,
  studentId: STUDENT_ID,
  sessionId: SESSION_ID,
  status,
  checkInMethod: null,
});

const makeOverride = (overrides: Record<string, unknown> = {}) => ({
  id: OVERRIDE_ID,
  attendanceRecordId: RECORD_ID,
  actorId: ACTOR_ID,
  actorRole: 'LECTURER',
  justification: 'Student was present but GPS failed to register correctly.',
  beforeStatus: 'ABSENT',
  afterStatus: 'PRESENT',
  requiresAdminApproval: false,
  approvedById: null,
  approvedAt: null,
  rejectedById: null,
  rejectedAt: null,
  rejectionReason: null,
  createdAt: new Date(),
  ...overrides,
});

/** Valid override request body with a 20+ character justification. */
const validOverrideBody = {
  status: 'PRESENT',
  justification: 'Student was present but GPS failed to register correctly.',
};

// =============================================================================
// Shared setup
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
});

// =============================================================================
// PATCH /sessions/:id/attendance/:studentId/override
// =============================================================================

describe('PATCH /sessions/:id/attendance/:studentId/override', () => {
  const url = `/sessions/${SESSION_ID}/attendance/${STUDENT_ID}/override`;

  it('returns 401 when no Authorization header is provided', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'PATCH',
      url,
      payload: validOverrideBody,
    });
    await app.close();

    expect(response.statusCode).toBe(401);
  });

  it('returns 403 when the authenticated user has STUDENT role', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(STUDENT_USER as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'PATCH',
      url,
      headers: { authorization: `Bearer ${tokenFor(STUDENT_USER)}` },
      payload: validOverrideBody,
    });
    await app.close();

    expect(response.statusCode).toBe(403);
  });

  it('returns 400 when justification is shorter than 20 characters', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(LECTURER_USER as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'PATCH',
      url,
      headers: { authorization: `Bearer ${tokenFor(LECTURER_USER)}` },
      payload: { status: 'PRESENT', justification: 'Too short' },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 SESSION_NOT_ACTIVE when session is ACTIVE', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(LECTURER_USER as never);
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(makeSession('ACTIVE') as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'PATCH',
      url,
      headers: { authorization: `Bearer ${tokenFor(LECTURER_USER)}` },
      payload: validOverrideBody,
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body) as { errors?: Array<{ code: string }>; code?: string };
    const code = body.errors?.[0]?.code ?? body.code;
    expect(code).toBe('SESSION_NOT_ACTIVE');
  });

  it('returns 200 within window — AttendanceRecord updated immediately', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(LECTURER_USER as never);
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(
      makeSession('CLOSED', FUTURE_WINDOW) as never,
    );
    vi.mocked(prisma.attendanceRecord.findUnique).mockResolvedValue(makeRecord() as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([makeOverride()] as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'PATCH',
      url,
      headers: { authorization: `Bearer ${tokenFor(LECTURER_USER)}` },
      payload: validOverrideBody,
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { requiresAdminApproval: boolean };
    expect(body.requiresAdminApproval).toBe(false);
  });

  it('returns 200 beyond window — ManualOverride pending, AttendanceRecord NOT updated', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(LECTURER_USER as never);
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(
      makeSession('CLOSED', EXPIRED_WINDOW) as never,
    );
    vi.mocked(prisma.attendanceRecord.findUnique).mockResolvedValue(makeRecord() as never);
    vi.mocked(prisma.manualOverride.create).mockResolvedValue(
      makeOverride({ requiresAdminApproval: true }) as never,
    );

    const app = await createApp();
    const response = await app.inject({
      method: 'PATCH',
      url,
      headers: { authorization: `Bearer ${tokenFor(LECTURER_USER)}` },
      payload: validOverrideBody,
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { requiresAdminApproval: boolean };
    expect(body.requiresAdminApproval).toBe(true);
    // AttendanceRecord.update must NOT have been called
    expect(prisma.attendanceRecord.update).not.toHaveBeenCalled();
  });
});

// =============================================================================
// GET /sessions/:id/overrides
// =============================================================================

describe('GET /sessions/:id/overrides', () => {
  const url = `/sessions/${SESSION_ID}/overrides`;

  it('returns 401 when no Authorization header is provided', async () => {
    const app = await createApp();
    const response = await app.inject({ method: 'GET', url });
    await app.close();

    expect(response.statusCode).toBe(401);
  });

  it('returns 200 with an array of overrides for the session', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(SUPER_ADMIN_USER as never);
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValue(makeSession() as never);
    vi.mocked(prisma.manualOverride.findMany).mockResolvedValue([makeOverride()] as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_USER)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as unknown[];
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
  });
});

// =============================================================================
// POST /overrides/:id/approve
// =============================================================================

describe('POST /overrides/:id/approve', () => {
  const url = `/overrides/${OVERRIDE_ID}/approve`;

  it('returns 401 when no Authorization header is provided', async () => {
    const app = await createApp();
    const response = await app.inject({ method: 'POST', url });
    await app.close();

    expect(response.statusCode).toBe(401);
  });

  it('returns 403 when the authenticated user has LECTURER role', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(LECTURER_USER as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${tokenFor(LECTURER_USER)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(403);
  });

  it('returns 404 when override does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(SUPER_ADMIN_USER as never);
    vi.mocked(prisma.manualOverride.findUnique).mockResolvedValue(null);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_USER)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(404);
  });

  it('returns 409 when override does not require admin approval', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(SUPER_ADMIN_USER as never);
    vi.mocked(prisma.manualOverride.findUnique).mockResolvedValue(
      makeOverride({ requiresAdminApproval: false }) as never,
    );

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_USER)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body) as { errors?: Array<{ code: string }>; code?: string };
    const code = body.errors?.[0]?.code ?? body.code;
    expect(code).toBe('CONFLICT');
  });

  it('returns 409 when override is already approved', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(SUPER_ADMIN_USER as never);
    vi.mocked(prisma.manualOverride.findUnique).mockResolvedValue(
      makeOverride({
        requiresAdminApproval: true,
        approvedById: ACTOR_ID,
        approvedAt: new Date(),
      }) as never,
    );

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_USER)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(409);
  });

  it('returns 200 and updates AttendanceRecord on successful approval', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(SUPER_ADMIN_USER as never);
    vi.mocked(prisma.manualOverride.findUnique).mockResolvedValue(
      makeOverride({
        requiresAdminApproval: true,
        attendanceRecord: makeRecord(),
      }) as never,
    );
    vi.mocked(prisma.$transaction).mockResolvedValue([
      makeOverride({ requiresAdminApproval: true, approvedById: ACTOR_ID, approvedAt: new Date() }),
      makeRecord('PRESENT'),
    ] as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_USER)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { approvedById: string };
    expect(body.approvedById).toBe(ACTOR_ID);
  });
});

// =============================================================================
// POST /overrides/:id/reject
// =============================================================================

describe('POST /overrides/:id/reject', () => {
  const url = `/overrides/${OVERRIDE_ID}/reject`;

  it('returns 403 when the authenticated user has LECTURER role', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(LECTURER_USER as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${tokenFor(LECTURER_USER)}` },
      payload: { reason: 'Not valid' },
    });
    await app.close();

    expect(response.statusCode).toBe(403);
  });

  it('returns 404 when override does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(SUPER_ADMIN_USER as never);
    vi.mocked(prisma.manualOverride.findUnique).mockResolvedValue(null);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_USER)}` },
      payload: { reason: 'Not valid' },
    });
    await app.close();

    expect(response.statusCode).toBe(404);
  });

  it('returns 200 and sets rejectedById and rejectionReason', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(SUPER_ADMIN_USER as never);
    vi.mocked(prisma.manualOverride.findUnique).mockResolvedValue(
      makeOverride({ requiresAdminApproval: true }) as never,
    );
    vi.mocked(prisma.manualOverride.update).mockResolvedValue(
      makeOverride({
        requiresAdminApproval: true,
        rejectedById: ACTOR_ID,
        rejectedAt: new Date(),
        rejectionReason: 'Not valid',
      }) as never,
    );

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_USER)}` },
      payload: { reason: 'Not valid' },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      rejectedById: string;
      rejectionReason: string;
    };
    expect(body.rejectedById).toBe(ACTOR_ID);
    expect(body.rejectionReason).toBe('Not valid');
  });
});
