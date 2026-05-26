/**
 * @file users.controller.ts
 * @module modules/users
 *
 * Thin HTTP controller layer for the users module.
 * No business logic lives here — delegates entirely to the service layer.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { UpdateProfileSchema, AccessLogQuerySchema } from './users.schema.js';
import { getCurrentUser, updateProfile, requestDataExport, getAccessLog } from './users.service.js';

/**
 * Handles `GET /users/me`.
 *
 * Returns the authenticated user's public profile without sensitive fields.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 * @param reply   - Fastify reply used to send the HTTP response.
 */
export async function getCurrentUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const result = await getCurrentUser(request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `PATCH /users/me`.
 *
 * Updates allowed profile fields and returns the updated public profile.
 *
 * @param request - Fastify request. Body validated by {@link UpdateProfileSchema}.
 * @param reply   - Fastify reply used to send the HTTP response.
 */
export async function updateProfileHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const data = UpdateProfileSchema.parse(request.body);
  const result = await updateProfile(request.user!.userId, data);
  void reply.status(200).send(result);
}

/**
 * Handles `POST /users/me/data-export`.
 *
 * Triggers NDPA right-of-access data export. Generates a PDF of all personal
 * data and sends it to the user's registered email address.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 * @param reply   - Fastify reply used to send the HTTP response.
 */
export async function requestDataExportHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const result = await requestDataExport(request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `GET /users/me/access-log`.
 *
 * Returns a paginated transparency log of who accessed the user's
 * attendance-related records.
 *
 * @param request - Fastify request. Query params validated by {@link AccessLogQuerySchema}.
 * @param reply   - Fastify reply used to send the HTTP response.
 */
export async function getAccessLogHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = AccessLogQuerySchema.parse(request.query);
  const result = await getAccessLog(request.user!.userId, query);
  void reply.status(200).send(result);
}
