/**
 * @file audit.controller.ts
 * @module modules/audit
 *
 * Thin HTTP controller layer for the audit log module.
 * No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { ListAuditLogsQuerySchema } from './audit.schema.js';
import { listAuditLogs, getAuditLogById } from './audit.service.js';

/**
 * Handles `GET /audit-logs`.
 *
 * Returns a paginated, filtered list of audit log entries.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function listAuditLogsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = ListAuditLogsQuerySchema.parse(request.query);
  const result = await listAuditLogs(query);
  void reply.status(200).send(result);
}

/**
 * Handles `GET /audit-logs/:id`.
 *
 * Returns a single audit log entry with full before/after snapshots.
 *
 * @param request - Fastify request. URL param: `id`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function getAuditLogByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const result = await getAuditLogById(id);
  void reply.status(200).send(result);
}
