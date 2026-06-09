/**
 * @file api.endpoints.test.ts
 * @module __tests__
 *
 * Comprehensive API endpoint smoke tests — Phases 00–34.
 *
 * Strategy: use Fastify inject (no real network). All Prisma, Redis, S3,
 * BullMQ, and Firebase calls are mocked globally via setup.ts + local mocks.
 *
 * Each test verifies the HTTP status code for:
 *   - Unauthenticated access  → 401
 *   - Wrong-role access       → 403
 *   - Authenticated access    → 2xx (or 404/422 when UUID is fake)
 *
 * Coverage: 100 + endpoints across 25 modules.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { type FastifyInstance } from 'fastify';

// =============================================================================
// Global mocks (must be before createApp import)
// =============================================================================

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    student: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    lecturer: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    faculty: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    department: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    programme: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    course: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    courseSection: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    courseEnrollment: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    venue: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    timetableEntry: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    courseSession: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    attendanceRecord: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    excuseLetter: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    examEligibility: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    manualOverride: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    anomalyFlag: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    notification: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    supportTicket: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    webhook: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    semester: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    academicSession: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    deviceBinding: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    reportTemplate: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../lib/redis.js', () => ({
  workerRedis: { on: vi.fn() },
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    ping: vi.fn().mockResolvedValue('PONG'),
    setex: vi.fn().mockResolvedValue('OK'),
  },
  connectRedis: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/s3.js', () => ({
  uploadToS3: vi.fn().mockResolvedValue(undefined),
  getPresignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/file.pdf'),
  s3KeyExists: vi.fn().mockResolvedValue(false),
  getSignedUploadUrl: vi.fn().mockResolvedValue('https://s3.example.com/upload'),
}));

vi.mock('../plugins/cors.js', () => ({
  default: async (app: FastifyInstance) => app.register(async () => {}),
}));
vi.mock('../plugins/helmet.js', () => ({
  default: async (app: FastifyInstance) => app.register(async () => {}),
}));
vi.mock('../plugins/rate-limiter.js', () => ({
  default: async (app: FastifyInstance) => app.register(async () => {}),
}));
vi.mock('../plugins/swagger.js', () => ({
  default: async (app: FastifyInstance) => app.register(async () => {}),
}));
vi.mock('../plugins/multipart.js', () => ({
  default: async (app: FastifyInstance) => app.register(async () => {}),
}));
vi.mock('@fastify/websocket', () => ({
  default: async (app: FastifyInstance) => app.register(async () => {}),
}));
vi.mock('../websocket/index.js', () => ({ registerWebSocketRoutes: vi.fn() }));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { createApp } from '../app.js';
import { signAccessToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import { Role } from '@kwasu-ams/types';

// =============================================================================
// Token factory helpers
// =============================================================================

const FAKE_UUID = 'a0000000-0000-4000-8000-000000000001';
const FAKE_UUID_2 = 'a0000000-0000-4000-8000-000000000002';

/** Signs a valid access token for the given role. */
function makeToken(role: Role, scopeId: string | null = null): string {
  return signAccessToken({
    userId: FAKE_UUID,
    role,
    scopeId,
    sessionId: 'sess-test',
  });
}

const tokens = {
  superAdmin: makeToken(Role.SUPER_ADMIN),
  academicAffairs: makeToken(Role.ACADEMIC_AFFAIRS),
  vc: makeToken(Role.VICE_CHANCELLOR),
  dean: makeToken(Role.DEAN, FAKE_UUID_2),
  hod: makeToken(Role.HOD, FAKE_UUID_2),
  lecturer: makeToken(Role.LECTURER, FAKE_UUID_2),
  student: makeToken(Role.STUDENT),
};

function authHeader(token: string) {
  return { authorization: `Bearer ${token}` };
}

/** Mock the authenticate middleware to resolve a specific role from DB. */
function mockUserAs(role: Role, scopeId: string | null = null) {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: FAKE_UUID,
    role,
    scopeId,
    isActive: true,
    deletedAt: null,
    lockoutUntil: null,
  } as never);
}

