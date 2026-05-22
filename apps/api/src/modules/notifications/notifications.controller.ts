/**
 * @file notifications.controller.ts
 * @module modules/notifications
 *
 * Thin HTTP controller layer for the notifications module.
 * No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import {
  ListNotificationsQuerySchema,
  RegisterFcmTokenSchema,
  WarnStudentSchema,
} from './notifications.schema.js';
import {
  getNotifications,
  markAsRead,
  registerFcmToken,
  warnStudent,
} from './notifications.service.js';

/**
 * Handles `GET /notifications`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function listNotificationsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = ListNotificationsQuerySchema.parse(request.query);
  const result = await getNotifications(request.user!.userId, query);
  void reply.status(200).send(result);
}

/**
 * Handles `PATCH /notifications/:id/read`.
 *
 * @param request - Fastify request. URL param: `id`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function markAsReadHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  await markAsRead(id, request.user!.userId);
  void reply.status(200).send({ message: 'Notification marked as read.' });
}

/**
 * Handles `POST /notifications/fcm-token`.
 *
 * @param request - Fastify request. Body: `{ fcmToken }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function registerFcmTokenHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = RegisterFcmTokenSchema.parse(request.body);
  await registerFcmToken(request.user!.userId, body.fcmToken);
  void reply.status(200).send({ message: 'FCM token registered.' });
}

/**
 * Handles `POST /notifications/warn-student`.
 *
 * @param request - Fastify request. Body: `{ studentId, courseSectionId }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function warnStudentHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = WarnStudentSchema.parse(request.body);
  await warnStudent(request.user!.userId, body);
  void reply.status(200).send({ message: 'Warning notification dispatched.' });
}
