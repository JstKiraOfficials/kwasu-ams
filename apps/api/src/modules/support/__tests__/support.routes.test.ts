/**
 * @file support.routes.test.ts
 * @module modules/support/__tests__
 *
 * Integration tests for the support ticket HTTP routes.
 *
 * Test coverage:
 * - POST /support: creates ticket with status OPEN
 * - GET /support with STUDENT: returns own tickets only
 * - PATCH /support/:id with STUDENT: 403
 * - PATCH /support/:id with HOD: 200, sets resolvedAt when RESOLVED
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    supportTicket: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
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

const USER_ID = 'a0000000-0000-4000-8000-000000000001';
const TICKET_ID = 'a0000000-0000-4000-8000-000000000002';

const STUDENT_DB = {
  id: USER_ID,
  role: 'STUDENT' as const,
  scopeId: null,
  isActive: true,
  deletedAt: null,
  lockoutUntil: null,
};
const HOD_DB = {
  id: USER_ID,
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

const makeTicket = (status = 'OPEN') => ({
  id: TICKET_ID,
  submittedById: USER_ID,
  category: 'ATTENDANCE_DISPUTE',
  subject: 'Test ticket',
  description: 'Test description for support ticket.',
  status,
  assignedRole: null,
  assignedToId: null,
  resolution: null,
  resolvedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  submittedBy: { fullName: 'Test User', role: 'STUDENT' },
});

const validTicketBody = {
  category: 'ATTENDANCE_DISPUTE',
  subject: 'Test ticket',
  description: 'Test description for support ticket.',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
});

describe('POST /support', () => {
  it('creates a ticket with status OPEN', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(STUDENT_DB as never);
    vi.mocked(prisma.supportTicket.create).mockResolvedValue(makeTicket() as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/support',
      headers: { authorization: `Bearer ${tokenFor(STUDENT_DB)}` },
      payload: validTicketBody,
    });
    await app.close();

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body) as { status: string };
    expect(body.status).toBe('OPEN');
  });

  it('returns 401 when no token provided', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/support',
      payload: validTicketBody,
    });
    await app.close();

    expect(response.statusCode).toBe(401);
  });
});

describe('GET /support', () => {
  it('returns own tickets for STUDENT', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(STUDENT_DB as never);
    vi.mocked(prisma.supportTicket.findMany).mockResolvedValue([makeTicket()] as never);
    vi.mocked(prisma.supportTicket.count).mockResolvedValue(1);

    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/support',
      headers: { authorization: `Bearer ${tokenFor(STUDENT_DB)}` },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    // Verify scope filter was applied
    expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ submittedById: USER_ID }) }),
    );
  });
});

describe('PATCH /support/:id', () => {
  it('returns 403 when STUDENT tries to update a ticket', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(STUDENT_DB as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/support/${TICKET_ID}`,
      headers: { authorization: `Bearer ${tokenFor(STUDENT_DB)}` },
      payload: { status: 'IN_PROGRESS' },
    });
    await app.close();

    expect(response.statusCode).toBe(403);
  });

  it('returns 200 and sets resolvedAt when HOD resolves a ticket', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(HOD_DB as never);
    vi.mocked(prisma.supportTicket.findUnique).mockResolvedValue(
      makeTicket('IN_PROGRESS') as never,
    );
    vi.mocked(prisma.supportTicket.update).mockResolvedValue(makeTicket('RESOLVED') as never);

    const app = await createApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/support/${TICKET_ID}`,
      headers: { authorization: `Bearer ${tokenFor(HOD_DB)}` },
      payload: { status: 'RESOLVED', resolution: 'Issue resolved after investigation.' },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(prisma.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RESOLVED', resolvedAt: expect.any(Date) }),
      }),
    );
  });
});
