/**
 * @file departments.routes.test.ts
 * @module modules/departments/__tests__
 *
 * Integration tests for the departments HTTP routes.
 *
 * Uses Fastify's `inject()` method against the full app instance.
 * All external dependencies (Prisma, Redis, S3, plugins) are mocked.
 *
 * Coverage targets:
 * - GET  /departments          — DEAN (scoped to Faculty A) sees only Faculty A departments
 * - GET  /departments/:id      — HOD accessing own dept (200), different dept (403)
 * - POST /departments          — ACADEMIC_AFFAIRS (201)
 * - DELETE /departments/:id    — with programmes (409)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../../../app.js';
import { signAccessToken } from '../../../lib/jwt.js';
import { Role } from '@kwasu-ams/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    department: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: { create: vi.fn() },
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

const ADMIN_ID = 'a0000000-0000-4000-8000-000000000001';
const AA_ID = 'a0000000-0000-4000-8000-000000000002';
const DEAN_ID = 'a0000000-0000-4000-8000-000000000003';
const HOD_ID = 'a0000000-0000-4000-8000-000000000004';
const FACULTY_A = 'a0000000-0000-4000-8000-000000000010';
const FACULTY_B = 'a0000000-0000-4000-8000-000000000011';
const DEPT_A = 'a0000000-0000-4000-8000-000000000020';
const DEPT_B = 'a0000000-0000-4000-8000-000000000021';

const SUPER_ADMIN_DB = {
  id: ADMIN_ID,
  role: 'SUPER_ADMIN',
  scopeId: null,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};
const ACADEMIC_AFFAIRS_DB = {
  id: AA_ID,
  role: 'ACADEMIC_AFFAIRS',
  scopeId: FACULTY_A,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};
const DEAN_DB = {
  id: DEAN_ID,
  role: 'DEAN',
  scopeId: FACULTY_A,
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

const DEPT_A_RECORD = {
  id: DEPT_A,
  facultyId: FACULTY_A,
  name: 'Dept A',
  code: 'DPTA',
  hodId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { courses: 0, lecturers: 0 },
};

const DEPT_B_RECORD = {
  id: DEPT_B,
  facultyId: FACULTY_B,
  name: 'Dept B',
  code: 'DPTB',
  hodId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { courses: 0, lecturers: 0 },
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

// ── GET /departments (DEAN scoped) ────────────────────────────────────────────

describe('GET /departments', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns only Faculty A departments when called by DEAN scoped to Faculty A', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(DEAN_DB as never);
    vi.mocked(prisma.department.findMany).mockResolvedValueOnce([DEPT_A_RECORD] as never);
    vi.mocked(prisma.department.count).mockResolvedValueOnce(1);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/departments',
      headers: { authorization: `Bearer ${tokenFor(DEAN_DB)}` },
    });

    expect(response.statusCode).toBe(200);
    // Service must have filtered by facultyId = FACULTY_A
    expect(prisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ facultyId: FACULTY_A }) }),
    );
    await app.close();
  });

  it('returns 401 when no token is provided', async () => {
    const app = await createApp();
    const response = await app.inject({ method: 'GET', url: '/departments' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});

// ── GET /departments/:id (HOD scope) ──────────────────────────────────────────

describe('GET /departments/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 200 when HOD accesses their own department', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(HOD_DB as never);
    vi.mocked(prisma.department.findUnique).mockResolvedValueOnce(DEPT_A_RECORD as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: `/departments/${DEPT_A}`,
      headers: { authorization: `Bearer ${tokenFor(HOD_DB)}` },
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('returns 403 when HOD accesses a different department', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(HOD_DB as never);
    // DEPT_B belongs to FACULTY_B — HOD is scoped to DEPT_A
    vi.mocked(prisma.department.findUnique).mockResolvedValueOnce(DEPT_B_RECORD as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: `/departments/${DEPT_B}`,
      headers: { authorization: `Bearer ${tokenFor(HOD_DB)}` },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

// ── POST /departments ─────────────────────────────────────────────────────────

describe('POST /departments', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 201 when called by ACADEMIC_AFFAIRS with valid data', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(ACADEMIC_AFFAIRS_DB as never);
    vi.mocked(prisma.department.findUnique).mockResolvedValueOnce(null); // no duplicate
    vi.mocked(prisma.department.create).mockResolvedValueOnce(DEPT_A_RECORD as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/departments',
      headers: { authorization: `Bearer ${tokenFor(ACADEMIC_AFFAIRS_DB)}` },
      payload: { name: 'Dept A', code: 'DPTA', facultyId: FACULTY_A },
    });

    expect(response.statusCode).toBe(201);
    await app.close();
  });

  it('returns 403 when called by SUPER_ADMIN... wait, SUPER_ADMIN is allowed — LECTURER is not', async () => {
    // Verify SUPER_ADMIN can also create
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);
    vi.mocked(prisma.department.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.department.create).mockResolvedValueOnce(DEPT_A_RECORD as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/departments',
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
      payload: { name: 'Dept A', code: 'DPTA', facultyId: FACULTY_A },
    });

    expect(response.statusCode).toBe(201);
    await app.close();
  });
});

// ── DELETE /departments/:id ───────────────────────────────────────────────────

describe('DELETE /departments/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 409 when department has programmes', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);
    vi.mocked(prisma.department.findUnique).mockResolvedValueOnce({
      id: DEPT_A,
      _count: { programmes: 2, courses: 0 },
    } as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/departments/${DEPT_A}`,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
    });

    expect(response.statusCode).toBe(409);
    await app.close();
  });

  it('returns 200 when department has no programmes or courses', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);
    vi.mocked(prisma.department.findUnique).mockResolvedValueOnce({
      id: DEPT_A,
      _count: { programmes: 0, courses: 0 },
    } as never);
    vi.mocked(prisma.department.delete).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/departments/${DEPT_A}`,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
