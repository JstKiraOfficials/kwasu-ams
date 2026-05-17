/**
 * @file courses.controller.ts
 * @module modules/courses
 *
 * Thin HTTP controller layer for the courses module.
 *
 * Each handler extracts validated data from the request, delegates to the
 * service layer, and returns the appropriate HTTP response.
 * No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { type Role } from '@kwasu-ams/types';
import {
  CreateCourseSchema,
  UpdateCourseSchema,
  ListCoursesQuerySchema,
  CreateSectionSchema,
  EnrollStudentsSchema,
  AssignLecturerSchema,
  ListCourseStudentsQuerySchema,
} from './courses.schema.js';
import * as coursesService from './courses.service.js';

// =============================================================================
// Course handlers
// =============================================================================

/**
 * Handles `GET /courses`.
 *
 * Returns a paginated, scope-aware list of courses. The actor's role, scopeId,
 * and userId are forwarded to the service for database-level scope enforcement.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Query: `{ departmentId?, level?, semesterId?, page?, pageSize? }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function listCoursesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = ListCoursesQuerySchema.parse(request.query);
  const result = await coursesService.listCourses(
    query,
    request.user!.role as Role,
    request.user!.scopeId ?? null,
    request.user!.userId,
  );
  void reply.status(200).send(result);
}

/**
 * Handles `GET /courses/:id`.
 *
 * Returns a single course by UUID with its sections and scope enforcement applied.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the course.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — course does not exist.
 * @throws {AppError} `FORBIDDEN` (403) — actor's scope does not include this course.
 */
export async function getCourseByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const result = await coursesService.getCourseById(
    id,
    request.user!.role as Role,
    request.user!.scopeId ?? null,
  );
  void reply.status(200).send(result);
}

/**
 * Handles `POST /courses`.
 *
 * Creates a new course. Validates the request body against `CreateCourseSchema`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Body: `CreateCourseSchema`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `CONFLICT` (409) — course code already exists.
 */
export async function createCourseHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const data = CreateCourseSchema.parse(request.body);
  const result = await coursesService.createCourse(data, request.user!.userId);
  void reply.status(201).send(result);
}

/**
 * Handles `PATCH /courses/:id`.
 *
 * Partially updates an existing course. Validates the request body against
 * `UpdateCourseSchema`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the course.
 *                  Body: `UpdateCourseSchema` (partial).
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — course does not exist.
 * @throws {AppError} `CONFLICT` (409) — new code already used by another course.
 */
export async function updateCourseHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const data = UpdateCourseSchema.parse(request.body);
  const result = await coursesService.updateCourse(id, data, request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `DELETE /courses/:id`.
 *
 * Hard-deletes a course after verifying no sessions exist for it.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the course.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — course does not exist.
 * @throws {AppError} `CONFLICT` (409) — course has existing sessions.
 */
export async function deleteCourseHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  await coursesService.deleteCourse(id, request.user!.userId);
  void reply.status(200).send({ message: 'Course deleted successfully.' });
}

// =============================================================================
// Section handlers
// =============================================================================

/**
 * Handles `POST /courses/:id/sections`.
 *
 * Creates a new section for the specified course. Validates the request body
 * against `CreateSectionSchema`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the parent course.
 *                  Body: `CreateSectionSchema`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — parent course does not exist.
 * @throws {AppError} `CONFLICT` (409) — section label already exists for this course/semester.
 */
export async function createSectionHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const data = CreateSectionSchema.parse(request.body);
  const result = await coursesService.createSection(id, data, request.user!.userId);
  void reply.status(201).send(result);
}

/**
 * Handles `POST /courses/:id/sections/:sectionId/enroll`.
 *
 * Atomically batch-enrolls students into a course section. Validates the
 * request body against `EnrollStudentsSchema`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL params: `id` — course UUID, `sectionId` — section UUID.
 *                  Body: `EnrollStudentsSchema`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — section or student IDs do not exist.
 * @throws {AppError} `CONFLICT` (409) — enrollment would exceed `maxEnrollment`.
 */
export async function enrollStudentsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { sectionId } = request.params as { id: string; sectionId: string };
  const data = EnrollStudentsSchema.parse(request.body);
  const result = await coursesService.enrollStudents(sectionId, data, request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `PATCH /courses/:id/sections/:sectionId/lecturer`.
 *
 * Assigns a lecturer to a course section. Validates the request body against
 * `AssignLecturerSchema`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL params: `id` — course UUID, `sectionId` — section UUID.
 *                  Body: `AssignLecturerSchema`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — section or lecturer does not exist.
 * @throws {AppError} `FORBIDDEN` (403) — lecturer is from a different department.
 */
export async function assignLecturerHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { sectionId } = request.params as { id: string; sectionId: string };
  const data = AssignLecturerSchema.parse(request.body);
  const result = await coursesService.assignLecturer(
    sectionId,
    data,
    request.user!.userId,
    request.user!.role as Role,
  );
  void reply.status(200).send(result);
}

// =============================================================================
// Student list handler
// =============================================================================

/**
 * Handles `GET /courses/:id/students`.
 *
 * Returns a paginated list of students enrolled in the first section of the
 * specified course (or a specific section via query param), each with their
 * attendance summary.
 *
 * Note: This endpoint operates on the course's sections. The `id` param is the
 * course UUID; the service resolves the section internally. For section-specific
 * queries, callers should use the `sectionId` query param (future enhancement).
 * Currently returns students for the course section identified by `:id` treated
 * as a `courseSectionId` for direct section queries.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the course section.
 *                  Query: `{ page?, pageSize? }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — course section does not exist.
 */
export async function getCourseStudentsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const query = ListCourseStudentsQuerySchema.parse(request.query);
  const result = await coursesService.getCourseStudents(id, query);
  void reply.status(200).send(result);
}
