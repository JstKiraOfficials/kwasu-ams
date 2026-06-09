/**
 * @file venues.routes.test.ts
 * @module modules/venues/__tests__
 *
 * Integration tests for the venues HTTP routes.
 *
 * Uses Fastify's `inject()` method against the full app instance.
 * All external dependencies (Prisma, Redis, S3, plugins) are mocked.
 *
 * Coverage targets:
 * - POST /venues — geofenceRadius validation (25 → 400, 200 → 400, 50 → 201)
 * - DELETE /venues/:id — soft deactivation (200), not found (404)
 * - GET /venues — 401 without token, 200 with valid token
 * - PATCH /venues/:id — 403 for LECTURER role
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../../../app.js';
import { signAccessToken } from '../../../lib/jwt.js';
import { Role } from '@kwasu-ams/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    venue: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    timetableEntry: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    courseSection: { findUnique: vi.fn() },
    student: { findUnique: vi.fn() },
    lecturer: { findUnique: vi.fn() },
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
const LECTURER_USER_ID = 'a0000000-0000-4000-8000-000000000002';
const VENUE_ID = 'a0000000-0000-4000-8000-000000000010';

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
  scopeId: null,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};

const VENUE_RECORD = {
  id: VENUE_ID,
  name: 'LT1',
  buildingName: 'Main Block',
  latitude: 8.4799,
  longitude: 4.5418,
  geofenceRadius: 50,
  capacity: 200,
  isActive: true,
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
// POST /venues — geofenceRadius validation
// =============================================================================

describe('POST /venues — geofenceRadius validation', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 400 when geofenceRadius is 25 (below minimum of 30)', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/venues',
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
      payload: {
        name: 'LT1',
        buildingName: 'Main Block',
        latitude: 8.4799,
        longitude: 4.5418,
        geofenceRadius: 25,
        capacity: 200,
      },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('returns 400 when geofenceRadius is 200 (above maximum of 150)', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/venues',
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
      payload: {
        name: 'LT1',
        buildingName: 'Main Block',
        latitude: 8.4799,
        longitude: 4.5418,
        geofenceRadius: 200,
        capacity: 200,
      },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('returns 201 when geofenceRadius is 50 (valid)', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);
    vi.mocked(prisma.venue.create).mockResolvedValueOnce(VENUE_RECORD as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/venues',
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
      payload: {
        name: 'LT1',
        buildingName: 'Main Block',
        latitude: 8.4799,
        longitude: 4.5418,
        geofenceRadius: 50,
        capacity: 200,
      },
    });

    expect(response.statusCode).toBe(201);
    await app.close();
  });
});

// =============================================================================
// DELETE /venues/:id — soft deactivation
// =============================================================================

describe('DELETE /venues/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 200 and sets isActive=false (soft delete)', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({ id: VENUE_ID } as never);
    vi.mocked(prisma.venue.update).mockResolvedValueOnce({
      ...VENUE_RECORD,
      isActive: false,
    } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/venues/${VENUE_ID}`,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
    });

    expect(response.statusCode).toBe(200);
    // Verify soft delete — update called with isActive: false, not delete
    expect(prisma.venue.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
    await app.close();
  });

  it('returns 404 when venue does not exist', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(SUPER_ADMIN_DB as never);
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(null);

    const app = await createApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/venues/${VENUE_ID}`,
      headers: { authorization: `Bearer ${tokenFor(SUPER_ADMIN_DB)}` },
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

// =============================================================================
// GET /venues — auth and role enforcement
// =============================================================================

describe('GET /venues', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 401 when no token is provided', async () => {
    const app = await createApp();
    const response = await app.inject({ method: 'GET', url: '/venues' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns 403 when called by LECTURER (not in READ_ROLES... wait, LECTURER is allowed)', async () => {
    // LECTURER is in READ_ROLES for venues — verify 200
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(LECTURER_DB as never);
    vi.mocked(prisma.venue.findMany).mockResolvedValueOnce([VENUE_RECORD] as never);
    vi.mocked(prisma.venue.count).mockResolvedValueOnce(1);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/venues',
      headers: { authorization: `Bearer ${tokenFor(LECTURER_DB)}` },
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });
});

// =============================================================================
// PATCH /venues/:id — role enforcement
// =============================================================================

describe('PATCH /venues/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 403 when called by LECTURER (not in MANAGE_ROLES)', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(LECTURER_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/venues/${VENUE_ID}`,
      headers: { authorization: `Bearer ${tokenFor(LECTURER_DB)}` },
      payload: { name: 'Updated Name' },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
