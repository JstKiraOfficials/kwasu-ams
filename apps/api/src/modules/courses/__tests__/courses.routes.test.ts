/**
 * @file courses.routes.test.ts
 * @module modules/courses/__tests__
 *
 * Integration tests for the courses HTTP routes.
 *
 * Uses Fastify's `inject()` method against the full app instance.
 * All external dependencies (Prisma, Redis, S3, plugins) are mocked.
 *
 * Coverage targets:
 * - GET  /courses                                    — LECTURER scoped, HOD scoped, 401
 * - POST /courses                                    — LECTURER forbidden (403), SUPER_ADMIN success (201)
 * - POST /courses/:id/sections/:sectionId/enroll     — HOD success (200)
 * - PATCH /courses/:id/sections/:sectionId/lecturer  — cross-dept forbidden (403), same-dept success (200)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../../../app.js';
import { signAccessToken } from '../../../lib/jwt.js';
import { Role } from '@kwasu-ams/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    course: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    courseSection: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    courseEnrollment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    courseSession: {
      count: vi.fn(),
    },
    student: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    lecturer: {
      findUnique: vi.fn(),
    },
    department: {
      findUnique: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../lib/redis.js', () => ({
  workerRedis: { on: vi.fn() },
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

const ADMIN_ID = 'a0000000-0000-4000-8000-000000000001';
const LECTURER_USER_ID = 'a0000000-0000-4000-8000-000000000002';
const HOD_ID = 'a0000000-0000-4000-8000-000000000003';
const DEPT_A = 'a0000000-0000-4000-8000-000000000010';
const COURSE_ID = 'a0000000-0000-4000-8000-000000000030';
const SECTION_ID = 'a0000000-0000-4000-8000-000000000040';
const SEMESTER_ID = 'a0000000-0000-4000-8000-000000000050';
const LECTURER_ID = 'a0000000-0000-4000-8000-000000000060';
const STUDENT_ID_1 = 'a0000000-0000-4000-8000-000000000071';
const STUDENT_ID_2 = 'a0000000-0000-4000-8000-000000000072';

const SUPER_ADMIN_DB = {
  id: ADMIN_ID,
  role: 'SUPER_ADMIN',
  scopeId: null,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};

const LECTURER_DB = {
  id: LECTURER_USER_ID,
  role: 'LECTURER',
  scopeId: DEPT_A,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};

const HOD_DB = {
  id: HOD_ID,
  role: 'HOD',
  scopeId: DEPT_A,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};

const COURSE_RECORD = {
  id: COURSE_ID,
  departmentId: DEPT_A,
  code: 'BIO201',
  title: 'General Biology II',
  creditUnits: 3,
  level: 200,
  isElective: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { sections: 0 },
};

const SECTION_RECORD = {
  id: SECTION_ID,
  courseId: COURSE_ID,
  semesterId: SEMESTER_ID,
  sectionLabel: 'A',
  lecturerId: null,
  maxEnrollment: 200,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** Generates a signed access token for the given user fixture. */
function tokenFor(user: { id: string; role: string; scopeId: string | null }): string {
  return signAccessToken({
    userId: user.id,
    role: user.role as Role,
    scopeId: user.scopeId,
    sessionId: 'sess-test',
  });
}

// =============================================================================
// GET /courses — scope enforcement
// =============================================================================

describe('GET /courses', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 401 when no token is provided', async () => {
    const app = await createApp();
    const response = await app.inject({ method: 'GET', url: '/courses' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns 200 and filters by lecturer sections when called by LECTURER', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(LECTURER_DB as never);
    vi.mocked(prisma.course.findMany).mockResolvedValueOnce([COURSE_RECORD] as never);
    vi.mocked(prisma.course.count).mockResolvedValueOnce(1);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/courses',
      headers: { authorization: `Bearer ${tokenFor(LECTURER_DB)}` },
    });

    expect(response.statusCode).toBe(200);
    // Service must have applied a sections filter for the lecturer
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ sections: expect.any(Object) }),
      }),
    );
    await app.close();
  });

  it('returns 200 and filters by departmentId when called by HOD', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(HOD_DB as never);
    vi.mocked(prisma.course.findMany).mockResolvedValueOnce([COURSE_RECORD] as never);
    vi.mocked(prisma.course.count).mockResolvedValueOnce(1);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/courses',
      headers: { authorization: `Bearer ${tokenFor(HOD_DB)}` },
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ departmentId: DEPT_A }),
      }),
    );
    await app.close();
  });
});

// =============================================================================
// POST /courses — role enforcement
// =============================================================================

