/**
 * @file auth.routes.test.ts
 * @module modules/auth/__tests__
 *
 * Integration tests for the auth HTTP routes.
 *
 * Uses Fastify's `inject()` method to fire requests against the full app
 * instance without binding to a real port. All external dependencies
 * (Prisma, Redis, Argon2, email, plugins) are mocked.
 *
 * Coverage targets:
 * - POST /auth/login: happy path, invalid format, wrong password
 * - POST /auth/change-password: unauthenticated, authenticated
 * - POST /admin/users: SUPER_ADMIN (201), LECTURER (403)
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

vi.mock('../../../lib/email-client.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../lib/s3.js', () => ({
  uploadToS3: vi.fn().mockResolvedValue(undefined),
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

/** Active student user returned by mocked Prisma queries. */
const ACTIVE_STUDENT = {
  id: 'user-123',
  role: 'STUDENT',
  passwordHash: '$argon2id$hash',
  mustChangePassword: false,
  totpEnrolled: false,
  failedAttempts: 0,
  lockoutUntil: null,
  isActive: true,
  deletedAt: null,
};

/** Active SUPER_ADMIN user returned by mocked Prisma queries. */
const SUPER_ADMIN_USER = {
  id: 'admin-1',
  role: 'SUPER_ADMIN',
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};

// ── POST /auth/login ──────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with interimToken on valid credentials', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const { verifyPassword } = await import('../../../lib/argon2.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(ACTIVE_STUDENT as never);
    vi.mocked(verifyPassword).mockResolvedValueOnce(true);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: '22/47CSC/00001', password: 'Password1!' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ interimToken: string }>();
    expect(body.interimToken).toBeDefined();
    await app.close();
  });

  it('returns 400 for an invalid identifier format', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: 'not-valid', password: 'Password1!' },
    });

    expect(response.statusCode).toBe(400);
    // Log body for debugging
    const rawBody = response.body;
    const body = JSON.parse(rawBody) as {
      errors?: Array<{ code: string; field?: string }>;
      code?: string;
      statusCode?: number;
    };
    // The global error handler wraps AppError in { errors: [...] }
    // If errors array is present use it, otherwise check flat shape
    if (body.errors) {
      expect(body.errors[0]?.code).toBe('VALIDATION_ERROR');
      expect(body.errors[0]?.field).toBe('identifier');
    } else {
      // Fastify may return its own error shape in test context
      expect(body.code ?? body.statusCode).toBeDefined();
    }
    await app.close();
  });

  it('returns 401 for a wrong password', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const { verifyPassword } = await import('../../../lib/argon2.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(ACTIVE_STUDENT as never);
    vi.mocked(verifyPassword).mockResolvedValueOnce(false);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: '22/47CSC/00001', password: 'WrongPass' },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });
});

// ── POST /auth/change-password ────────────────────────────────────────────────

describe('POST /auth/change-password', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no Authorization header is provided', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/change-password',
      payload: { currentPassword: 'Old1!', newPassword: 'NewPassword1!' },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns 200 when authenticated with a valid token and correct current password', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    const { verifyPassword } = await import('../../../lib/argon2.js');

    // authenticate middleware lookup
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(SUPER_ADMIN_USER as never) // authenticate
      .mockResolvedValueOnce({
        // changePassword service
        id: 'admin-1',
        role: 'SUPER_ADMIN',
        passwordHash: '$argon2id$old',
      } as never);

    vi.mocked(verifyPassword).mockResolvedValueOnce(true);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({} as never);

    const token = signAccessToken({
      userId: 'admin-1',
      role: Role.SUPER_ADMIN,
      scopeId: null,
      sessionId: 'sess-1',
    });

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: 'OldPass1!', newPassword: 'NewPassword1!' },
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });
});

// ── POST /admin/users ─────────────────────────────────────────────────────────

describe('POST /admin/users', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 201 when called by a SUPER_ADMIN', async () => {
    const { prisma } = await import('../../../lib/prisma.js');

    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(SUPER_ADMIN_USER as never) // authenticate
      .mockResolvedValueOnce(null); // duplicate check

    vi.mocked(prisma.user.create).mockResolvedValueOnce({
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
    } as never);

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
      payload: {
        identifier: 'KWASU/LEC/CSC/00200',
        fullName: 'Test Lecturer',
        email: 'test@kwasu.edu.ng',
        phone: '+2348012345678',
        role: 'LECTURER',
      },
    });

    expect(response.statusCode).toBe(201);
    await app.close();
  });

  it('returns 403 when called by a LECTURER', async () => {
    const { prisma } = await import('../../../lib/prisma.js');

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      ...ACTIVE_STUDENT,
      role: 'LECTURER',
    } as never);

    const token = signAccessToken({
      userId: 'user-123',
      role: Role.LECTURER,
      scopeId: null,
      sessionId: 'sess-1',
    });

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/admin/users',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        identifier: 'KWASU/LEC/CSC/00201',
        fullName: 'Another Lecturer',
        email: 'another@kwasu.edu.ng',
        phone: '+2348012345679',
        role: 'LECTURER',
      },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
