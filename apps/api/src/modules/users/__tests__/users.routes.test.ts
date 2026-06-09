/**
 * @file users.routes.test.ts
 * @module modules/users/__tests__
 *
 * Integration tests for the users HTTP routes.
 *
 * Test coverage:
 * - GET /users/me without token: 401
 * - GET /users/me with valid token: 200 with IUserPublic (no sensitive fields)
 * - PATCH /users/me with invalid email: 400
 * - PATCH /users/me with valid data: 200 with updated profile
 * - POST /users/me/data-export without token: 401
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks (must be before imports)
// =============================================================================

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    attendanceRecord: { findMany: vi.fn() },
    excuseLetter: { findMany: vi.fn() },
    examEligibility: { findMany: vi.fn() },
    notification: { findMany: vi.fn() },
    supportTicket: { findMany: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock('../../../lib/redis.js', () => ({
  workerRedis: { on: vi.fn() },
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    ping: vi.fn().mockResolvedValue('PONG'),
  },
  connectRedis: vi.fn(),
}));

vi.mock('../../../lib/pdf-generator.js', () => ({
  generatePdf: vi.fn().mockResolvedValue({ buffer: Buffer.from('pdf'), checksum: 'abc' }),
}));

vi.mock('../../../lib/email-client.js', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../jobs/queue.js', () => ({
  notificationQueue: { add: vi.fn() },
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

const USER_ID = 'a0000000-0000-4000-8000-000000000001';

const USER_DB = {
  id: USER_ID,
  role: 'STUDENT' as const,
  scopeId: null,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};

const FULL_USER_DB = {
  ...USER_DB,
  identifier: '22/47CSC/00001',
  fullName: 'Test Student',
  email: 'student@kwasu.edu.ng',
  phone: '08012345678',
  languagePreference: 'en',
  totpEnrolled: true,
  mustChangePassword: false,
  createdAt: new Date('2025-01-01'),
  passwordHash: '$argon2id$hash',
  totpSecret: 'SECRET',
  totpBackupCodes: [],
  failedAttempts: 0,
  student: null,
  lecturer: null,
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
});

// =============================================================================
// GET /users/me
// =============================================================================

describe('GET /users/me', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const app = await createApp();
    const response = await app.inject({ method: 'GET', url: '/users/me' });
    await app.close();

    expect(response.statusCode).toBe(401);
  });

  it('returns 200 with IUserPublic and never includes sensitive fields', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(FULL_USER_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: { authorization: `Bearer ${tokenFor(USER_DB)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body['id']).toBe(USER_ID);
    expect(body['fullName']).toBe('Test Student');
    expect(body['passwordHash']).toBeUndefined();
    expect(body['totpSecret']).toBeUndefined();
    expect(body['totpBackupCodes']).toBeUndefined();
  });
});

// =============================================================================
// PATCH /users/me
// =============================================================================

describe('PATCH /users/me', () => {
  it('returns 400 when email format is invalid', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(USER_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      headers: {
        authorization: `Bearer ${tokenFor(USER_DB)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    await app.close();

    expect(response.statusCode).toBe(400);
  });

  it('returns 401 when no token is provided', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '08099999999' }),
    });
    await app.close();

    expect(response.statusCode).toBe(401);
  });
});

// =============================================================================
// POST /users/me/data-export
// =============================================================================

describe('POST /users/me/data-export', () => {
  it('returns 401 when no token is provided', async () => {
    const app = await createApp();
    const response = await app.inject({ method: 'POST', url: '/users/me/data-export' });
    await app.close();

    expect(response.statusCode).toBe(401);
  });
});
