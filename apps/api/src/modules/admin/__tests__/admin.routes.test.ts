/**
 * @file admin.routes.test.ts
 * @module modules/admin/__tests__
 *
 * Integration tests for the admin HTTP routes — Phase 12 additions.
 *
 * Uses Fastify's `inject()` method to fire requests against the full app
 * instance without binding to a real port. All external dependencies
 * (Prisma, Redis, Argon2, S3, plugins) are mocked.
 *
 * Coverage targets:
 * - GET  /admin/users          — SUPER_ADMIN (200), LECTURER (403), unauthenticated (401)
 * - GET  /admin/users/:id      — SUPER_ADMIN (200), not found (404)
 * - PATCH /admin/users/:id     — SUPER_ADMIN (200), LECTURER (403), not found (404)
 * - DELETE /admin/users/:id    — SUPER_ADMIN (200), ACADEMIC_AFFAIRS (403), not found (404)
 * - POST /admin/users          — SUPER_ADMIN (201), ACADEMIC_AFFAIRS (201), LECTURER (403),
 *                                unauthenticated (401), duplicate (409), invalid body (400)
 * - POST /admin/users/import   — SUPER_ADMIN (400 no file), LECTURER (403), unauthenticated (401)
 * - POST /admin/users/:id/reset-totp — SUPER_ADMIN (200), ACADEMIC_AFFAIRS (403)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../../../app.js';
import { signAccessToken } from '../../../lib/jwt.js';
import { Role } from '@kwasu-ams/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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

vi.mock('../../../lib/argon2.js', () => ({
  verifyPassword: vi.fn(),
  hashPassword: vi.fn().mockResolvedValue('$argon2id$hashed'),
}));

vi.mock('../../../lib/s3.js', () => ({
  uploadToS3: vi.fn().mockResolvedValue(undefined),
  s3Client: { send: vi.fn() },
}));

vi.mock('../../../lib/email-client.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../auth/totp.service.js', () => ({
  adminResetTotp: vi.fn().mockResolvedValue(undefined),
}));

// Stub infrastructure plugins that require real connections
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

// Real UUIDs required — routes declare format: 'uuid' on all :id params
const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const AA_ID = '00000000-0000-0000-0000-000000000002';
const LECTURER_ID = '00000000-0000-0000-0000-000000000003';
const USER_ID = '00000000-0000-0000-0000-000000000004';
const MISSING_ID = '00000000-0000-0000-0000-000000000099';

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
  scopeId: '00000000-0000-0000-0000-000000000010',
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

const PUBLIC_USER = {
  id: USER_ID,
  identifier: 'KWASU/LEC/CSC/00200',
  fullName: 'Test Lecturer',
  email: 'test@kwasu.edu.ng',
  phone: '+2348012345678',
  role: 'LECTURER',
  scopeId: null,
  mustChangePassword: true,
  totpEnrolled: false,
  languagePreference: 'en',
  fcmToken: null,
  isActive: true,
  deletedAt: null,
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

// ── GET /admin/users ──────────────────────────────────────────────────────────

describe('GET /admin/users', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 401 when no Authorization header is provided', async () => {
    const app = await createApp();
    const response = await app.inject({ method: 'GET', url: '/admin/users' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns 403 when called by a LECTURER', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(LECTURER_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { authorization: `Bearer ${tokenFor(LECTURER_DB)}` },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('returns 200 with paginated data when called by SUPER_ADMIN', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([PUBLIC_USER] as never);
    vi.mocked(prisma.user.count).mockResolvedValueOnce(1);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ data: unknown[]; meta: { total: number } }>();
    expect(body.data).toHaveLength(1);
    expect(body.meta.total).toBe(1);
    await app.close();
  });

  it('returns 200 when called by ACADEMIC_AFFAIRS', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(ACADEMIC_AFFAIRS_DB as never);
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([PUBLIC_USER] as never);
    vi.mocked(prisma.user.count).mockResolvedValueOnce(1);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { authorization: `Bearer ${tokenFor(ACADEMIC_AFFAIRS_DB)}` },
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });
});

// ── GET /admin/users/:id ──────────────────────────────────────────────────────

describe('GET /admin/users/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 200 with user data for SUPER_ADMIN', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(SUPER_ADMIN_DB as never) // authenticate
      .mockResolvedValueOnce(PUBLIC_USER as never); // getUserById

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: `/admin/users/${USER_ID}`,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
    });

    // Status 200 is the key assertion; Fastify's open schema serialises the body
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('returns 404 when user does not exist', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(SUPER_ADMIN_DB as never) // authenticate
      .mockResolvedValueOnce(null); // getUserById → not found

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: `/admin/users/${MISSING_ID}`,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

// ── PATCH /admin/users/:id ────────────────────────────────────────────────────

describe('PATCH /admin/users/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 200 with updated user when called by SUPER_ADMIN with valid data', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const updatedUser = { ...PUBLIC_USER, fullName: 'Updated Name' };
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(SUPER_ADMIN_DB as never) // authenticate
      .mockResolvedValueOnce(PUBLIC_USER as never); // updateUser: existing lookup
    vi.mocked(prisma.user.update).mockResolvedValueOnce(updatedUser as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${USER_ID}`,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
      payload: { fullName: 'Updated Name' },
    });

    // Status 200 is the key assertion; Fastify's open schema serialises the body
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('returns 403 when called by a LECTURER', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(LECTURER_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${USER_ID}`,
      headers: { authorization: `Bearer ${tokenFor(LECTURER_DB)}` },
      payload: { fullName: 'Hacker Name' }, // min 2 chars — passes schema
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('returns 404 when user does not exist', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(SUPER_ADMIN_DB as never) // authenticate
      .mockResolvedValueOnce(null); // updateUser: existing lookup → not found

    const app = await createApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${MISSING_ID}`,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
      payload: { fullName: 'Valid Name' }, // min 2 chars — passes schema
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

// ── DELETE /admin/users/:id ───────────────────────────────────────────────────

describe('DELETE /admin/users/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 200 when called by SUPER_ADMIN', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(SUPER_ADMIN_DB as never) // authenticate
      .mockResolvedValueOnce({ id: USER_ID } as never); // deleteUser: existence check
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/admin/users/${USER_ID}`,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('returns 403 when called by ACADEMIC_AFFAIRS', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(ACADEMIC_AFFAIRS_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/admin/users/${USER_ID}`,
      headers: { authorization: `Bearer ${tokenFor(ACADEMIC_AFFAIRS_DB)}` },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('returns 404 when user does not exist', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(SUPER_ADMIN_DB as never) // authenticate
      .mockResolvedValueOnce(null); // deleteUser: existence check → not found

    const app = await createApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/admin/users/${MISSING_ID}`,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

// ── POST /admin/users ─────────────────────────────────────────────────────────

describe('POST /admin/users', () => {
  beforeEach(() => vi.resetAllMocks());

  const VALID_PAYLOAD = {
    identifier: 'KWASU/LEC/CSC/00200',
    fullName: 'Test Lecturer',
    email: 'test@kwasu.edu.ng',
    phone: '+2348012345678',
    role: 'LECTURER',
  };

  it('returns 401 when no Authorization header is provided', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/users',
      payload: VALID_PAYLOAD,
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns 403 when called by a LECTURER', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(LECTURER_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/users',
      headers: { authorization: `Bearer ${tokenFor(LECTURER_DB)}` },
      payload: VALID_PAYLOAD,
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('returns 201 when called by SUPER_ADMIN with valid data', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(SUPER_ADMIN_DB as never) // authenticate
      .mockResolvedValueOnce(null); // createUser: duplicate check
    vi.mocked(prisma.user.create).mockResolvedValueOnce(PUBLIC_USER as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/users',
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
      payload: VALID_PAYLOAD,
    });
    expect(response.statusCode).toBe(201);
    await app.close();
  });

  it('returns 201 when called by ACADEMIC_AFFAIRS', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(ACADEMIC_AFFAIRS_DB as never) // authenticate
      .mockResolvedValueOnce(null); // createUser: duplicate check
    vi.mocked(prisma.user.create).mockResolvedValueOnce(PUBLIC_USER as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/users',
      headers: { authorization: `Bearer ${tokenFor(ACADEMIC_AFFAIRS_DB)}` },
      payload: VALID_PAYLOAD,
    });
    expect(response.statusCode).toBe(201);
    await app.close();
  });

  it('returns 409 when the identifier already exists', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(SUPER_ADMIN_DB as never) // authenticate
      .mockResolvedValueOnce({ id: ADMIN_ID } as never); // createUser: duplicate found

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/users',
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
      payload: VALID_PAYLOAD,
    });
    expect(response.statusCode).toBe(409);
    await app.close();
  });

  it('returns 400 when required fields are missing', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/users',
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
      payload: { identifier: 'KWASU/LEC/CSC/00200' }, // missing fullName, email, phone, role
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

// ── POST /admin/users/import ──────────────────────────────────────────────────

describe('POST /admin/users/import', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 401 when no Authorization header is provided', async () => {
    const app = await createApp();
    const response = await app.inject({ method: 'POST', url: '/admin/users/import' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns 403 when called by a LECTURER', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(LECTURER_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/users/import',
      headers: { authorization: `Bearer ${tokenFor(LECTURER_DB)}` },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('returns 400 when no file is provided', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/users/import',
      headers: {
        authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}`,
        'content-type': 'multipart/form-data; boundary=----boundary',
      },
      payload: '------boundary--\r\n', // empty multipart — no file field
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

// ── POST /admin/users/:id/reset-totp ─────────────────────────────────────────

describe('POST /admin/users/:id/reset-totp', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 200 when called by SUPER_ADMIN', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    // authenticate uses findUnique; adminResetTotp (mocked) does not call prisma
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: `/admin/users/${USER_ID}/reset-totp`,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('returns 403 when called by ACADEMIC_AFFAIRS', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(ACADEMIC_AFFAIRS_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: `/admin/users/${USER_ID}/reset-totp`,
      headers: { authorization: `Bearer ${tokenFor(ACADEMIC_AFFAIRS_DB)}` },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
