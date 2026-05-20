/**
 * @file devices.controller.ts
 * @module modules/devices
 *
 * Thin HTTP controller layer for the device binding module.
 *
 * Each handler extracts validated data from the request, delegates to the
 * service layer, and returns the appropriate HTTP response.
 * No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { RegisterDeviceSchema, RevokeDeviceSchema } from './devices.schema.js';
import * as devicesService from './devices.service.js';

/**
 * Handles `GET /devices`.
 *
 * Returns all device bindings for the authenticated student.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function listDevicesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const result = await devicesService.listDevices(request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `POST /devices`.
 *
 * Registers a new device for the authenticated student.
 * Validates the request body against `RegisterDeviceSchema`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Body: `RegisterDeviceSchema`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `DEVICE_LIMIT_REACHED` (400) — student already has 2 active devices.
 */
export async function registerDeviceHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const data = RegisterDeviceSchema.parse(request.body);
  const result = await devicesService.registerDevice(
    request.user!.userId,
    data,
    request.user!.userId,
  );
  void reply.status(201).send(result);
}

/**
 * Handles `DELETE /devices/:id`.
 *
 * Revokes a device binding. Validates the request body against `RevokeDeviceSchema`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the device binding to revoke.
 *                  Body: `{ reason }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — device binding does not exist.
 */
export async function revokeDeviceHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const data = RevokeDeviceSchema.parse(request.body);
  await devicesService.revokeDevice(id, data.reason, request.user!.userId);
  void reply.status(200).send({ message: 'Device revoked successfully.' });
}

/**
 * Handles `POST /admin/devices/:id/approve`.
 *
 * Approves a pending device binding. Restricted to SUPER_ADMIN.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the device binding to approve.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — device binding does not exist.
 */
export async function approveDeviceHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const result = await devicesService.approveDevice(id, request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `GET /admin/users/:userId/devices`.
 *
 * Returns all device bindings for a specific user. Restricted to SUPER_ADMIN
 * and ACADEMIC_AFFAIRS.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `userId` — UUID of the user whose devices to list.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function listUserDevicesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { userId } = request.params as { userId: string };
  const result = await devicesService.listDevices(userId);
  void reply.status(200).send(result);
}
