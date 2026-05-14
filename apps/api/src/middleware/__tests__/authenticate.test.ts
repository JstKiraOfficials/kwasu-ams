/**
 * @file authenticate.test.ts
 * @module middleware/__tests__
 *
 * Unit tests for the `authenticate` Fastify preHandler.
 * All external dependencies (Prisma) are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type FastifyRequest, type FastifyReply } from 'fastify';
import { authenticate } from '../authenticate.js';
import { signAccessToken } from '../../lib/jwt.js';
import { Role } from '@kwasu-ams/types';

// Mock prisma
vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

const VALID_PAYLOAD = {
  userId: 'user-123',
  role: Role.STUDENT,
  scopeId: null,
  sessionId: 'session-abc',
};

function makeReply(): FastifyReply {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply as unknown as FastifyReply;
}

function makeRequest(authHeader?: string): FastifyRequest {
  return {
    headers: { authorization: authHeader },
    user: undefined,
  } as unknown as FastifyRequest;
}

describe('authenticate middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets request.user for a valid token with active user', async () => {
    const { prisma } = await import('../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'user-123',
      role: 'STUDENT',
      scopeId: null,
      isActive: true,
      deletedAt: null,
      lockoutUntil: null,
    } as never);

    const token = signAccessToken(VALID_PAYLOAD);
    const request = makeRequest(`Bearer ${token}`);
    const reply = makeReply();

    await authenticate(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(request.user).toMatchObject({
      userId: 'user-123',
      role: Role.STUDENT,
      scopeId: null,
    });
  });

  it('returns 401 with TOKEN_EXPIRED for an expired token', async () => {
    // Create a token that expires immediately
    const jwt = await import('jsonwebtoken');
    const { env } = await import('../../config/env.js');
    const expiredToken = jwt.default.sign({ ...VALID_PAYLOAD }, env.JWT_ACCESS_SECRET, {
      expiresIn: -1,
    });

    const request = makeRequest(`Bearer ${expiredToken}`);
    const reply = makeReply();

    await authenticate(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    const sentBody = vi.mocked(reply.send).mock.calls[0]?.[0] as {
      errors: Array<{ code: string }>;
    };
    expect(sentBody.errors[0]?.code).toBe('TOKEN_EXPIRED');
  });

  it('returns 401 with UNAUTHORIZED for a tampered token', async () => {
    const token = signAccessToken(VALID_PAYLOAD);
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.invalidsig`;

    const request = makeRequest(`Bearer ${tampered}`);
    const reply = makeReply();

    await authenticate(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    const sentBody = vi.mocked(reply.send).mock.calls[0]?.[0] as {
      errors: Array<{ code: string }>;
    };
    expect(sentBody.errors[0]?.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when Authorization header is missing', async () => {
    const request = makeRequest(undefined);
    const reply = makeReply();

    await authenticate(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when user is not found in DB', async () => {
    const { prisma } = await import('../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const token = signAccessToken(VALID_PAYLOAD);
    const request = makeRequest(`Bearer ${token}`);
    const reply = makeReply();

    await authenticate(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when user isActive is false', async () => {
    const { prisma } = await import('../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'user-123',
      isActive: false,
      deletedAt: null,
      lockoutUntil: null,
    } as never);

    const token = signAccessToken(VALID_PAYLOAD);
    const request = makeRequest(`Bearer ${token}`);
    const reply = makeReply();

    await authenticate(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 with ACCOUNT_LOCKED when lockoutUntil is in the future', async () => {
    const { prisma } = await import('../../lib/prisma.js');
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'user-123',
      isActive: true,
      deletedAt: null,
      lockoutUntil: new Date(Date.now() + 15 * 60 * 1000), // 15 min from now
    } as never);

    const token = signAccessToken(VALID_PAYLOAD);
    const request = makeRequest(`Bearer ${token}`);
    const reply = makeReply();

    await authenticate(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    const sentBody = vi.mocked(reply.send).mock.calls[0]?.[0] as {
      errors: Array<{ code: string }>;
    };
    expect(sentBody.errors[0]?.code).toBe('ACCOUNT_LOCKED');
  });
});
