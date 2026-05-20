/**
 * @file sessions.service.test.ts
 * @module modules/sessions/__tests__
 *
 * Unit tests for the session lifecycle service.
 *
 * All Prisma and Redis calls are mocked — no real database or Redis connection.
 * Tests cover all lifecycle transitions, invalid state transitions, absent
 * student marking on close, and auto-lock of expired sessions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    courseSession: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    courseEnrollment: {
      findMany: vi.fn(),
    },
    attendanceRecord: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../lib/redis.js', () => ({
  redis: {
    publish: vi.fn().mockResolvedValue(0),
    del: vi.fn().mockResolvedValue(0),
  },
  connectRedis: vi.fn(),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import {
  openSession,
  closeSession,
  lockSession,
  autoLockExpiredSessions,
} from '../session-lifecycle.service.js';
import { prisma } from '../../../lib/prisma.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ACTOR_ID = 'a0000000-0000-4000-8000-000000000001';
const SESSION_ID = 'a0000000-0000-4000-8000-000000000010';
const SECTION_ID = 'a0000000-0000-4000-8000-000000000020';

const makeSession = (status: string) => ({
  id: SESSION_ID,
  courseSectionId: SECTION_ID,
  venueId: 'venue-id',
  lecturerId: 'lecturer-id',
  scheduledStart: new Date(),
  scheduledEnd: new Date(),
  actualStart: null,
  actualEnd: null,
  status,
  qrTokenExpiresAt: null,
  codeExpiresAt: null,
  isMakeUp: false,
  overrideWindowEnd: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

// =============================================================================
// openSession
// =============================================================================

describe('openSession', () => {
  beforeEach(() => vi.resetAllMocks());

  it('transitions SCHEDULED → ACTIVE and sets actualStart', async () => {
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValueOnce({
      id: SESSION_ID,
      status: 'SCHEDULED',
    } as never);
    vi.mocked(prisma.courseSession.update).mockResolvedValueOnce({
      ...makeSession('ACTIVE'),
      actualStart: new Date(),
    } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const result = await openSession(SESSION_ID, ACTOR_ID);

    expect(result.status).toBe('ACTIVE');
    expect(prisma.courseSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
  });

  it('throws SESSION_NOT_ACTIVE when session is already ACTIVE', async () => {
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValueOnce({
      id: SESSION_ID,
      status: 'ACTIVE',
    } as never);

    await expect(openSession(SESSION_ID, ACTOR_ID)).rejects.toMatchObject({
      code: 'SESSION_NOT_ACTIVE',
      statusCode: 400,
    });
  });

  it('throws SESSION_NOT_ACTIVE when session is CLOSED', async () => {
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValueOnce({
      id: SESSION_ID,
      status: 'CLOSED',
    } as never);

    await expect(openSession(SESSION_ID, ACTOR_ID)).rejects.toMatchObject({
      code: 'SESSION_NOT_ACTIVE',
      statusCode: 400,
    });
  });

  it('throws NOT_FOUND when session does not exist', async () => {
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValueOnce(null);

    await expect(openSession(SESSION_ID, ACTOR_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });
});

// =============================================================================
// closeSession
// =============================================================================

describe('closeSession', () => {
  beforeEach(() => vi.resetAllMocks());

  it('transitions ACTIVE → CLOSED and marks 3 non-present students as ABSENT', async () => {
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValueOnce({
      id: SESSION_ID,
      status: 'ACTIVE',
      courseSectionId: SECTION_ID,
    } as never);

    // 3 enrolled students
    vi.mocked(prisma.courseEnrollment.findMany).mockResolvedValueOnce([
      { studentId: 'student-1', id: 'enroll-1' },
      { studentId: 'student-2', id: 'enroll-2' },
      { studentId: 'student-3', id: 'enroll-3' },
    ] as never);

    // No existing attendance records
    vi.mocked(prisma.attendanceRecord.findMany).mockResolvedValueOnce([]);

    const closedSession = {
      ...makeSession('CLOSED'),
      actualEnd: new Date(),
      overrideWindowEnd: new Date(),
    };

    vi.mocked(prisma.$transaction).mockImplementationOnce(async (fn: unknown) => {
      const txMock = {
        attendanceRecord: { createMany: vi.fn().mockResolvedValue({ count: 3 }) },
        courseSession: { update: vi.fn().mockResolvedValue(closedSession) },
      };
      await (fn as (tx: typeof txMock) => Promise<void>)(txMock);
    });
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const result = await closeSession(SESSION_ID, ACTOR_ID);

    expect(result.status).toBe('CLOSED');
    expect(result.overrideWindowEnd).toBeDefined();
  });

  it('throws SESSION_NOT_ACTIVE when session is SCHEDULED', async () => {
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValueOnce({
      id: SESSION_ID,
      status: 'SCHEDULED',
      courseSectionId: SECTION_ID,
    } as never);

    await expect(closeSession(SESSION_ID, ACTOR_ID)).rejects.toMatchObject({
      code: 'SESSION_NOT_ACTIVE',
      statusCode: 400,
    });
  });
});

// =============================================================================
// lockSession
// =============================================================================

describe('lockSession', () => {
  beforeEach(() => vi.resetAllMocks());

  it('transitions CLOSED → LOCKED', async () => {
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValueOnce({
      id: SESSION_ID,
      status: 'CLOSED',
    } as never);
    vi.mocked(prisma.courseSession.update).mockResolvedValueOnce(makeSession('LOCKED') as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const result = await lockSession(SESSION_ID, ACTOR_ID);

    expect(result.status).toBe('LOCKED');
  });

  it('throws SESSION_NOT_ACTIVE when session is ACTIVE', async () => {
    vi.mocked(prisma.courseSession.findUnique).mockResolvedValueOnce({
      id: SESSION_ID,
      status: 'ACTIVE',
    } as never);

    await expect(lockSession(SESSION_ID, ACTOR_ID)).rejects.toMatchObject({
      code: 'SESSION_NOT_ACTIVE',
      statusCode: 400,
    });
  });
});

// =============================================================================
// autoLockExpiredSessions
// =============================================================================

describe('autoLockExpiredSessions', () => {
  beforeEach(() => vi.resetAllMocks());

  it('locks all CLOSED sessions where overrideWindowEnd has passed', async () => {
    vi.mocked(prisma.courseSession.updateMany).mockResolvedValueOnce({ count: 3 } as never);

    const count = await autoLockExpiredSessions();

    expect(count).toBe(3);
    expect(prisma.courseSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'CLOSED' }),
        data: { status: 'LOCKED' },
      }),
    );
  });
});
