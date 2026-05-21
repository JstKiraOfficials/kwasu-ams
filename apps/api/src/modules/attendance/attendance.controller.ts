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
import {
  GpsCheckinSchema,
  QrCheckinSchema,
  CodeCheckinSchema,
  ListAttendanceQuerySchema,
} from './attendance.schema.js';
import { checkInGps } from './checkin-gps.service.js';
import { checkInQr } from './checkin-qr.service.js';
import { checkInCode } from './checkin-code.service.js';
import { listAttendance } from './attendance.service.js';

/**
 * Handles `POST /attendance/checkin/gps`.
 *
 * Validates the request body against {@link GpsCheckinSchema}, delegates to
 * {@link checkInGps}, and returns the created `AttendanceRecord` with HTTP 201.
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
 * Handles `POST /attendance/checkin/qr`.
 *
 * Validates the request body against {@link QrCheckinSchema}, delegates to
 * {@link checkInQr}, and returns the created `AttendanceRecord` with HTTP 201.
 *
 * @param request - Fastify request. Body must match {@link QrCheckinSchema}.
 *                  `request.user` must be set by `authenticate`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function checkInQrHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = QrCheckinSchema.parse(request.body);
  const record = await checkInQr(request.user!.userId, body);
  void reply.status(201).send(record);
}

/**
 * Handles `POST /attendance/checkin/code`.
 *
 * Validates the request body against {@link CodeCheckinSchema}, delegates to
 * {@link checkInCode}, and returns the created `AttendanceRecord` with HTTP 201.
 *
 * @param request - Fastify request. Body must match {@link CodeCheckinSchema}.
 *                  `request.user` must be set by `authenticate`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function checkInCodeHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = CodeCheckinSchema.parse(request.body);
  const record = await checkInCode(request.user!.userId, body);
  void reply.status(201).send(record);
}

/**
 * Handles `GET /attendance`.
 *
 * Validates query parameters against {@link ListAttendanceQuerySchema}, delegates
 * to {@link listAttendance}, and returns a paginated list of the authenticated
 * student's own attendance records with HTTP 200.
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
