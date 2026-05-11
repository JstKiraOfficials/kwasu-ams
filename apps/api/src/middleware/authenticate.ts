import { type FastifyReply, type FastifyRequest } from 'fastify';
import { verifyAccessToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import { isOk } from '@kwasu-ams/utils';

// Generic 401 response — never reveals whether the user exists
const UNAUTHORIZED_RESPONSE = {
  errors: [{ code: 'UNAUTHORIZED', message: 'Authentication required.' }],
  statusCode: 401,
  timestamp: '',
};

function unauthorized(reply: FastifyReply, code = 'UNAUTHORIZED'): void {
  void reply.status(401).send({
    errors: [{ code, message: 'Authentication required.' }],
    statusCode: 401,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Fastify preHandler — verifies the JWT access token and attaches the user
 * context to `request.user`. Must run before role-guard and scope-guard.
 *
 * Public endpoints must NOT include this in their preHandler array.
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

  // Verify the user still exists, is active, and is not locked
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, isActive: true, deletedAt: true, lockoutUntil: true },
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
    role: payload.role,
    scopeId: payload.scopeId,
    sessionId: payload.sessionId,
  };
}

// Suppress unused variable warning for the fallback object
void UNAUTHORIZED_RESPONSE;