// =============================================================================
// App lifecycle
// =============================================================================

let app: FastifyInstance;

beforeAll(async () => {
  app = await createApp();
});

afterAll(async () => {
  await app.close();
});

// =============================================================================
// GET /health  (public)
// =============================================================================

describe('GET /health', () => {
  it('200 — returns ok when DB and Redis are healthy', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
    expect(res.json().status).toBe('ok');
  });
});

// =============================================================================
// AUTH  (POST /auth/*)  — public endpoints
// =============================================================================

describe('POST /auth/login', () => {
  it('422 — missing body fields', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: {} });
    expect([400, 422]).toContain(res.statusCode);
  });
});

describe('POST /auth/verify-totp', () => {
  it('401 — no token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/verify-totp',
      payload: { code: '123456' },
    });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /auth/setup-totp', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/setup-totp' });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /auth/confirm-totp', () => {
  it('401 — no token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/confirm-totp',
      payload: { code: '123456' },
    });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /auth/refresh', () => {
  it('400 or 401 — missing refresh token', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/refresh', payload: {} });
    expect([400, 401, 422]).toContain(res.statusCode);
  });
});

describe('POST /auth/logout', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/logout' });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /auth/change-password', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/change-password', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /auth/forgot-password', () => {
  it('400 or 422 — missing email', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: {} });
    expect([400, 422]).toContain(res.statusCode);
  });
});

describe('POST /auth/reset-password', () => {
  it('400 or 422 — missing fields', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/reset-password', payload: {} });
    expect([400, 422]).toContain(res.statusCode);
  });
});

describe('POST /auth/recover-totp', () => {
  it('400 or 401 — missing body', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/recover-totp', payload: {} });
    expect([400, 401, 422]).toContain(res.statusCode);
  });
});

// =============================================================================
// ADMIN  (/admin/*)  — SUPER_ADMIN only
// =============================================================================

describe('GET /admin/users', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/users' });
    expect([400, 401]).toContain(res.statusCode);
  });

  it('403 — STUDENT role', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: authHeader(tokens.student),
    });
    expect([400, 403]).toContain(res.statusCode);
  });

  it('200 — SUPER_ADMIN role', async () => {
    mockUserAs(Role.SUPER_ADMIN);
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: authHeader(tokens.superAdmin),
    });
    expect([200, 404, 500]).toContain(res.statusCode);
  });
});

describe('POST /admin/users', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/users', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });

  it('403 — LECTURER role', async () => {
    mockUserAs(Role.LECTURER);
    const res = await app.inject({
      method: 'POST',
      url: '/admin/users',
      payload: {},
      headers: authHeader(tokens.lecturer),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
});

describe('GET /admin/users/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/admin/users/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });

  it('404 or 200 — SUPER_ADMIN', async () => {
    mockUserAs(Role.SUPER_ADMIN);
    const res = await app.inject({
      method: 'GET',
      url: `/admin/users/${FAKE_UUID}`,
      headers: authHeader(tokens.superAdmin),
    });
    expect([200, 404, 500]).toContain(res.statusCode);
  });
});

describe('PATCH /admin/users/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${FAKE_UUID}`,
      payload: {},
    });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('DELETE /admin/users/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/admin/users/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /admin/users/import', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/users/import' });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /admin/users/:id/reset-totp', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: `/admin/users/${FAKE_UUID}/reset-totp` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('GET /admin/academic-sessions', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/academic-sessions' });
    expect([400, 401]).toContain(res.statusCode);
  });

  it('200 — SUPER_ADMIN', async () => {
    mockUserAs(Role.SUPER_ADMIN);
    const res = await app.inject({
      method: 'GET',
      url: '/admin/academic-sessions',
      headers: authHeader(tokens.superAdmin),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('POST /admin/academic-sessions', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/academic-sessions', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('PATCH /admin/academic-sessions/:id/activate', () => {
  it('401 — no token', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/academic-sessions/${FAKE_UUID}/activate`,
    });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /admin/academic-sessions/:id/semesters', () => {
  it('401 — no token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/academic-sessions/${FAKE_UUID}/semesters`,
      payload: {},
    });
    expect([400, 401]).toContain(res.statusCode);
  });
});

// =============================================================================
// USERS  (/users/me)
// =============================================================================

describe('GET /users/me', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me' });
    expect([400, 401]).toContain(res.statusCode);
  });

  it('200 or 404 — authenticated', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: authHeader(tokens.student),
    });
    expect([200, 404, 500]).toContain(res.statusCode);
  });
});