describe('POST /courses', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 403 when called by LECTURER', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(LECTURER_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/courses',
      headers: { authorization: `Bearer ${tokenFor(LECTURER_DB)}` },
      payload: {
        departmentId: DEPT_A,
        code: 'BIO201',
        title: 'General Biology II',
        creditUnits: 3,
        level: 200,
        isElective: false,
      },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('returns 201 when called by SUPER_ADMIN with valid data', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);
    vi.mocked(prisma.course.findUnique).mockResolvedValueOnce(null); // no duplicate
    vi.mocked(prisma.course.create).mockResolvedValueOnce(COURSE_RECORD as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/courses',
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
      payload: {
        departmentId: DEPT_A,
        code: 'BIO201',
        title: 'General Biology II',
        creditUnits: 3,
        level: 200,
        isElective: false,
      },
    });

    expect(response.statusCode).toBe(201);
    await app.close();
  });

  it('returns 400 when level is invalid', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/courses',
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
      payload: {
        departmentId: DEPT_A,
        code: 'BIO201',
        title: 'General Biology II',
        creditUnits: 3,
        level: 150, // invalid
        isElective: false,
      },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

// =============================================================================
// POST /courses/:id/sections/:sectionId/enroll — HOD success
// =============================================================================

describe('POST /courses/:id/sections/:sectionId/enroll', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 200 when called by HOD with valid student IDs', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(HOD_DB as never);
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce({
      id: SECTION_ID,
      maxEnrollment: 200,
      courseId: COURSE_ID,
    } as never);
    vi.mocked(prisma.courseEnrollment.count).mockResolvedValueOnce(0);
    vi.mocked(prisma.student.findMany).mockResolvedValueOnce([
      { id: STUDENT_ID_1 },
      { id: STUDENT_ID_2 },
    ] as never);

    vi.mocked(prisma.$transaction).mockImplementationOnce((async (fn: unknown) => {
      const txMock = {
        courseEnrollment: {
          count: vi.fn().mockResolvedValue(0),
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({}),
        },
        student: { updateMany: vi.fn() },
      };
      await (fn as (tx: typeof txMock) => Promise<void>)(txMock);
    }) as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: `/courses/${COURSE_ID}/sections/${SECTION_ID}/enroll`,
      headers: { authorization: `Bearer ${tokenFor(HOD_DB)}` },
      payload: { studentIds: [STUDENT_ID_1, STUDENT_ID_2], isCarryOver: false },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ enrolled: number; skipped: number }>();
    expect(body.enrolled).toBe(2);
    expect(body.skipped).toBe(0);
    await app.close();
  });

  it('returns 403 when called by LECTURER', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(LECTURER_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: `/courses/${COURSE_ID}/sections/${SECTION_ID}/enroll`,
      headers: { authorization: `Bearer ${tokenFor(LECTURER_DB)}` },
      payload: { studentIds: [STUDENT_ID_1], isCarryOver: false },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

// =============================================================================
// PATCH /courses/:id/sections/:sectionId/lecturer — department enforcement
// =============================================================================

describe('PATCH /courses/:id/sections/:sectionId/lecturer', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 403 when lecturer is from a different department (HOD actor)', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(HOD_DB as never);
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce({
      id: SECTION_ID,
      course: { departmentId: DEPT_A },
    } as never);
    vi.mocked(prisma.lecturer.findUnique).mockResolvedValueOnce({
      id: LECTURER_ID,
      departmentId: 'different-dept-id',
    } as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/courses/${COURSE_ID}/sections/${SECTION_ID}/lecturer`,
      headers: { authorization: `Bearer ${tokenFor(HOD_DB)}` },
      payload: { lecturerId: LECTURER_ID },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('returns 200 when lecturer is from the same department (HOD actor)', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(HOD_DB as never);
    vi.mocked(prisma.courseSection.findUnique).mockResolvedValueOnce({
      id: SECTION_ID,
      course: { departmentId: DEPT_A },
    } as never);
    vi.mocked(prisma.lecturer.findUnique).mockResolvedValueOnce({
      id: LECTURER_ID,
      departmentId: DEPT_A, // same department
    } as never);
    vi.mocked(prisma.courseSection.update).mockResolvedValueOnce({
      ...SECTION_RECORD,
      lecturerId: LECTURER_ID,
    } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/courses/${COURSE_ID}/sections/${SECTION_ID}/lecturer`,
      headers: { authorization: `Bearer ${tokenFor(HOD_DB)}` },
      payload: { lecturerId: LECTURER_ID },
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
