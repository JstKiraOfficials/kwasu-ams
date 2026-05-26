/**
 * @file welfare.routes.test.ts
 * @module modules/welfare/__tests__
 *
 * Integration tests for the welfare HTTP routes.
 *
 * Test coverage:
 * - POST /welfare/check/:studentId with HOD: needsReferral=true when 3+ courses below 70%
 * - POST /welfare/check/:studentId with HOD: needsReferral=false when only 2 courses below 70%
 * - POST /welfare/check/:studentId with STUDENT: 403
 * - GET /welfare with SUPER_ADMIN: 200
 * - GET /welfare with STUDENT: 403
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    student: { findUnique: vi.fn() },
    examEligibility: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn(), create: vi.fn() },
    semester: { findFirst: vi.fn() },
  },
}));

vi.mock('../../../lib/redis.js', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    ping: vi.fn().mockResolvedValue('PONG'),
  },
  connectRedis: vi.fn(),
}));

vi.mock('../../../jobs/queue.js', () => ({
  notificationQueue: { add: vi.fn().mockResolvedValue({ id: 'notif-1' }) },
  auditLogQueue: { add: vi.fn() },
  anomalyDetectionQueue: { add: vi.fn() },
  eligibilityComputationQueue: { add: vi.fn() },
  earlyInterventionQueue: { add: vi.fn() },
  accountabilityQueue: { add: vi.fn() },
  welfareCheckQueue: { add: vi.fn() },
  weeklySummaryQueue: { add: vi.fn() },
  semesterReportsQueue: { add: vi.fn() },
  classRegisterQueue: { add: vi.fn() },
  reportCardQueue: { add: vi.fn() },
  bulkAccountQueue: { add: vi.fn() },
  smartConflictQueue: {},
  heatmapRefreshQueue: {},
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

import { createApp } from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';
import { signAccessToken } from '../../../lib/jwt.js';
import { Role } from '@kwasu-ams/types';

const USER_ID = 'a0000000-0000-4000-8000-000000000001';
const STUDENT_ID = 'a0000000-0000-4000-8000-000000000002';
const SEMESTER_ID = 'a0000000-0000-4000-8000-000000000003';

const HOD_DB = {
  id: USER_ID,
  role: 'HOD' as const,
  scopeId: null,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};
const STUDENT_DB = {
  id: USER_ID,
  role: 'STUDENT' as const,
  scopeId: null,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};
const ADMIN_DB = {
  id: USER_ID,
  role: 'SUPER_ADMIN' as const,
  scopeId: null,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};

/**
 * Generates a signed JWT for the given user.
 *
 * @param user - User record with id, role, and scopeId.
 * @returns Signed JWT string.
 */
function tokenFor(user: { id: string; role: Role | string; scopeId: string | null }): string {
  return signAccessToken({
    userId: user.id,
    role: user.role as Role,
    scopeId: user.scopeId,
    sessionId: 'test',
  });
}

const makeEligibility = (courseCode: string) => ({
  id: `elig-${courseCode}`,
  studentId: STUDENT_ID,
  effectivePercentage: 60,
  enrollment: {
    courseSection: { course: { code: courseCode } },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
  vi.mocked(prisma.semester.findFirst).mockResolvedValue({ id: SEMESTER_ID } as never);
  vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
});

describe('POST /welfare/check/:studentId', () => {
  it('returns needsReferral=true when student has 3+ courses below 70%', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(HOD_DB as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValue({
      id: STUDENT_ID,
      user: { id: 'u-student-1', fullName: 'Test Student' },
      programme: { departmentId: 'dept-1' },
    } as never);
    vi.mocked(prisma.examEligibility.findMany).mockResolvedValue([
      makeEligibility('BIO201'),
      makeEligibility('BIO202'),
      makeEligibility('BIO203'),
    ] as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: `/welfare/check/${STUDENT_ID}?semesterId=${SEMESTER_ID}`,
      headers: { authorization: `Bearer ${tokenFor(HOD_DB)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { needsReferral: boolean; coursesBelow70: string[] };
    expect(body.needsReferral).toBe(true);
    expect(body.coursesBelow70).toHaveLength(3);
  });

  it('returns needsReferral=false when student has only 2 courses below 70%', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(HOD_DB as never);
    vi.mocked(prisma.student.findUnique).mockResolvedValue({ id: STUDENT_ID } as never);
    vi.mocked(prisma.examEligibility.findMany).mockResolvedValue([
      makeEligibility('BIO201'),
      makeEligibility('BIO202'),
    ] as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: `/welfare/check/${STUDENT_ID}?semesterId=${SEMESTER_ID}`,
      headers: { authorization: `Bearer ${tokenFor(HOD_DB)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { needsReferral: boolean };
    expect(body.needsReferral).toBe(false);
  });

  it('returns 403 when STUDENT tries to check welfare', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(STUDENT_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: `/welfare/check/${STUDENT_ID}`,
      headers: { authorization: `Bearer ${tokenFor(STUDENT_DB)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(403);
  });
});

describe('GET /welfare', () => {
  it('returns 200 for SUPER_ADMIN', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(ADMIN_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/welfare',
      headers: { authorization: `Bearer ${tokenFor(ADMIN_DB)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
  });

  it('returns 403 for STUDENT', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(STUDENT_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/welfare',
      headers: { authorization: `Bearer ${tokenFor(STUDENT_DB)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(403);
  });
});
