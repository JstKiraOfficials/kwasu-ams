import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type FastifyRequest, type FastifyReply } from 'fastify';
import { requireScope } from '../scope-guard.js';
import { Role } from '@kwasu-ams/types';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    department: { findFirst: vi.fn() },
    course: { findFirst: vi.fn() },
    student: { findFirst: vi.fn() },
    lecturer: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    courseEnrollment: { findFirst: vi.fn() },
  },
}));

function makeReply(): FastifyReply {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply as unknown as FastifyReply;
}

function makeRequest(
  role: Role,
  scopeId: string | null,
  params: Record<string, string> = {},
  userId = 'user-1',
): FastifyRequest {
  return {
    user: { userId, role, scopeId, sessionId: 'sess-1' },
    params,
    body: null,
  } as unknown as FastifyRequest;
}

describe('requireScope middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── SUPER_ADMIN bypass ────────────────────────────────────────────────────

  it('SUPER_ADMIN passes through without any DB query', async () => {
    const guard = requireScope('department');
    const request = makeRequest(Role.SUPER_ADMIN, null, { departmentId: 'dept-1' });
    const reply = makeReply();

    await guard(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });

  // ── Department scope ──────────────────────────────────────────────────────

  it('HOD accessing their own department passes through', async () => {
    const guard = requireScope('department');
    const request = makeRequest(Role.HOD, 'dept-1', { departmentId: 'dept-1' });
    const reply = makeReply();

    await guard(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });

  it('HOD accessing a different department returns 403', async () => {
    const guard = requireScope('department');
    const request = makeRequest(Role.HOD, 'dept-1', { departmentId: 'dept-2' });
    const reply = makeReply();

    await guard(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it('DEAN accessing department in their faculty passes through', async () => {
    const { prisma } = await import('../../lib/prisma.js');
    vi.mocked(prisma.department.findFirst).mockResolvedValueOnce({ id: 'dept-1' } as never);

    const guard = requireScope('department');
    const request = makeRequest(Role.DEAN, 'faculty-1', { departmentId: 'dept-1' });
    const reply = makeReply();

    await guard(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });

  it('DEAN accessing department in a different faculty returns 403', async () => {
    const { prisma } = await import('../../lib/prisma.js');
    vi.mocked(prisma.department.findFirst).mockResolvedValueOnce(null);

    const guard = requireScope('department');
    const request = makeRequest(Role.DEAN, 'faculty-1', { departmentId: 'dept-other' });
    const reply = makeReply();

    await guard(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
  });

  // ── Student scope ─────────────────────────────────────────────────────────

  it('STUDENT accessing their own record passes through', async () => {
    const { prisma } = await import('../../lib/prisma.js');
    vi.mocked(prisma.student.findFirst).mockResolvedValueOnce({ id: 'student-1' } as never);

    const guard = requireScope('student');
    const request = makeRequest(Role.STUDENT, null, { studentId: 'student-1' }, 'user-1');
    const reply = makeReply();

    await guard(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });

  it('STUDENT accessing a different student record returns 403', async () => {
    const { prisma } = await import('../../lib/prisma.js');
    vi.mocked(prisma.student.findFirst).mockResolvedValueOnce(null);

    const guard = requireScope('student');
    const request = makeRequest(Role.STUDENT, null, { studentId: 'student-other' }, 'user-1');
    const reply = makeReply();

    await guard(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
  });

  // ── Faculty scope ─────────────────────────────────────────────────────────

  it('DEAN accessing their own faculty passes through', async () => {
    const guard = requireScope('faculty');
    const request = makeRequest(Role.DEAN, 'faculty-1', { facultyId: 'faculty-1' });
    const reply = makeReply();

    await guard(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });

  it('DEAN accessing a different faculty returns 403', async () => {
    const guard = requireScope('faculty');
    const request = makeRequest(Role.DEAN, 'faculty-1', { facultyId: 'faculty-2' });
    const reply = makeReply();

    await guard(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
  });
});
