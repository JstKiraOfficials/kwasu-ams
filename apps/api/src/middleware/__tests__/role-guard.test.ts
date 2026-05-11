import { describe, it, expect, vi } from 'vitest';
import { type FastifyRequest, type FastifyReply } from 'fastify';
import { requireRoles } from '../role-guard.js';
import { Role } from '@kwasu-ams/types';

function makeReply(): FastifyReply {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply as unknown as FastifyReply;
}

function makeRequest(role?: Role): FastifyRequest {
  return {
    user: role ? { userId: 'user-1', role, scopeId: null, sessionId: 'sess-1' } : undefined,
  } as unknown as FastifyRequest;
}

describe('requireRoles middleware', () => {
  it('passes through when user has the required role (SUPER_ADMIN)', async () => {
    const guard = requireRoles(Role.SUPER_ADMIN);
    const request = makeRequest(Role.SUPER_ADMIN);
    const reply = makeReply();

    await guard(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });

  it('returns 403 when user does not have the required role', async () => {
    const guard = requireRoles(Role.SUPER_ADMIN);
    const request = makeRequest(Role.LECTURER);
    const reply = makeReply();

    await guard(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    const body = vi.mocked(reply.send).mock.calls[0]?.[0] as { errors: Array<{ code: string }> };
    expect(body.errors[0]?.code).toBe('FORBIDDEN');
  });

  it('passes through when user has one of multiple allowed roles (HOD)', async () => {
    const guard = requireRoles(Role.HOD, Role.DEAN);
    const request = makeRequest(Role.HOD);
    const reply = makeReply();

    await guard(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });

  it('returns 403 when user role is not in the allowed list', async () => {
    const guard = requireRoles(Role.HOD, Role.DEAN);
    const request = makeRequest(Role.STUDENT);
    const reply = makeReply();

    await guard(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it('returns 401 when request.user is undefined (authenticate not run)', async () => {
    const guard = requireRoles(Role.SUPER_ADMIN);
    const request = makeRequest(undefined);
    const reply = makeReply();

    await guard(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
  });
});
