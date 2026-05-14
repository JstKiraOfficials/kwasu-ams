/**
 * @file admin.routes.test.ts
 * @module modules/admin/__tests__
 *
 * Integration tests for the admin HTTP routes.
 *
 * Uses Fastify's `inject()` method to fire requests against the full app
 * instance without binding to a real port. All external dependencies
 * (Prisma, Redis, Argon2, S3, plugins) are mocked.
 *
 * Coverage targets:
 * - POST /admin/users: SUPER_ADMIN (201), ACADEMIC_AFFAIRS (201), LECTURER (403),
 *   unauthenticated (401), duplicate identifier (409), invalid body (400)
 * - POST /admin/users/import: SUPER_ADMIN (202), LECTURER (403), unauthenticated (401)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../../../app.js';
import { signAccessToken } from '../../../lib/jwt.js';
import { Role } from '@kwasu-ams/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
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

vi.mock('../../../lib/argon2.js', () => ({
  verifyPassword: vi.fn(),
  hashPassword: vi.fn().mockResolvedValue('$argon2id$hashed'),
}));

vi.mock('../../../lib/s3.js', () => ({
  uploadToS3: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../lib/email-client.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

// Stub out Fastify plugins that require real infrastructure
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

const SUPER_ADMIN_USER = {
  id: 'admin-1',
  role: 'SUPER_ADMIN',
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};

const ACADEMIC_AFFAIRS_USER = {
  id: 'aa-1',
  role: 'ACADEMIC_AFFAIRS',
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};

const LECTURER_USER = {
  id: 'lec-1',
  role: 'LECTURER',
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};

const CREATED_USER = {
  id: 'new-user-1',
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

const VALID_USER_PAYLOAD = {
  identifier: 'KWASU/LEC/CSC/00200',
  fullName: 'Test Lecturer',
  email: 'test@kwasu.edu.ng',
  phone: '+2348012345678',
  role: 'LECTURER',
};

// ── POST /admin/users ─────────────────────────────────────────────────────────

describe('POST /admin/users', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no Authorization header is provided', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/users',
      payload: VALID_USER_PAYLOAD,
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns 403 when called by a LECTURER', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(LECTURER_USER as never);

    const token = signAccessToken({
      userId: 'lec-1',
      role: Role.LECTURER,
      scopeId: null,
      sessionId: 'sess-1',
    });

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/users',
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_USER_PAYLOAD,
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('returns 201 when called by a SUPER_ADMIN', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(SUPER_ADMIN_USER as never) // authenticate
      .mockResolvedValueOnce(null); // duplicate check
    vi.mocked(prisma.user.create).mockResolvedValueOnce(CREATED_USER as never);

    const token = signAccessToken({
      userId: 'admin-1',
      role: Role.SUPER_ADMIN,
      scopeId: null,
      sessionId: 'sess-1',
    });

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/users',
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_USER_PAYLOAD,
    });

    expect(response.statusCode).toBe(201);
    await app.close();
  });

  it('returns 201 when called by ACADEMIC_AFFAIRS', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(ACADEMIC_AFFAIRS_USER as never) // authenticate
      .mockResolvedValueOnce(null); // duplicate check
    vi.mocked(prisma.user.create).mockResolvedValueOnce(CREATED_USER as never);

    const token = signAccessToken({
      userId: 'aa-1',
      role: Role.ACADEMIC_AFFAIRS,
      scopeId: null,
      sessionId: 'sess-1',
    });

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/users',
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_USER_PAYLOAD,
    });

    expect(response.statusCode).toBe(201);
    await app.close();
  });

  it('returns 409 when the identifier already exists', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(SUPER_ADMIN_USER as never) // authenticate
      .mockResolvedValueOnce({ id: 'existing-1' } as never); // duplicate check

    const token = signAccessToken({
      userId: 'admin-1',
      role: Role.SUPER_ADMIN,
      scopeId: null,
      sessionId: 'sess-1',
    });

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/users',
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_USER_PAYLOAD,
    });

    expect(response.statusCode).toBe(409);
    await app.close();
  });

  it('returns 400 when required fields are missing', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_USER as never);

    const token = signAccessToken({
      userId: 'admin-1',
      role: Role.SUPER_ADMIN,
      scopeId: null,
      sessionId: 'sess-1',
    });

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/users',
      headers: { authorization: `Bearer ${token}` },
      payload: { identifier: 'KWASU/LEC/CSC/00200' }, // missing required fields
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

// ── POST /admin/users/import ──────────────────────────────────────────────────

describe('POST /admin/users/import', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no Authorization header is provided', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/users/import',
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns 403 when called by a LECTURER', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(LECTURER_USER as never);

    const token = signAccessToken({
      userId: 'lec-1',
      role: Role.LECTURER,
      scopeId: null,
      sessionId: 'sess-1',
    });

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/users/import',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('returns 202 with jobId when called by SUPER_ADMIN with a CSV file', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_USER as never);

    const token = signAccessToken({
      userId: 'admin-1',
      role: Role.SUPER_ADMIN,
      scopeId: null,
      sessionId: 'sess-1',
    });

    const csvContent =
      'identifier,fullName,email,phone,role\nKWASU/LEC/CSC/00300,Test,t@k.ng,+2348012345678,LECTURER\n';

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/users/import',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'multipart/form-data; boundary=----boundary',
      },
      payload:
        '------boundary\r\nContent-Disposition: form-data; name="file"; filename="users.csv"\r\nContent-Type: text/csv\r\n\r\n' +
        csvContent +
        '\r\n------boundary--\r\n',
    });

    expect(response.statusCode).toBe(202);
    const body = response.json<{ jobId: string; message: string }>();
    expect(body.jobId).toBeDefined();
    expect(body.message).toBeDefined();
    await app.close();
  });

  it('returns 400 when no file is provided', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_USER as never);

    const token = signAccessToken({
      userId: 'admin-1',
      role: Role.SUPER_ADMIN,
      scopeId: null,
      sessionId: 'sess-1',
    });

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/users/import',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'multipart/form-data; boundary=----boundary',
      },
      payload: '------boundary--\r\n', // empty multipart — no file
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
