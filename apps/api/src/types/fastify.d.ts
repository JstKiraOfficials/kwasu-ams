/**
 * @file fastify.d.ts
 * @module types
 *
 * Fastify type augmentation for KWASU AMS.
 *
 * Extends `FastifyRequest` with a `user` property that is populated by the
 * `authenticate` middleware after successful JWT verification. All route
 * handlers that run after `authenticate` can access `request.user` with full
 * TypeScript type safety.
 *
 * `user` is `undefined` on public routes (no `authenticate` preHandler).
 */

import 'fastify';
import { type Role } from '@kwasu-ams/types';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Authenticated user context attached by the `authenticate` preHandler.
     * `undefined` on public routes that do not require authentication.
     */
    user:
      | {
          userId: string;
          role: Role;
          scopeId: string | null;
          sessionId: string;
        }
      | undefined;
  }
}
