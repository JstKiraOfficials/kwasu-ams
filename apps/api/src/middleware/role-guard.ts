import { type FastifyReply, type FastifyRequest } from 'fastify';
import { Role } from '@kwasu-ams/types';

/**
 * Factory that returns a Fastify preHandler enforcing role-based access control.
 * Must run after `authenticate`.
 *
 * Usage: `preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN, Role.HOD)]`
 */
export function requireRoles(
  ...roles: Role[]
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async function roleGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      void reply.status(401).send({
        errors: [{ code: 'UNAUTHORIZED', message: 'Authentication required.' }],
        statusCode: 401,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!roles.includes(request.user.role)) {
      void reply.status(403).send({
        errors: [{ code: 'FORBIDDEN', message: 'Insufficient permissions.' }],
        statusCode: 403,
        timestamp: new Date().toISOString(),
      });
      return;
    }
  };
}
