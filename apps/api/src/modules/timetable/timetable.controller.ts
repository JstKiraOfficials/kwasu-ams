/**
 * @file timetable.controller.ts
 * @module modules/timetable
 *
 * Thin HTTP controller layer for the timetable module.
 *
 * Each handler extracts validated data from the request, delegates to the
 * service layer, and returns the appropriate HTTP response.
 * No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import {
  CreateTimetableEntrySchema,
  UpdateTimetableEntrySchema,
  ListTimetableQuerySchema,
  TimetablePersonQuerySchema,
} from './timetable.schema.js';
import * as timetableService from './timetable.service.js';

/**
 * Handles `GET /timetable`.
 *
 * Returns a paginated list of timetable entries with optional filters.
 *
 * @param request - Fastify request. Query: `{ semesterId?, courseSectionId?, venueId?, dayOfWeek?, page?, pageSize? }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function listTimetableEntriesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = ListTimetableQuerySchema.parse(request.query);
  const result = await timetableService.listTimetableEntries(query);
  void reply.status(200).send(result);
}

/**
 * Handles `GET /timetable/:id`.
 *
 * Returns a single timetable entry by UUID with full nested details.
 *
 * @param request - Fastify request. URL param: `id` — UUID of the entry.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — entry does not exist.
 */
export async function getTimetableEntryByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const result = await timetableService.getTimetableEntryById(id);
  void reply.status(200).send(result);
}

/**
 * Handles `POST /timetable`.
 *
 * Creates a new timetable entry after conflict detection.
 * Validates the request body against `CreateTimetableEntrySchema`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Body: `CreateTimetableEntrySchema`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `CONFLICT` (409) — scheduling conflict detected.
 */
export async function createTimetableEntryHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const data = CreateTimetableEntrySchema.parse(request.body);
  const result = await timetableService.createTimetableEntry(data, request.user!.userId);
  void reply.status(201).send(result);
}

/**
 * Handles `PATCH /timetable/:id`.
 *
 * Partially updates a timetable entry after re-running conflict detection.
 * Validates the request body against `UpdateTimetableEntrySchema`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the entry.
 *                  Body: `UpdateTimetableEntrySchema` (partial).
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — entry does not exist.
 * @throws {AppError} `CONFLICT` (409) — scheduling conflict detected.
 */
export async function updateTimetableEntryHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const data = UpdateTimetableEntrySchema.parse(request.body);
  const result = await timetableService.updateTimetableEntry(id, data, request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `DELETE /timetable/:id`.
 *
 * Hard-deletes a timetable entry.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the entry to delete.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — entry does not exist.
 */
export async function deleteTimetableEntryHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  await timetableService.deleteTimetableEntry(id, request.user!.userId);
  void reply.status(200).send({ message: 'Timetable entry deleted successfully.' });
}

/**
 * Handles `GET /timetable/student/:studentId`.
 *
 * Returns all timetable entries for courses a student is enrolled in,
 * optionally filtered by semester.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `studentId` — UUID of the student record.
 *                  Query: `{ semesterId? }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — student does not exist.
 */
export async function getStudentTimetableHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { studentId } = request.params as { studentId: string };
  const query = TimetablePersonQuerySchema.parse(request.query);
  const result = await timetableService.getStudentTimetable(studentId, query);
  void reply.status(200).send(result);
}

/**
 * Handles `GET /timetable/lecturer/:lecturerId`.
 *
 * Returns all timetable entries for sections assigned to a lecturer,
 * optionally filtered by semester.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `lecturerId` — UUID of the lecturer record.
 *                  Query: `{ semesterId? }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — lecturer does not exist.
 */
export async function getLecturerTimetableHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { lecturerId } = request.params as { lecturerId: string };
  const query = TimetablePersonQuerySchema.parse(request.query);
  const result = await timetableService.getLecturerTimetable(lecturerId, query);
  void reply.status(200).send(result);
}
