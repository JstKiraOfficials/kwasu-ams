/**
 * @file faculties.routes.test.ts
 * @module modules/faculties/__tests__
 *
 * Integration tests for the faculties HTTP routes.
 *
 * Uses Fastify's `inject()` method against the full app instance.
 * All external dependencies (Prisma, Redis, S3, plugins) are mocked.
 *
 * Coverage targets:
 * - GET  /faculties          — SUPER_ADMIN (200 paginated)
 * - POST /faculties          — SUPER_ADMIN (201), LECTURER (403), duplicate code (409)
 * - DELETE /faculties/:id    — SUPER_ADMIN with departments (409), without (200)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../../../app.js';
import { signAccessToken } from '../../../lib/jwt.js';
import { Role } from '@kwasu-ams/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    faculty: {
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
const LECTURER_ID = 'a0000000-0000-4000-8000-000000000002';
const FACULTY_ID = 'a0000000-0000-4000-8000-000000000010';
const UNI_ID = 'a0000000-0000-4000-8000-000000000020';

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
  scopeId: null,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};

const FACULTY = {
  id: FACULTY_ID,
  universityId: UNI_ID,
  name: 'Faculty of Sciences',
  code: 'SCI',
  deanId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { departments: 0 },
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

// ── GET /faculties ────────────────────────────────────────────────────────────

describe('GET /faculties', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 200 with paginated faculties for SUPER_ADMIN', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);
    vi.mocked(prisma.faculty.findMany).mockResolvedValueOnce([FACULTY] as never);
    vi.mocked(prisma.faculty.count).mockResolvedValueOnce(1);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/faculties',
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('returns 401 when no token is provided', async () => {
    const app = await createApp();
    const response = await app.inject({ method: 'GET', url: '/faculties' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});

// ── POST /faculties ───────────────────────────────────────────────────────────

describe('POST /faculties', () => {
  beforeEach(() => vi.resetAllMocks());

  const VALID_PAYLOAD = { name: 'Faculty of Sciences', code: 'SCI', universityId: UNI_ID };

  it('returns 201 when called by SUPER_ADMIN with valid data', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);
    vi.mocked(prisma.faculty.findUnique).mockResolvedValueOnce(null); // no duplicate
    vi.mocked(prisma.faculty.create).mockResolvedValueOnce(FACULTY as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/faculties',
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
      url: '/faculties',
      headers: { authorization: `Bearer ${tokenFor(LECTURER_DB)}` },
      payload: VALID_PAYLOAD,
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('returns 409 when faculty code already exists', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);
    vi.mocked(prisma.faculty.findUnique).mockResolvedValueOnce({ id: FACULTY_ID } as never); // duplicate

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/faculties',
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
      payload: VALID_PAYLOAD,
    });

    expect(response.statusCode).toBe(409);
    await app.close();
  });
});

// ── DELETE /faculties/:id ─────────────────────────────────────────────────────

describe('DELETE /faculties/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 409 when faculty has departments', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);
    vi.mocked(prisma.faculty.findUnique).mockResolvedValueOnce({
      id: FACULTY_ID,
      _count: { departments: 3 },
    } as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/faculties/${FACULTY_ID}`,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
    });

    expect(response.statusCode).toBe(409);
    await app.close();
  });

  it('returns 200 when faculty has no departments', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);
    vi.mocked(prisma.faculty.findUnique).mockResolvedValueOnce({
      id: FACULTY_ID,
      _count: { departments: 0 },
    } as never);
    vi.mocked(prisma.faculty.delete).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/faculties/${FACULTY_ID}`,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
