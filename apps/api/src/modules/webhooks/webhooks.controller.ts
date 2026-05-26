/**
 * @file webhooks.controller.ts
 * @module modules/webhooks
 *
 * Thin HTTP controller layer for the webhooks module.
 *
 * Each handler extracts validated data from the request, delegates to the
 * service layer, and returns the appropriate HTTP response.
 * No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { CreateWebhookSchema } from './webhooks.schema.js';
import * as webhooksService from './webhooks.service.js';

/**
 * Handles `GET /webhooks`.
 *
 * Returns all active webhook subscriptions. `secretEncrypted` is never included.
 *
 * @param _request - Fastify request (unused — no query params or body).
 * @param reply    - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function listWebhooksHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const result = await webhooksService.listWebhooks();
  void reply.status(200).send(result);
}

/**
 * Handles `POST /webhooks`.
 *
 * Creates a new webhook subscription. Returns the webhook and the plaintext
 * secret shown exactly once. Validates body against `CreateWebhookSchema`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Body: `CreateWebhookSchema`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function createWebhookHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const data = CreateWebhookSchema.parse(request.body);
  const result = await webhooksService.createWebhook(data, request.user!.userId);
  void reply.status(201).send(result);
}

/**
 * Handles `DELETE /webhooks/:id`.
 *
 * Soft-deletes a webhook subscription by setting `isActive = false`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the webhook.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — webhook does not exist or is already inactive.
 */
export async function deleteWebhookHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  await webhooksService.deleteWebhook(id, request.user!.userId);
  void reply.status(200).send({ message: 'Webhook deleted successfully.' });
}
