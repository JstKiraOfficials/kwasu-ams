/**
 * @file venues.controller.ts
 * @module modules/venues
 *
 * Thin HTTP controller layer for the venues module.
 *
 * Each handler extracts validated data from the request, delegates to the
 * service layer, and returns the appropriate HTTP response.
 * No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { CreateVenueSchema, UpdateVenueSchema, ListVenuesQuerySchema } from './venues.schema.js';
import * as venuesService from './venues.service.js';

/**
 * Handles `GET /venues`.
 *
 * Returns a paginated list of venues, optionally filtered by building name
 * and active status.
 *
 * @param request - Fastify request. Query: `{ buildingName?, isActive?, page?, pageSize? }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function listVenuesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = ListVenuesQuerySchema.parse(request.query);
  const result = await venuesService.listVenues(query);
  void reply.status(200).send(result);
}

/**
 * Handles `GET /venues/:id`.
 *
 * Returns a single venue by UUID.
 *
 * @param request - Fastify request. URL param: `id` — UUID of the venue.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — venue does not exist.
 */
export async function getVenueByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const result = await venuesService.getVenueById(id);
  void reply.status(200).send(result);
}

/**
 * Handles `POST /venues`.
 *
 * Creates a new venue. Validates the request body against `CreateVenueSchema`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Body: `CreateVenueSchema`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function createVenueHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const data = CreateVenueSchema.parse(request.body);
  const result = await venuesService.createVenue(data, request.user!.userId);
  void reply.status(201).send(result);
}

/**
 * Handles `PATCH /venues/:id`.
 *
 * Partially updates an existing venue. Validates the request body against
 * `UpdateVenueSchema`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the venue.
 *                  Body: `UpdateVenueSchema` (partial).
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — venue does not exist.
 */
export async function updateVenueHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const data = UpdateVenueSchema.parse(request.body);
  const result = await venuesService.updateVenue(id, data, request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `DELETE /venues/:id`.
 *
 * Soft-deactivates a venue by setting `isActive = false`. Venues are never
 * hard-deleted because they may have historical session records.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the venue to deactivate.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — venue does not exist.
 */
export async function deactivateVenueHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  await venuesService.deactivateVenue(id, request.user!.userId);
  void reply.status(200).send({ message: 'Venue deactivated successfully.' });
}
