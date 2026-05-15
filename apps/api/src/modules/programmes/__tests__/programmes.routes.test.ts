/**
 * @file programmes.routes.test.ts
 * @module modules/programmes/__tests__
 *
 * Integration tests for the programmes HTTP routes.
 *
 * Uses Fastify's `inject()` method against the full app instance.
 * All external dependencies (Prisma, Redis, S3, plugins) are mocked.
 *
 * Coverage targets:
 * - GET  /programmes          — SUPER_ADMIN (200 paginated), STUDENT (200)
 * - POST /programmes          — SUPER_ADMIN (201), LECTURER (403), duplicate code (409)
 * - DELETE /programmes/:id    — with enrolled students (409), without (200)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../../../app.js';
import { signAccessToken } from '../../../lib/jwt.js';
import { Role } from '@kwasu-ams/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    programme: {
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
const LECTURER_ID = 'a0000000-0000-4000-8000-000000000002';
const STUDENT_ID = 'a0000000-0000-4000-8000-000000000003';
const DEPT_ID = 'a0000000-0000-4000-8000-000000000010';
const PROG_ID = 'a0000000-0000-4000-8000-000000000020';

const SUPER_ADMIN_DB = {
  id: ADMIN_ID,
  role: 'SUPER_ADMIN',
  scopeId: null,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};
const LECTURER_DB = {
  id: LECTURER_ID,
  role: 'LECTURER',
  scopeId: DEPT_ID,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};
const STUDENT_DB = {
  id: STUDENT_ID,
  role: 'STUDENT',
  scopeId: null,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};

const PROGRAMME = {
  id: PROG_ID,
  departmentId: DEPT_ID,
  name: 'B.Sc. Biology',
  code: 'BSC-BIO',
  durationYears: 4,
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

// ── GET /programmes ───────────────────────────────────────────────────────────

describe('GET /programmes', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 200 with paginated programmes for SUPER_ADMIN', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);
    vi.mocked(prisma.programme.findMany).mockResolvedValueOnce([PROGRAMME] as never);
    vi.mocked(prisma.programme.count).mockResolvedValueOnce(1);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/programmes',
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('returns 200 for STUDENT (students can read programmes)', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(STUDENT_DB as never);
    vi.mocked(prisma.programme.findMany).mockResolvedValueOnce([PROGRAMME] as never);
    vi.mocked(prisma.programme.count).mockResolvedValueOnce(1);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/programmes',
      headers: { authorization: `Bearer ${tokenFor(STUDENT_DB)}` },
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('returns 401 when no token is provided', async () => {
    const app = await createApp();
    const response = await app.inject({ method: 'GET', url: '/programmes' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});

// ── POST /programmes ──────────────────────────────────────────────────────────

describe('POST /programmes', () => {
  beforeEach(() => vi.resetAllMocks());

  const VALID_PAYLOAD = {
    name: 'B.Sc. Biology',
    code: 'BSC-BIO',
    departmentId: DEPT_ID,
    durationYears: 4,
  };

  it('returns 201 when called by SUPER_ADMIN with valid data', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);
    vi.mocked(prisma.programme.findUnique).mockResolvedValueOnce(null); // no duplicate
    vi.mocked(prisma.programme.create).mockResolvedValueOnce(PROGRAMME as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/programmes',
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
      payload: VALID_PAYLOAD,
    });

    expect(response.statusCode).toBe(201);
    await app.close();
  });

  it('returns 403 when called by a LECTURER', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(LECTURER_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/programmes',
      headers: { authorization: `Bearer ${tokenFor(LECTURER_DB)}` },
      payload: VALID_PAYLOAD,
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('returns 409 when programme code already exists', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);
    vi.mocked(prisma.programme.findUnique).mockResolvedValueOnce({ id: PROG_ID } as never); // duplicate

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/programmes',
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
      payload: VALID_PAYLOAD,
    });

    expect(response.statusCode).toBe(409);
    await app.close();
  });
});

// ── DELETE /programmes/:id ────────────────────────────────────────────────────

describe('DELETE /programmes/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 409 when students are enrolled in the programme', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);
    vi.mocked(prisma.programme.findUnique).mockResolvedValueOnce({
      id: PROG_ID,
      _count: { students: 5 },
    } as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/programmes/${PROG_ID}`,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
    });

    expect(response.statusCode).toBe(409);
    await app.close();
  });

  it('returns 200 when no students are enrolled', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);
    vi.mocked(prisma.programme.findUnique).mockResolvedValueOnce({
      id: PROG_ID,
      _count: { students: 0 },
    } as never);
    vi.mocked(prisma.programme.delete).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/programmes/${PROG_ID}`,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
