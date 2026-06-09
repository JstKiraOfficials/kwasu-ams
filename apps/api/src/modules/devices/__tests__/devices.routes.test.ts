/**
 * @file devices.routes.test.ts
 * @module modules/devices/__tests__
 *
 * Integration tests for the device binding HTTP routes.
 *
 * Uses Fastify's `inject()` method against the full app instance.
 * All external dependencies (Prisma, Redis, S3, plugins) are mocked.
 *
 * Coverage targets:
 * - POST /devices — first device (ACTIVE), second device (PENDING_APPROVAL), third (400)
 * - DELETE /devices/:id — revoke device (200)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../../../app.js';
import { signAccessToken } from '../../../lib/jwt.js';
import { Role } from '@kwasu-ams/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    deviceBinding: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    anomalyFlag: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    attendanceRecord: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
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
    venue: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    course: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
    },
    courseEnrollment: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    courseSession: { count: vi.fn() },
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

const STUDENT_USER_ID = 'a0000000-0000-4000-8000-000000000001';
const DEVICE_ID = 'a0000000-0000-4000-8000-000000000010';

const STUDENT_DB = {
  id: STUDENT_USER_ID,
  role: 'STUDENT',
  scopeId: null,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};

const DEVICE_RECORD = {
  id: DEVICE_ID,
  userId: STUDENT_USER_ID,
  deviceFingerprint: 'fingerprint-abc-123-xyz',
  platform: 'android',
  deviceModel: 'Pixel 7',
  osVersion: '13',
  isPrimary: true,
  status: 'ACTIVE',
  registeredAt: new Date(),
  lastSeenAt: null,
  revokedAt: null,
  revokedReason: null,
};

function tokenFor(user: { id: string; role: string; scopeId: string | null }): string {
  return signAccessToken({
    userId: user.id,
    role: user.role as Role,
    scopeId: user.scopeId,
    sessionId: 'sess-test',
  });
}

const VALID_PAYLOAD = {
  deviceFingerprint: 'fingerprint-abc-123-xyz',
  platform: 'android',
  deviceModel: 'Pixel 7',
  osVersion: '13',
  isPrimary: true,
};

// =============================================================================
// POST /devices
// =============================================================================

describe('POST /devices', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 201 with status ACTIVE for first device registration', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(STUDENT_DB as never);
    vi.mocked(prisma.deviceBinding.findMany).mockResolvedValueOnce([]); // no existing devices
    vi.mocked(prisma.deviceBinding.findUnique).mockResolvedValueOnce(null); // not already registered
    vi.mocked(prisma.deviceBinding.count).mockResolvedValueOnce(0); // no changes this semester
    vi.mocked(prisma.deviceBinding.create).mockResolvedValueOnce(DEVICE_RECORD as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/devices',
      headers: { authorization: `Bearer ${tokenFor(STUDENT_DB)}` },
      payload: VALID_PAYLOAD,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{ status: string }>();
    expect(body.status).toBe('ACTIVE');
    await app.close();
  });

  it('returns 201 with status PENDING_APPROVAL for second device (new fingerprint)', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(STUDENT_DB as never);
    // One existing active device
    vi.mocked(prisma.deviceBinding.findMany).mockResolvedValueOnce([
      { id: 'existing-device', deviceFingerprint: 'other-fingerprint' },
    ] as never);
    vi.mocked(prisma.deviceBinding.findUnique).mockResolvedValueOnce(null); // new fingerprint
    vi.mocked(prisma.deviceBinding.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.deviceBinding.create).mockResolvedValueOnce({
      ...DEVICE_RECORD,
      status: 'PENDING_APPROVAL',
    } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/devices',
      headers: { authorization: `Bearer ${tokenFor(STUDENT_DB)}` },
      payload: { ...VALID_PAYLOAD, deviceFingerprint: 'new-fingerprint-xyz-456' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{ status: string }>();
    expect(body.status).toBe('PENDING_APPROVAL');
    await app.close();
  });

  it('returns 400 DEVICE_LIMIT_REACHED when student already has 2 active devices', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(STUDENT_DB as never);
    // Two existing active devices
    vi.mocked(prisma.deviceBinding.findMany).mockResolvedValueOnce([
      { id: 'device-1', deviceFingerprint: 'fp-1' },
      { id: 'device-2', deviceFingerprint: 'fp-2' },
    ] as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/devices',
      headers: { authorization: `Bearer ${tokenFor(STUDENT_DB)}` },
      payload: { ...VALID_PAYLOAD, deviceFingerprint: 'new-fingerprint-third' },
    });

    expect(response.statusCode).toBe(400);
    // Parse raw body string directly — response.json() may fail if content-type is unexpected
    const body = JSON.parse(response.body) as { errors?: Array<{ code: string }>; code?: string };
    const errorCode = body.errors?.[0]?.code ?? body.code;
    expect(errorCode).toBe('DEVICE_LIMIT_REACHED');
    await app.close();
  });
});

// =============================================================================
// DELETE /devices/:id
// =============================================================================

describe('DELETE /devices/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 200 and revokes the device', async () => {
    const { prisma } = await import('../../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(STUDENT_DB as never);
    vi.mocked(prisma.deviceBinding.findUnique).mockResolvedValueOnce({
      id: DEVICE_ID,
      userId: STUDENT_USER_ID,
    } as never);
    vi.mocked(prisma.deviceBinding.update).mockResolvedValueOnce({
      ...DEVICE_RECORD,
      status: 'REVOKED',
    } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'DELETE',
      url: `/devices/${DEVICE_ID}`,
      headers: { authorization: `Bearer ${tokenFor(STUDENT_DB)}` },
      payload: { reason: 'Lost device' },
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.deviceBinding.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'REVOKED' }) }),
    );
    await app.close();
  });
});
