/**
 * @file audit.routes.test.ts
 * @module modules/audit/__tests__
 *
 * Integration tests for the audit log HTTP routes.
 *
 * Test coverage:
 * - GET /audit-logs with SUPER_ADMIN: 200 with paginated logs
 * - GET /audit-logs with HOD: 403
 * - GET /audit-logs?action=LOGIN_SUCCESS: filters correctly
 * - GET /audit-logs/:id with SUPER_ADMIN: 200
 * - GET /audit-logs/:id not found: 404
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    auditLog: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
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

const ADMIN_ID = 'a0000000-0000-4000-8000-000000000001';
const LOG_ID = 'a0000000-0000-4000-8000-000000000002';

const ADMIN_DB = {
  id: ADMIN_ID,
  role: 'SUPER_ADMIN' as const,
  scopeId: null,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};
const HOD_DB = {
  id: ADMIN_ID,
  role: 'HOD' as const,
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

const makeLog = () => ({
  id: LOG_ID,
  actorId: ADMIN_ID,
  actorRole: 'SUPER_ADMIN',
  action: 'LOGIN_SUCCESS',
  entityType: 'User',
  entityId: null,
  beforeJson: null,
  afterJson: null,
  ipAddress: null,
  createdAt: new Date(),
  actor: { fullName: 'Admin', role: 'SUPER_ADMIN' },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.auditLog.count).mockResolvedValue(1);
});

describe('GET /audit-logs', () => {
  it('returns 200 with paginated logs for SUPER_ADMIN', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(ADMIN_DB as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([makeLog()] as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/audit-logs',
      headers: { authorization: `Bearer ${tokenFor(ADMIN_DB)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { data: unknown[]; meta: { total: number } };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.total).toBe(1);
  });

  it('returns 403 for HOD role', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(HOD_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/audit-logs',
      headers: { authorization: `Bearer ${tokenFor(HOD_DB)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(403);
  });

  it('returns 401 when no token provided', async () => {
    const app = await createApp();
    const response = await app.inject({ method: 'GET', url: '/audit-logs' });
    await app.close();

    expect(response.statusCode).toBe(401);
  });

  it('filters by action query param', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(ADMIN_DB as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([makeLog()] as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/audit-logs?action=LOGIN_SUCCESS',
      headers: { authorization: `Bearer ${tokenFor(ADMIN_DB)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ action: 'LOGIN_SUCCESS' }) }),
    );
  });
});

describe('GET /audit-logs/:id', () => {
  it('returns 200 for SUPER_ADMIN', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(ADMIN_DB as never);
    vi.mocked(prisma.auditLog.findUnique).mockResolvedValue(makeLog() as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: `/audit-logs/${LOG_ID}`,
      headers: { authorization: `Bearer ${tokenFor(ADMIN_DB)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
  });

  it('returns 404 when log not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(ADMIN_DB as never);
    vi.mocked(prisma.auditLog.findUnique).mockResolvedValue(null);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: `/audit-logs/${LOG_ID}`,
      headers: { authorization: `Bearer ${tokenFor(ADMIN_DB)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(404);
  });
});
