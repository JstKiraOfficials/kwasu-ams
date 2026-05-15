/**
 * @file programmes.controller.ts
 * @module modules/programmes
 *
 * Thin HTTP controller layer for the programmes module.
 *
 * Each handler extracts validated data from the request, delegates to the
 * service layer, and returns the appropriate HTTP response.
 * No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import {
  CreateProgrammeSchema,
  UpdateProgrammeSchema,
  ListProgrammesQuerySchema,
} from './programmes.schema.js';
import * as programmesService from './programmes.service.js';
import { type Role } from '@kwasu-ams/types';

/**
 * Handles `GET /programmes`.
 *
 * Returns a paginated, scope-aware list of programmes. The actor's role and
 * scopeId are forwarded to the service for database-level scope enforcement.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Query: `{ departmentId?, page?, pageSize? }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 */
export async function listProgrammesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = ListProgrammesQuerySchema.parse(request.query);
  const result = await programmesService.listProgrammes(
    query,
    request.user!.role as Role,
    request.user!.scopeId ?? null,
  );
  void reply.status(200).send(result);
}

/**
 * Handles `GET /programmes/:id`.
 *
 * Returns a single programme by UUID.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the programme.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @throws {AppError} `NOT_FOUND` (404) — programme does not exist.
 */
export async function getProgrammeByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const programme = await programmesService.getProgrammeById(id);
  void reply.status(200).send(programme);
}

/**
 * Handles `POST /programmes`.
 *
 * Validates the request body, creates a new programme, and returns it with
 * status 201.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Body: `{ name, code, departmentId, durationYears }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @throws {AppError} `CONFLICT` (409) — programme code already exists.
 */
export async function createProgrammeHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = CreateProgrammeSchema.parse(request.body);
  const programme = await programmesService.createProgramme(body, request.user!.userId);
  void reply.status(201).send(programme);
}

/**
 * Handles `PATCH /programmes/:id`.
 *
 * Validates the request body and applies a partial update to the programme.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id`. Body: partial `UpdateProgrammeSchema` fields.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @throws {AppError} `NOT_FOUND` (404) — programme does not exist.
 * @throws {AppError} `CONFLICT` (409) — new code already used by another programme.
 */
export async function updateProgrammeHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const body = UpdateProgrammeSchema.parse(request.body);
  const programme = await programmesService.updateProgramme(id, body, request.user!.userId);
  void reply.status(200).send(programme);
}

/**
 * Handles `DELETE /programmes/:id`.
 *
 * Hard-deletes a programme after verifying no students are enrolled.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the programme to delete.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @throws {AppError} `NOT_FOUND` (404) — programme does not exist.
 * @throws {AppError} `CONFLICT` (409) — students are enrolled in this programme.
 */
export async function deleteProgrammeHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  await programmesService.deleteProgramme(id, request.user!.userId);
  void reply.status(200).send({ message: 'Programme deleted successfully.' });
}
