/**
 * @file audit.schema.ts
 * @module modules/audit
 *
 * Zod validation schemas for the audit log module.
 */

import { z } from 'zod';

/**
 * Schema for query parameters on `GET /audit-logs`.
 *
 * All fields are optional — omitting them returns all audit logs paginated.
 *
 * - `actorId`    — Filter by the UUID of the user who performed the action.
 * - `action`     — Filter by AuditAction enum value string.
 * - `entityType` — Filter by entity type string (e.g. `'AttendanceRecord'`).
 * - `entityId`   — Filter by the UUID of the affected entity.
 * - `startDate`  — ISO 8601 lower bound for `createdAt`.
 * - `endDate`    — ISO 8601 upper bound for `createdAt`.
 * - `page`       — 1-based page number. Defaults to 1.
 * - `pageSize`   — Records per page. Min 1, max 100. Defaults to 20.
 */
export const ListAuditLogsQuerySchema = z.object({
  actorId: z.string().uuid().optional(),
  action: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** TypeScript type inferred from {@link ListAuditLogsQuerySchema}. */
export type ListAuditLogsQuery = z.infer<typeof ListAuditLogsQuerySchema>;
