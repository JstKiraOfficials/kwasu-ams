/**
 * @file analytics.controller.ts
 * @module modules/analytics
 *
 * Thin HTTP controller layer for the analytics module.
 * No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { type Role } from '@kwasu-ams/types';
import { getDashboardData } from './analytics.service.js';

/**
 * Handles `GET /dashboard`.
 *
 * Returns role-scoped dashboard data for the authenticated user.
 * Results are cached in Redis with a 60-second TTL.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function getDashboardHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const result = await getDashboardData(
    request.user!.userId,
    request.user!.role as Role,
    request.user!.scopeId ?? null,
  );
  void reply.status(200).send(result);
}
