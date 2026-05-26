/**
 * @file audit.service.ts
 * @module modules/audit
 *
 * Read-only audit log service for KWASU AMS.
 *
 * Provides paginated, filtered access to the append-only `AuditLog` table.
 * No create/update/delete operations are exposed — the audit log is immutable.
 * Access is restricted to `SUPER_ADMIN` only (enforced at the route level).
 */

import { type Prisma } from '@prisma/client';
import { type IAuditLog, type PaginatedResponse } from '@kwasu-ams/types';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error-handler.js';
import { type ListAuditLogsQuery } from './audit.schema.js';

/**
 * Returns a paginated, filtered list of audit log entries.
 *
 * Includes the actor's full name and role for each entry.
 * Results are ordered by `createdAt` descending (most recent first).
 *
 * @param query - Validated query params from {@link ListAuditLogsQuerySchema}.
 * @returns Paginated list of {@link IAuditLog} records with actor details.
 */
export async function listAuditLogs(
  query: ListAuditLogsQuery,
): Promise<PaginatedResponse<IAuditLog>> {
  const { page, pageSize, actorId, action, entityType, entityId, startDate, endDate } = query;
  const skip = (page - 1) * pageSize;

  const where: Prisma.AuditLogWhereInput = {};

  if (actorId !== undefined) where.actorId = actorId;
  if (action !== undefined) where.action = action as never;
  if (entityType !== undefined) where.entityType = entityType;
  if (entityId !== undefined) where.entityId = entityId;
  if (startDate !== undefined || endDate !== undefined) {
    where.createdAt = {
      ...(startDate !== undefined ? { gte: new Date(startDate) } : {}),
      ...(endDate !== undefined ? { lte: new Date(endDate) } : {}),
    };
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { fullName: true, role: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    data: logs as unknown as IAuditLog[],
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

/**
 * Returns a single audit log entry by UUID with full before/after snapshots.
 *
 * @param id - UUID of the `AuditLog` entry to fetch.
 * @returns The {@link IAuditLog} record with actor details.
 * @throws {AppError} `NOT_FOUND` (404) — audit log entry does not exist.
 */
export async function getAuditLogById(id: string): Promise<IAuditLog> {
  const log = await prisma.auditLog.findUnique({
    where: { id },
    include: { actor: { select: { fullName: true, role: true } } },
  });
  if (!log) throw new AppError('NOT_FOUND', 'Audit log entry not found.', 404);
  return log as unknown as IAuditLog;
}
