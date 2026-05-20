/**
 * @file anomalies.controller.ts
 * @module modules/anomalies
 *
 * Thin HTTP controller layer for the anomaly flags module.
 *
 * Each handler extracts validated data from the request, delegates to the
 * service layer, and returns the appropriate HTTP response.
 * No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { type Role } from '@kwasu-ams/types';
import { ListAnomaliesQuerySchema, ReviewAnomalySchema } from './anomalies.schema.js';
import * as anomaliesService from './anomalies.service.js';

/**
 * Handles `GET /anomalies`.
 *
 * Returns a paginated, scope-aware list of anomaly flags.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Query: `{ sessionId?, studentId?, flagType?, isReviewed?, page?, pageSize? }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function listAnomalyFlagsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = ListAnomaliesQuerySchema.parse(request.query);
  const result = await anomaliesService.listAnomalyFlags(
    query,
    request.user!.role as Role,
    request.user!.scopeId ?? null,
    request.user!.userId,
  );
  void reply.status(200).send(result);
}

/**
 * Handles `GET /anomalies/:id`.
 *
 * Returns a single anomaly flag by UUID with full nested details.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the anomaly flag.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — anomaly flag does not exist.
 */
export async function getAnomalyFlagByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const result = await anomaliesService.getAnomalyFlagById(id);
  void reply.status(200).send(result);
}

/**
 * Handles `PATCH /anomalies/:id/review`.
 *
 * Reviews an anomaly flag. Validates the request body against `ReviewAnomalySchema`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the anomaly flag.
 *                  Body: `{ action, note }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — anomaly flag does not exist.
 * @throws {AppError} `CONFLICT` (409) — flag has already been reviewed.
 */
export async function reviewAnomalyFlagHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const data = ReviewAnomalySchema.parse(request.body);
  const result = await anomaliesService.reviewAnomalyFlag(id, data, request.user!.userId);
  void reply.status(200).send(result);
}
