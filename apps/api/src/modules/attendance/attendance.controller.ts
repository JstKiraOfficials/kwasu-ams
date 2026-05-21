/**
 * @file attendance.controller.ts
 * @module modules/attendance
 *
 * Thin HTTP controller layer for the attendance module.
 *
 * Each handler extracts validated data from the request, delegates to the
 * appropriate service function, and returns the correct HTTP response.
 * No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { GpsCheckinSchema, ListAttendanceQuerySchema } from './attendance.schema.js';
import { checkInGps } from './checkin-gps.service.js';
import { listAttendance } from './attendance.service.js';

/**
 * Handles `POST /attendance/checkin/gps`.
 *
 * Validates the request body against {@link GpsCheckinSchema}, delegates to
 * {@link checkInGps}, and returns the created `AttendanceRecord` with HTTP 201.
 *
 * The authenticated student's user ID is read from `request.user` — set by
 * the `authenticate` middleware that runs before this handler.
 *
 * @param request - Fastify request. Body must match {@link GpsCheckinSchema}.
 *                  `request.user` must be set by `authenticate`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function checkInGpsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = GpsCheckinSchema.parse(request.body);
  const record = await checkInGps(request.user!.userId, body);
  void reply.status(201).send(record);
}

/**
 * Handles `GET /attendance`.
 *
 * Validates query parameters against {@link ListAttendanceQuerySchema}, delegates
 * to {@link listAttendance}, and returns a paginated list of the authenticated
 * student's own attendance records with HTTP 200.
 *
 * The authenticated student's user ID is read from `request.user` — set by
 * the `authenticate` middleware that runs before this handler.
 *
 * @param request - Fastify request. Query must match {@link ListAttendanceQuerySchema}.
 *                  `request.user` must be set by `authenticate`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function listAttendanceHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = ListAttendanceQuerySchema.parse(request.query);
  const result = await listAttendance(request.user!.userId, query);
  void reply.status(200).send(result);
}
