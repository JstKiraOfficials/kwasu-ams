/**
 * @file lecturers.controller.ts
 * @module modules/lecturers
 *
 * Thin HTTP controller layer for the lecturers module.
 *
 * Each handler extracts validated data from the request, delegates to the
 * service layer, and returns the appropriate HTTP response.
 * No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { type Role } from '@kwasu-ams/types';
import {
  CreateLecturerSchema,
  UpdateLecturerSchema,
  ListLecturersQuerySchema,
} from './lecturers.schema.js';
import * as lecturersService from './lecturers.service.js';

/**
 * Handles `GET /lecturers`.
 *
 * Returns a paginated, scope-aware list of lecturers. `accountabilityScore`
 * is included only for HOD, DEAN, ACADEMIC_AFFAIRS, and SUPER_ADMIN roles.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Query: `{ departmentId?, search?, page?, pageSize? }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function listLecturersHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = ListLecturersQuerySchema.parse(request.query);
  const result = await lecturersService.listLecturers(
    query,
    request.user!.role as Role,
    request.user!.scopeId ?? null,
  );
  void reply.status(200).send(result);
}

/**
 * Handles `GET /lecturers/:id`.
 *
 * Returns a single lecturer by UUID. `accountabilityScore` is stripped when
 * the requesting user has role `LECTURER`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the lecturer record.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — lecturer does not exist.
 */
export async function getLecturerByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const result = await lecturersService.getLecturerById(id, request.user!.role as Role);
  void reply.status(200).send(result);
}

/**
 * Handles `POST /lecturers`.
 *
 * Creates a new lecturer record. Validates the request body against
 * `CreateLecturerSchema`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Body: `CreateLecturerSchema`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `VALIDATION_ERROR` (400) — invalid staff ID format.
 * @throws {AppError} `CONFLICT` (409) — staff ID already registered.
 */
export async function createLecturerHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const data = CreateLecturerSchema.parse(request.body);
  const result = await lecturersService.createLecturer(data, request.user!.userId);
  void reply.status(201).send(result);
}

/**
 * Handles `PATCH /lecturers/:id`.
 *
 * Partially updates a lecturer record. Validates the request body against
 * `UpdateLecturerSchema`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the lecturer record.
 *                  Body: `UpdateLecturerSchema` (partial).
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — lecturer does not exist.
 */
export async function updateLecturerHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const data = UpdateLecturerSchema.parse(request.body);
  const result = await lecturersService.updateLecturer(id, data, request.user!.userId);
  void reply.status(200).send(result);
}
