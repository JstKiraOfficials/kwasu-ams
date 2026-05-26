/**
 * @file support.controller.ts
 * @module modules/support
 *
 * Thin HTTP controller layer for the support ticket module.
 * No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { type Role } from '@kwasu-ams/types';
import {
  CreateTicketSchema,
  UpdateTicketSchema,
  ListTicketsQuerySchema,
} from './support.schema.js';
import { createTicket, listTickets, getTicketById, updateTicket } from './support.service.js';

/**
 * Handles `POST /support`.
 *
 * Creates a new support ticket with `status: 'OPEN'`.
 *
 * @param request - Fastify request. Body: `{ category, subject, description }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function createTicketHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = CreateTicketSchema.parse(request.body);
  const result = await createTicket(request.user!.userId, body);
  void reply.status(201).send(result);
}

/**
 * Handles `GET /support`.
 *
 * Returns a paginated, scope-aware list of support tickets.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function listTicketsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = ListTicketsQuerySchema.parse(request.query);
  const result = await listTickets(
    query,
    request.user!.role as Role,
    request.user!.userId,
    request.user!.scopeId ?? null,
  );
  void reply.status(200).send(result);
}

/**
 * Handles `GET /support/:id`.
 *
 * Returns a single support ticket with scope enforcement.
 *
 * @param request - Fastify request. URL param: `id`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function getTicketByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const result = await getTicketById(id, request.user!.role as Role, request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `PATCH /support/:id`.
 *
 * Updates a support ticket's status, assignment, or resolution.
 *
 * @param request - Fastify request. URL param: `id`. Body: `UpdateTicketSchema`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function updateTicketHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const body = UpdateTicketSchema.parse(request.body);
  const result = await updateTicket(id, body, request.user!.userId);
  void reply.status(200).send(result);
}
