/**
 * @file faculties.controller.ts
 * @module modules/faculties
 *
 * Thin HTTP controller layer for the faculties module.
 *
 * Each handler extracts validated data from the request, delegates to the
 * service layer, and returns the appropriate HTTP response.
 * No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import {
  CreateFacultySchema,
  UpdateFacultySchema,
  ListFacultiesQuerySchema,
} from './faculties.schema.js';
import * as facultiesService from './faculties.service.js';

/**
 * Handles `GET /faculties`.
 *
 * Parses pagination query params and returns a paginated list of faculties,
 * each including a department count.
 *
 * @param request - Fastify request with optional `?page&pageSize` query params.
 * @param reply   - Fastify reply used to send the HTTP response.
 */
export async function listFacultiesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = ListFacultiesQuerySchema.parse(request.query);
  const result = await facultiesService.listFaculties(query);
  void reply.status(200).send(result);
}

/**
 * Handles `GET /faculties/:id`.
 *
 * Returns a single faculty by UUID including its department count.
 *
 * @param request - Fastify request. URL param: `id` — UUID of the faculty.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @throws {AppError} `NOT_FOUND` (404) — faculty does not exist.
 */
export async function getFacultyByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const faculty = await facultiesService.getFacultyById(id);
  void reply.status(200).send(faculty);
}

/**
 * Handles `POST /faculties`.
 *
 * Validates the request body, creates a new faculty, and returns it with
 * status 201.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Body: `{ name, code, universityId }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @throws {AppError} `CONFLICT` (409) — faculty code already exists.
 */
export async function createFacultyHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = CreateFacultySchema.parse(request.body);
  const faculty = await facultiesService.createFaculty(body, request.user!.userId);
  void reply.status(201).send(faculty);
}

/**
 * Handles `PATCH /faculties/:id`.
 *
 * Validates the request body and applies a partial update to the faculty.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id`. Body: partial `UpdateFacultySchema` fields.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @throws {AppError} `NOT_FOUND` (404) — faculty does not exist.
 * @throws {AppError} `CONFLICT` (409) — new code already used by another faculty.
 */
export async function updateFacultyHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const body = UpdateFacultySchema.parse(request.body);
  const faculty = await facultiesService.updateFaculty(id, body, request.user!.userId);
  void reply.status(200).send(faculty);
}

/**
 * Handles `DELETE /faculties/:id`.
 *
 * Hard-deletes a faculty after verifying it has no child departments.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the faculty to delete.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @throws {AppError} `NOT_FOUND` (404) — faculty does not exist.
 * @throws {AppError} `CONFLICT` (409) — faculty has departments; delete them first.
 */
export async function deleteFacultyHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  await facultiesService.deleteFaculty(id, request.user!.userId);
  void reply.status(200).send({ message: 'Faculty deleted successfully.' });
}
