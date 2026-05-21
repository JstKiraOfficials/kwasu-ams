/**
 * @file anomalies.routes.test.ts
 * @module modules/anomalies/__tests__
 *
 * Integration tests for the anomaly flags HTTP routes.
 *
 * Uses Fastify's `inject()` method against the full app instance.
 * All external dependencies (Prisma, Redis, S3, plugins) are mocked.
 *
 * Coverage targets:
 * - GET /anomalies with LECTURER: scoped to own sessions
 * - PATCH /anomalies/:id/review with CONFIRMED_PRESENT: updates attendance record
 * - PATCH /anomalies/:id/review on already-reviewed flag: 409
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../../../app.js';
import { signAccessToken } from '../../../lib/jwt.js';
import { Role } from '@kwasu-ams/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    anomalyFlag: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    attendanceRecord: { updateMany: vi.fn() },
    deviceBinding: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    timetableEntry: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    courseSection: { findUnique: vi.fn() },
    student: { findUnique: vi.fn() },
    lecturer: { findUnique: vi.fn() },
    venue: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    course: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
    },
    courseEnrollment: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    courseSession: { count: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../lib/redis.js', () => ({
  redis: {
    ping: vi.fn().mockResolvedValue('PONG'),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    del: vi.fn(),
  },
  connectRedis: vi.fn(),
}));
vi.mock('../../../lib/argon2.js', () => ({ verifyPassword: vi.fn(), hashPassword: vi.fn() }));
vi.mock('../../../lib/s3.js', () => ({ uploadToS3: vi.fn(), s3Client: { send: vi.fn() } }));
vi.mock('../../../lib/email-client.js', () => ({ sendEmail: vi.fn() }));
vi.mock('../../auth/totp.service.js', () => ({ adminResetTotp: vi.fn() }));
vi.mock('../../../plugins/cors.js', () => ({
  default: async (app: { register: (fn: () => Promise<void>) => Promise<void> }) =>
    app.register(async () => {}),
}));
vi.mock('../../../plugins/helmet.js', () => ({
  default: async (app: { register: (fn: () => Promise<void>) => Promise<void> }) =>
    app.register(async () => {}),
}));
vi.mock('../../../plugins/rate-limiter.js', () => ({
  default: async (app: { register: (fn: () => Promise<void>) => Promise<void> }) =>
    app.register(async () => {}),
}));
vi.mock('../../../plugins/swagger.js', () => ({
  default: async (app: { register: (fn: () => Promise<void>) => Promise<void> }) =>
    app.register(async () => {}),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const LECTURER_USER_ID = 'a0000000-0000-4000-8000-000000000001';
const STUDENT_ID = 'a0000000-0000-4000-8000-000000000010';
const SESSION_ID = 'a0000000-0000-4000-8000-000000000020';
const FLAG_ID = 'a0000000-0000-4000-8000-000000000030';

const LECTURER_DB = {
  id: LECTURER_USER_ID,
  role: 'LECTURER',
  scopeId: null,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};

const FLAG_RECORD = {
  id: FLAG_ID,
  studentId: STUDENT_ID,
  sessionId: SESSION_ID,
  flagType: 'MOCK_LOCATION_DETECTED',
  description: 'Mock location detected during check-in.',
  isReviewed: false,
  reviewedById: null,
  reviewedAt: null,
  reviewAction: null,
  reviewNote: null,
  createdAt: new Date(),
  student: { matricNumber: '22/47CSC/00001', user: { fullName: 'Test Student' } },
};

function tokenFor(user: { id: string; role: string; scopeId: string | null }): string {
  return signAccessToken({
    userId: user.id,
    role: user.role as Role,
    scopeId: user.scopeId,
    sessionId: 'sess-test',
  });
}

// =============================================================================
// GET /anomalies — scope enforcement
// =============================================================================

describe('GET /anomalies', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 200 and applies lecturer scope filter', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(LECTURER_DB as never);
    vi.mocked(prisma.anomalyFlag.findMany).mockResolvedValueOnce([FLAG_RECORD] as never);
    vi.mocked(prisma.anomalyFlag.count).mockResolvedValueOnce(1);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/anomalies',
      headers: { authorization: `Bearer ${tokenFor(LECTURER_DB)}` },
    });

    expect(response.statusCode).toBe(200);
    // Verify lecturer scope filter was applied
    expect(prisma.anomalyFlag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          student: {
            enrollments: {
              some: {
                courseSection: {
                  lecturerId: LECTURER_USER_ID,
                },
              },
            },
          },
        }),
      }),
    );
    await app.close();
  });

  it('returns 401 when no token provided', async () => {
    const app = await createApp();
    const response = await app.inject({ method: 'GET', url: '/anomalies' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});

// =============================================================================
// PATCH /anomalies/:id/review
// =============================================================================

describe('PATCH /anomalies/:id/review', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 200 and updates attendance record for CONFIRMED_PRESENT', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(LECTURER_DB as never);
    vi.mocked(prisma.anomalyFlag.findUnique).mockResolvedValueOnce({
      id: FLAG_ID,
      isReviewed: false,
      studentId: STUDENT_ID,
      sessionId: SESSION_ID,
      flagType: 'MOCK_LOCATION_DETECTED',
    } as never);
    vi.mocked(prisma.anomalyFlag.update).mockResolvedValueOnce({
      ...FLAG_RECORD,
      isReviewed: true,
      reviewAction: 'CONFIRMED_PRESENT',
      reviewNote: 'Student was present',
    } as never);
    vi.mocked(prisma.attendanceRecord.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/anomalies/${FLAG_ID}/review`,
      headers: { authorization: `Bearer ${tokenFor(LECTURER_DB)}` },
      payload: { action: 'CONFIRMED_PRESENT', note: 'Student was present' },
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.attendanceRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: STUDENT_ID, sessionId: SESSION_ID },
        data: { status: 'PRESENT' },
      }),
    );
    await app.close();
  });

  it('returns 409 when flag has already been reviewed', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(LECTURER_DB as never);
    vi.mocked(prisma.anomalyFlag.findUnique).mockResolvedValueOnce({
      id: FLAG_ID,
      isReviewed: true,
      studentId: STUDENT_ID,
      sessionId: SESSION_ID,
      flagType: 'MOCK_LOCATION_DETECTED',
    } as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/anomalies/${FLAG_ID}/review`,
      headers: { authorization: `Bearer ${tokenFor(LECTURER_DB)}` },
      payload: { action: 'CONFIRMED_ABSENT', note: 'Student was absent' },
    });

    expect(response.statusCode).toBe(409);
    await app.close();
  });
});
