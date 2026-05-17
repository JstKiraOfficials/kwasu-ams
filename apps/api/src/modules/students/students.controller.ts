/**
 * @file students.controller.ts
 * @module modules/students
 *
 * Thin HTTP controller layer for the students module.
 *
 * Each handler extracts validated data from the request, delegates to the
 * service layer, and returns the appropriate HTTP response.
 * No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { type Role } from '@kwasu-ams/types';
import {
  CreateStudentSchema,
  UpdateStudentSchema,
  ListStudentsQuerySchema,
} from './students.schema.js';
import * as studentsService from './students.service.js';

/**
 * Handles `GET /students`.
 *
 * Returns a paginated, scope-aware list of students.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Query: `{ programmeId?, level?, search?, page?, pageSize? }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function listStudentsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = ListStudentsQuerySchema.parse(request.query);
  const result = await studentsService.listStudents(
    query,
    request.user!.role as Role,
    request.user!.scopeId ?? null,
    request.user!.userId,
  );
  void reply.status(200).send(result);
}

/**
 * Handles `GET /students/:id`.
 *
 * Returns a single student by UUID with user, programme, and enrollment details.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the student record.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — student does not exist.
 */
export async function getStudentByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const result = await studentsService.getStudentById(id);
  void reply.status(200).send(result);
}

/**
 * Handles `POST /students`.
 *
 * Creates a new student record. Validates the request body against
 * `CreateStudentSchema`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Body: `CreateStudentSchema`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `VALIDATION_ERROR` (400) — invalid matric number format.
 * @throws {AppError} `CONFLICT` (409) — matric number already registered.
 */
export async function createStudentHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const data = CreateStudentSchema.parse(request.body);
  const result = await studentsService.createStudent(data, request.user!.userId);
  void reply.status(201).send(result);
}

/**
 * Handles `PATCH /students/:id`.
 *
 * Partially updates a student record. Validates the request body against
 * `UpdateStudentSchema`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the student record.
 *                  Body: `UpdateStudentSchema` (partial).
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — student does not exist.
 */
export async function updateStudentHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const data = UpdateStudentSchema.parse(request.body);
  const result = await studentsService.updateStudent(id, data, request.user!.userId);
  void reply.status(200).send(result);
}
