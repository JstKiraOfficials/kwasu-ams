/**
 * @file sessions.controller.ts
 * @module modules/sessions
 *
 * Thin HTTP controller layer for the sessions module.
 *
 * Each handler extracts validated data from the request, delegates to the
 * service layer, and returns the appropriate HTTP response.
 * No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { type Role } from '@kwasu-ams/types';
import { CreateSessionSchema, ListSessionsQuerySchema } from './sessions.schema.js';
import * as sessionsService from './sessions.service.js';
import * as lifecycleService from './session-lifecycle.service.js';

/**
 * Handles `GET /sessions`.
 *
 * Returns a paginated, scope-aware list of sessions.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Query: `{ courseSectionId?, status?, startDate?, endDate?, page?, pageSize? }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function listSessionsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = ListSessionsQuerySchema.parse(request.query);
  const result = await sessionsService.listSessions(
    query,
    request.user!.role as Role,
    request.user!.scopeId ?? null,
    request.user!.userId,
  );
  void reply.status(200).send(result);
}

/**
 * Handles `GET /sessions/:id`.
 *
 * Returns a single session by UUID with attendance counts.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the session.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — session does not exist.
 */
export async function getSessionByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const result = await sessionsService.getSessionById(id);
  void reply.status(200).send(result);
}

/**
 * Handles `POST /sessions`.
 *
 * Creates a new session. Validates the request body against `CreateSessionSchema`.
 * The lecturer ID is resolved from the authenticated user's linked lecturer record.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Body: `CreateSessionSchema`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — course section or venue does not exist.
 * @throws {AppError} `FORBIDDEN` (403) — lecturer not assigned to this section.
 */
export async function createSessionHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const data = CreateSessionSchema.parse(request.body);
  // For LECTURER role, lecturerId is resolved from the user's linked lecturer record
  // For SUPER_ADMIN/HOD, we use the userId as a fallback (service bypasses the check)
  const result = await sessionsService.createSession(
    data,
    request.user!.userId,
    request.user!.userId,
    request.user!.role as Role,
  );
  void reply.status(201).send(result);
}

/**
 * Handles `PATCH /sessions/:id/open`.
 *
 * Transitions a session from `SCHEDULED` to `ACTIVE`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the session.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — session does not exist.
 * @throws {AppError} `SESSION_NOT_ACTIVE` (400) — session is not in SCHEDULED state.
 */
export async function openSessionHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const result = await lifecycleService.openSession(id, request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `PATCH /sessions/:id/close`.
 *
 * Transitions a session from `ACTIVE` to `CLOSED`, marking absent students.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the session.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — session does not exist.
 * @throws {AppError} `SESSION_NOT_ACTIVE` (400) — session is not in ACTIVE state.
 */
export async function closeSessionHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const result = await lifecycleService.closeSession(id, request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `PATCH /sessions/:id/lock`.
 *
 * Transitions a session from `CLOSED` to `LOCKED`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the session.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — session does not exist.
 * @throws {AppError} `SESSION_NOT_ACTIVE` (400) — session is not in CLOSED state.
 */
export async function lockSessionHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const result = await lifecycleService.lockSession(id, request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `GET /sessions/:id/live`.
 *
 * Returns the current live check-in snapshot for a session.
 * Used for initial page load before WebSocket connection is established.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the session.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — session does not exist.
 */
export async function getLiveCheckinsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const result = await sessionsService.getLiveCheckins(id);
  void reply.status(200).send(result);
}
