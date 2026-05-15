/**
 * @file departments.controller.ts
 * @module modules/departments
 *
 * Thin HTTP controller layer for the departments module.
 *
 * Each handler extracts validated data from the request, delegates to the
 * service layer, and returns the appropriate HTTP response.
 * No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import {
  CreateDepartmentSchema,
  UpdateDepartmentSchema,
  ListDepartmentsQuerySchema,
} from './departments.schema.js';
import * as departmentsService from './departments.service.js';
import { type Role } from '@kwasu-ams/types';

/**
 * Handles `GET /departments`.
 *
 * Returns a paginated, scope-aware list of departments. The actor's role and
 * scopeId are forwarded to the service for database-level scope enforcement.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Query: `{ facultyId?, page?, pageSize? }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 */
export async function listDepartmentsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = ListDepartmentsQuerySchema.parse(request.query);
  const result = await departmentsService.listDepartments(
    query,
    request.user!.role as Role,
    request.user!.scopeId ?? null,
  );
  void reply.status(200).send(result);
}

/**
 * Handles `GET /departments/:id`.
 *
 * Returns a single department by UUID with scope enforcement applied at the
 * database level.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the department.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @throws {AppError} `NOT_FOUND` (404) — department does not exist.
 * @throws {AppError} `FORBIDDEN` (403) — actor's scope does not include this department.
 */
export async function getDepartmentByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const department = await departmentsService.getDepartmentById(
    id,
    request.user!.role as Role,
    request.user!.scopeId ?? null,
  );
  void reply.status(200).send(department);
}

/**
 * Handles `POST /departments`.
 *
 * Validates the request body, creates a new department, and returns it with
 * status 201.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Body: `{ name, code, facultyId }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @throws {AppError} `CONFLICT` (409) — department code already exists.
 */
export async function createDepartmentHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = CreateDepartmentSchema.parse(request.body);
  const department = await departmentsService.createDepartment(body, request.user!.userId);
  void reply.status(201).send(department);
}

/**
 * Handles `PATCH /departments/:id`.
 *
 * Validates the request body and applies a partial update to the department.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id`. Body: partial `UpdateDepartmentSchema` fields.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @throws {AppError} `NOT_FOUND` (404) — department does not exist.
 * @throws {AppError} `CONFLICT` (409) — new code already used by another department.
 */
export async function updateDepartmentHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const body = UpdateDepartmentSchema.parse(request.body);
  const department = await departmentsService.updateDepartment(id, body, request.user!.userId);
  void reply.status(200).send(department);
}

/**
 * Handles `DELETE /departments/:id`.
 *
 * Hard-deletes a department after verifying it has no child programmes or courses.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the department to delete.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @throws {AppError} `NOT_FOUND` (404) — department does not exist.
 * @throws {AppError} `CONFLICT` (409) — department has programmes or courses.
 */
export async function deleteDepartmentHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  await departmentsService.deleteDepartment(id, request.user!.userId);
  void reply.status(200).send({ message: 'Department deleted successfully.' });
}