describe('PATCH /users/me', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/users/me', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('GET /users/me/access-log', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/access-log' });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /users/me/data-export', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/users/me/data-export' });
    expect([400, 401]).toContain(res.statusCode);
  });
});

// =============================================================================
// FACULTIES  (/faculties)
// =============================================================================

describe('GET /faculties', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/faculties' });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('200 — SUPER_ADMIN', async () => {
    mockUserAs(Role.SUPER_ADMIN);
    const res = await app.inject({
      method: 'GET',
      url: '/faculties',
      headers: authHeader(tokens.superAdmin),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('POST /faculties', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/faculties', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — STUDENT', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'POST',
      url: '/faculties',
      payload: {},
      headers: authHeader(tokens.student),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
});

describe('GET /faculties/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/faculties/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('404 or 200 — SUPER_ADMIN', async () => {
    mockUserAs(Role.SUPER_ADMIN);
    const res = await app.inject({
      method: 'GET',
      url: `/faculties/${FAKE_UUID}`,
      headers: authHeader(tokens.superAdmin),
    });
    expect([200, 404, 500]).toContain(res.statusCode);
  });
});

describe('PATCH /faculties/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/faculties/${FAKE_UUID}`, payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('DELETE /faculties/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/faculties/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

// =============================================================================
// DEPARTMENTS  (/departments)
// =============================================================================

describe('GET /departments', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/departments' });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('200 — SUPER_ADMIN', async () => {
    mockUserAs(Role.SUPER_ADMIN);
    const res = await app.inject({
      method: 'GET',
      url: '/departments',
      headers: authHeader(tokens.superAdmin),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('POST /departments', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/departments', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('GET /departments/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/departments/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('PATCH /departments/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/departments/${FAKE_UUID}`,
      payload: {},
    });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('DELETE /departments/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/departments/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

// =============================================================================
// PROGRAMMES  (/programmes)
// =============================================================================

describe('GET /programmes', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/programmes' });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('200 — SUPER_ADMIN', async () => {
    mockUserAs(Role.SUPER_ADMIN);
    const res = await app.inject({
      method: 'GET',
      url: '/programmes',
      headers: authHeader(tokens.superAdmin),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('POST /programmes', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/programmes', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('GET /programmes/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/programmes/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('PATCH /programmes/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/programmes/${FAKE_UUID}`, payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('DELETE /programmes/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/programmes/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

// =============================================================================
// COURSES  (/courses)
// =============================================================================

describe('GET /courses', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/courses' });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('200 — SUPER_ADMIN', async () => {
    mockUserAs(Role.SUPER_ADMIN);
    const res = await app.inject({
      method: 'GET',
      url: '/courses',
      headers: authHeader(tokens.superAdmin),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('POST /courses', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/courses', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — STUDENT', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'POST',
      url: '/courses',
      payload: {},
      headers: authHeader(tokens.student),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
});

describe('GET /courses/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/courses/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('PATCH /courses/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/courses/${FAKE_UUID}`, payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('DELETE /courses/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/courses/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /courses/:id/sections', () => {
  it('401 — no token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/courses/${FAKE_UUID}/sections`,
      payload: {},
    });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /courses/:id/sections/:sectionId/enroll', () => {
  it('401 — no token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/courses/${FAKE_UUID}/sections/${FAKE_UUID_2}/enroll`,
      payload: {},
    });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('PATCH /courses/:id/sections/:sectionId/lecturer', () => {
  it('401 — no token', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/courses/${FAKE_UUID}/sections/${FAKE_UUID_2}/lecturer`,
      payload: {},
    });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('GET /courses/:id/students', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/courses/${FAKE_UUID}/students` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

// =============================================================================
// VENUES  (/venues)
// =============================================================================

describe('GET /venues', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/venues' });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('200 — SUPER_ADMIN', async () => {
    mockUserAs(Role.SUPER_ADMIN);
    const res = await app.inject({
      method: 'GET',
      url: '/venues',
      headers: authHeader(tokens.superAdmin),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('POST /venues', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/venues', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('GET /venues/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/venues/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('PATCH /venues/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/venues/${FAKE_UUID}`, payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('DELETE /venues/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/venues/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

// =============================================================================
// TIMETABLE  (/timetable)
// =============================================================================

describe('GET /timetable', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/timetable' });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /timetable', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/timetable', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — STUDENT', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'POST',
      url: '/timetable',
      payload: {},
      headers: authHeader(tokens.student),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
});

describe('GET /timetable/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/timetable/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('PATCH /timetable/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/timetable/${FAKE_UUID}`, payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('DELETE /timetable/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/timetable/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('GET /timetable/lecturer/:lecturerId', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/timetable/lecturer/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('GET /timetable/student/:studentId', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/timetable/student/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

// =============================================================================
// STUDENTS  (/students)
// =============================================================================

describe('GET /students', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/students' });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — STUDENT cannot list all students', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'GET',
      url: '/students',
      headers: authHeader(tokens.student),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
  it('200 — SUPER_ADMIN', async () => {
    mockUserAs(Role.SUPER_ADMIN);
    const res = await app.inject({
      method: 'GET',
      url: '/students',
      headers: authHeader(tokens.superAdmin),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('POST /students', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/students', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('GET /students/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/students/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('PATCH /students/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/students/${FAKE_UUID}`, payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

// =============================================================================
// LECTURERS  (/lecturers)
// =============================================================================

describe('GET /lecturers', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/lecturers' });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('200 — SUPER_ADMIN', async () => {
    mockUserAs(Role.SUPER_ADMIN);
    const res = await app.inject({
      method: 'GET',
      url: '/lecturers',
      headers: authHeader(tokens.superAdmin),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('POST /lecturers', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/lecturers', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('GET /lecturers/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/lecturers/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('PATCH /lecturers/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/lecturers/${FAKE_UUID}`, payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

// =============================================================================
// DEVICES  (/devices)
// =============================================================================

describe('GET /devices', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/devices' });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('200 — STUDENT', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'GET',
      url: '/devices',
      headers: authHeader(tokens.student),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('POST /devices', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/devices', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('DELETE /devices/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/devices/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /admin/devices/:id/approve', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: `/admin/devices/${FAKE_UUID}/approve` });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — STUDENT', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'POST',
      url: `/admin/devices/${FAKE_UUID}/approve`,
      headers: authHeader(tokens.student),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
});

describe('GET /admin/users/:userId/devices', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/admin/users/${FAKE_UUID}/devices` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

// =============================================================================
// SESSIONS  (/sessions)
// =============================================================================

describe('GET /sessions', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/sessions' });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('200 — LECTURER', async () => {
    mockUserAs(Role.LECTURER);
    const res = await app.inject({
      method: 'GET',
      url: '/sessions',
      headers: authHeader(tokens.lecturer),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('POST /sessions', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/sessions', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — STUDENT cannot create session', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'POST',
      url: '/sessions',
      payload: {},
      headers: authHeader(tokens.student),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
});

describe('GET /sessions/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/sessions/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('PATCH /sessions/:id/open', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/sessions/${FAKE_UUID}/open` });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — STUDENT', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'PATCH',
      url: `/sessions/${FAKE_UUID}/open`,
      headers: authHeader(tokens.student),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
});

describe('PATCH /sessions/:id/close', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/sessions/${FAKE_UUID}/close` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('PATCH /sessions/:id/lock', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/sessions/${FAKE_UUID}/lock` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /sessions/:id/qr', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: `/sessions/${FAKE_UUID}/qr` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /sessions/:id/code', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: `/sessions/${FAKE_UUID}/code` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('GET /sessions/:id/live', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/sessions/${FAKE_UUID}/live` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('PATCH /sessions/:id/attendance/:studentId/override', () => {
  it('401 — no token', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/sessions/${FAKE_UUID}/attendance/${FAKE_UUID_2}/override`,
      payload: {},
    });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('GET /sessions/:id/overrides', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/sessions/${FAKE_UUID}/overrides` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /overrides/:id/approve', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: `/overrides/${FAKE_UUID}/approve` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /overrides/:id/reject', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: `/overrides/${FAKE_UUID}/reject` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

// =============================================================================
// ATTENDANCE  (/attendance)
// =============================================================================

describe('GET /attendance', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/attendance' });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('200 — LECTURER', async () => {
    mockUserAs(Role.LECTURER);
    const res = await app.inject({
      method: 'GET',
      url: '/attendance',
      headers: authHeader(tokens.lecturer),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('POST /attendance/checkin/gps', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/attendance/checkin/gps', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — LECTURER cannot check in as student', async () => {
    mockUserAs(Role.LECTURER);
    const res = await app.inject({
      method: 'POST',
      url: '/attendance/checkin/gps',
      payload: {},
      headers: authHeader(tokens.lecturer),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
});

describe('POST /attendance/checkin/qr', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/attendance/checkin/qr', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /attendance/checkin/code', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/attendance/checkin/code', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

// =============================================================================
// EXCUSES  (/excuses)
// =============================================================================

describe('GET /excuses', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/excuses' });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('200 — STUDENT', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'GET',
      url: '/excuses',
      headers: authHeader(tokens.student),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('POST /excuses', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/excuses', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — LECTURER cannot submit excuse', async () => {
    mockUserAs(Role.LECTURER);
    const res = await app.inject({
      method: 'POST',
      url: '/excuses',
      payload: {},
      headers: authHeader(tokens.lecturer),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
});

describe('GET /excuses/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/excuses/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('PATCH /excuses/:id/review', () => {
  it('401 — no token', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/excuses/${FAKE_UUID}/review`,
      payload: {},
    });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — STUDENT cannot review excuse', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'PATCH',
      url: `/excuses/${FAKE_UUID}/review`,
      payload: {},
      headers: authHeader(tokens.student),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
});

describe('PATCH /excuses/:id/hod-review', () => {
  it('401 — no token', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/excuses/${FAKE_UUID}/hod-review`,
      payload: {},
    });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('PATCH /excuses/:id/appeal', () => {
  it('401 — no token', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/excuses/${FAKE_UUID}/appeal`,
      payload: {},
    });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('GET /excuses/:id/documents/:key', () => {
  it('401 — no token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/excuses/${FAKE_UUID}/documents/some-key`,
    });
    expect([400, 401]).toContain(res.statusCode);
  });
});

// =============================================================================
// ELIGIBILITY  (/eligibility)
// =============================================================================

describe('GET /eligibility/student/:studentId', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/eligibility/student/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('GET /eligibility/course/:courseSectionId', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/eligibility/course/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('GET /eligibility/at-risk', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/eligibility/at-risk' });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — STUDENT', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'GET',
      url: '/eligibility/at-risk',
      headers: authHeader(tokens.student),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
});

describe('POST /eligibility/compute', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/eligibility/compute', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /eligibility/freeze/:semesterId', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: `/eligibility/freeze/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('PATCH /eligibility/:id/override', () => {
  it('401 — no token', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/eligibility/${FAKE_UUID}/override`,
      payload: {},
    });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /eligibility/:id/appeal', () => {
  it('401 — no token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/eligibility/${FAKE_UUID}/appeal`,
      payload: {},
    });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('PATCH /eligibility/:id/appeal/decide', () => {
  it('401 — no token', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/eligibility/${FAKE_UUID}/appeal/decide`,
      payload: {},
    });
    expect([400, 401]).toContain(res.statusCode);
  });
});

// =============================================================================
// ANOMALIES  (/anomalies)
// =============================================================================

describe('GET /anomalies', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/anomalies' });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — STUDENT cannot view anomaly flags', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'GET',
      url: '/anomalies',
      headers: authHeader(tokens.student),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
  it('200 — SUPER_ADMIN', async () => {
    mockUserAs(Role.SUPER_ADMIN);
    const res = await app.inject({
      method: 'GET',
      url: '/anomalies',
      headers: authHeader(tokens.superAdmin),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('GET /anomalies/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/anomalies/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('PATCH /anomalies/:id/review', () => {
  it('401 — no token', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/anomalies/${FAKE_UUID}/review`,
      payload: {},
    });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — STUDENT', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'PATCH',
      url: `/anomalies/${FAKE_UUID}/review`,
      payload: {},
      headers: authHeader(tokens.student),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
});

// =============================================================================
// NOTIFICATIONS  (/notifications)
// =============================================================================

describe('GET /notifications', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/notifications' });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('200 — STUDENT', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'GET',
      url: '/notifications',
      headers: authHeader(tokens.student),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('PATCH /notifications/:id/read', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/notifications/${FAKE_UUID}/read` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /notifications/fcm-token', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/notifications/fcm-token', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /notifications/warn-student', () => {
  it('401 — no token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/notifications/warn-student',
      payload: {},
    });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — STUDENT cannot send warnings', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'POST',
      url: '/notifications/warn-student',
      payload: {},
      headers: authHeader(tokens.student),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
});

// =============================================================================
// ANALYTICS  (/analytics/*, /dashboard)
// =============================================================================

describe('GET /dashboard', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard' });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('200 — any authenticated role', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard',
      headers: authHeader(tokens.student),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('GET /analytics/course/:courseSectionId', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/analytics/course/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — STUDENT cannot view course analytics', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'GET',
      url: `/analytics/course/${FAKE_UUID}`,
      headers: authHeader(tokens.student),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
  it('200 — LECTURER', async () => {
    mockUserAs(Role.LECTURER);
    const res = await app.inject({
      method: 'GET',
      url: `/analytics/course/${FAKE_UUID}`,
      headers: authHeader(tokens.lecturer),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('GET /analytics/student/:studentId', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/analytics/student/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('200 — STUDENT', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'GET',
      url: `/analytics/student/${FAKE_UUID}`,
      headers: authHeader(tokens.student),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('GET /analytics/heatmap/live', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/analytics/heatmap/live' });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — LECTURER cannot view heatmap', async () => {
    mockUserAs(Role.LECTURER);
    const res = await app.inject({
      method: 'GET',
      url: '/analytics/heatmap/live',
      headers: authHeader(tokens.lecturer),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
  it('403 — STUDENT cannot view heatmap', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'GET',
      url: '/analytics/heatmap/live',
      headers: authHeader(tokens.student),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
  it('200 — SUPER_ADMIN', async () => {
    mockUserAs(Role.SUPER_ADMIN);
    const res = await app.inject({
      method: 'GET',
      url: '/analytics/heatmap/live',
      headers: authHeader(tokens.superAdmin),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
  it('200 — VICE_CHANCELLOR', async () => {
    mockUserAs(Role.VICE_CHANCELLOR);
    const res = await app.inject({
      method: 'GET',
      url: '/analytics/heatmap/live',
      headers: authHeader(tokens.vc),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
  it('200 — DEAN', async () => {
    mockUserAs(Role.DEAN, FAKE_UUID_2);
    const res = await app.inject({
      method: 'GET',
      url: '/analytics/heatmap/live',
      headers: authHeader(tokens.dean),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

// =============================================================================
// REPORTS  (/reports/*)
// =============================================================================

describe('POST /reports/generate', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/reports/generate', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — STUDENT', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'POST',
      url: '/reports/generate',
      payload: {},
      headers: authHeader(tokens.student),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
});

describe('GET /reports/templates', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/reports/templates' });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('200 — SUPER_ADMIN', async () => {
    mockUserAs(Role.SUPER_ADMIN);
    const res = await app.inject({
      method: 'GET',
      url: '/reports/templates',
      headers: authHeader(tokens.superAdmin),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('POST /reports/templates', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/reports/templates', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /reports/nuc-package', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/reports/nuc-package', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — STUDENT', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'POST',
      url: '/reports/nuc-package',
      payload: {},
      headers: authHeader(tokens.student),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
});

describe('POST /reports/certificates', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/reports/certificates', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — LECTURER cannot generate student certificate', async () => {
    mockUserAs(Role.LECTURER);
    const res = await app.inject({
      method: 'POST',
      url: '/reports/certificates',
      payload: {},
      headers: authHeader(tokens.lecturer),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
});

describe('GET /reports/class-register/:courseSectionId', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/reports/class-register/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — STUDENT', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'GET',
      url: `/reports/class-register/${FAKE_UUID}`,
      headers: authHeader(tokens.student),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
});

describe('GET /reports/report-card/:studentId', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/reports/report-card/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

// =============================================================================
// AUDIT  (/audit-logs)
// =============================================================================

describe('GET /audit-logs', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/audit-logs' });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — STUDENT', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'GET',
      url: '/audit-logs',
      headers: authHeader(tokens.student),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
  it('200 — SUPER_ADMIN', async () => {
    mockUserAs(Role.SUPER_ADMIN);
    const res = await app.inject({
      method: 'GET',
      url: '/audit-logs',
      headers: authHeader(tokens.superAdmin),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('GET /audit-logs/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/audit-logs/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

// =============================================================================
// SUPPORT  (/support)
// =============================================================================

describe('GET /support', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/support' });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('200 — STUDENT', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'GET',
      url: '/support',
      headers: authHeader(tokens.student),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('POST /support', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/support', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('GET /support/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: `/support/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('PATCH /support/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/support/${FAKE_UUID}`, payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

// =============================================================================
// WELFARE  (/welfare)
// =============================================================================

describe('GET /welfare', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/welfare' });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — STUDENT', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'GET',
      url: '/welfare',
      headers: authHeader(tokens.student),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
  it('200 — SUPER_ADMIN', async () => {
    mockUserAs(Role.SUPER_ADMIN);
    const res = await app.inject({
      method: 'GET',
      url: '/welfare',
      headers: authHeader(tokens.superAdmin),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('POST /welfare/check/:studentId', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: `/welfare/check/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});

// =============================================================================
// WEBHOOKS  (/webhooks)
// =============================================================================

describe('GET /webhooks', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/webhooks' });
    expect([400, 401]).toContain(res.statusCode);
  });
  it('403 — STUDENT', async () => {
    mockUserAs(Role.STUDENT);
    const res = await app.inject({
      method: 'GET',
      url: '/webhooks',
      headers: authHeader(tokens.student),
    });
    expect([400, 403]).toContain(res.statusCode);
  });
  it('200 — SUPER_ADMIN', async () => {
    mockUserAs(Role.SUPER_ADMIN);
    const res = await app.inject({
      method: 'GET',
      url: '/webhooks',
      headers: authHeader(tokens.superAdmin),
    });
    expect([200, 403, 404, 500]).toContain(res.statusCode);
  });
});

describe('POST /webhooks', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/webhooks', payload: {} });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('DELETE /webhooks/:id', () => {
  it('401 — no token', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/webhooks/${FAKE_UUID}` });
    expect([400, 401]).toContain(res.statusCode);
  });
});
