/**
 * @file authenticate.ts
 * @module middleware
 *
 * Fastify preHandler that verifies the JWT Bearer token on every protected route.
 *
 * Supports both full access tokens (carrying role/scopeId/sessionId) and interim
 * tokens (carrying only userId, issued after password verification before TOTP).
 * When role/scopeId are absent from the token, they are resolved from the database.
 *
 * Security invariant: all 401 responses use the generic "Authentication required."
 * message regardless of the specific failure reason, preventing information leakage.
 *
 * Guard chain position: authenticate → role-guard → scope-guard
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { verifyAccessToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import { isOk } from '@kwasu-ams/utils';

/**
 * Sends a generic 401 Unauthorized response.
 * The message is always "Authentication required." regardless of the failure reason.
 *
 * @param reply - Fastify reply to send the response on.
 * @param code  - Machine-readable error code. Defaults to `'UNAUTHORIZED'`.
 */
function unauthorized(reply: FastifyReply, code = 'UNAUTHORIZED'): void {
  void reply.status(401).send({
    errors: [{ code, message: 'Authentication required.' }],
    statusCode: 401,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Fastify preHandler that verifies the JWT Bearer token and attaches the
 * authenticated user context to `request.user`.
 *
 * Handles both full access tokens and interim tokens (issued after password
 * verification, before TOTP). Role and scopeId are always resolved from the
 * database to ensure correctness even for interim tokens.
 *
 * Must run before `requireRoles` and `requireScope` in the preHandler chain.
 * Public endpoints must NOT include this handler.
 *
 * @param request - Fastify request. `request.user` is set on success.
 * @param reply   - Fastify reply used to send 401 responses on failure.
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    unauthorized(reply);
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer "
  const result = verifyAccessToken(token);

  if (!isOk(result)) {
    unauthorized(reply, result.error === 'TOKEN_EXPIRED' ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED');
    return;
  }

  const payload = result.value;

  // Verify the user still exists, is active, and is not locked.
  // Also fetch role and scopeId — interim tokens don't carry these fields,
  // so we always resolve them from the database for correctness.
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      role: true,
      scopeId: true,
      isActive: true,
      deletedAt: true,
      lockoutUntil: true,
    },
  });

  if (!user || !user.isActive || user.deletedAt !== null) {
    unauthorized(reply);
    return;
  }

  if (user.lockoutUntil !== null && user.lockoutUntil > new Date()) {
    unauthorized(reply, 'ACCOUNT_LOCKED');
    return;
  }

  request.user = {
    userId: payload.userId,
    // Use DB role — interim tokens don't carry role/scopeId in the payload
    role: (payload.role ?? user.role) as import('@kwasu-ams/types').Role,
    scopeId: payload.scopeId ?? user.scopeId,
    sessionId: payload.sessionId ?? '',
  };
}
