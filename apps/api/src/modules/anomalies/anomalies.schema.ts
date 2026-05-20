/**
 * @file anomalies.schema.ts
 * @module modules/anomalies
 *
 * Zod validation schemas for the anomaly flags module.
 *
 * `AnomalyType` is imported from `@kwasu-ams/types` — the single source of truth.
 */

import { z } from 'zod';
import { AnomalyType } from '@kwasu-ams/types';

/**
 * Schema for validating query parameters on `GET /anomalies`.
 *
 * - `sessionId`  — Optional UUID filter by course session.
 * - `studentId`  — Optional UUID filter by student.
 * - `flagType`   — Optional filter by {@link AnomalyType} enum value.
 * - `isReviewed` — Optional boolean filter for reviewed/unreviewed flags.
 * - `page`       — 1-based page number. Defaults to 1.
 * - `pageSize`   — Records per page. Min 1, max 100. Defaults to 20.
 */
export const ListAnomaliesQuerySchema = z.object({
  sessionId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  flagType: z.nativeEnum(AnomalyType).optional(),
  isReviewed: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** TypeScript type inferred from {@link ListAnomaliesQuerySchema}. */
export type ListAnomaliesQuery = z.infer<typeof ListAnomaliesQuerySchema>;

/**
 * Schema for reviewing an anomaly flag.
 *
 * - `action` — Review decision: `CONFIRMED_PRESENT`, `CONFIRMED_ABSENT`, or `ESCALATED`.
 * - `note`   — Human-readable review note. Min 5 characters.
 */
export const ReviewAnomalySchema = z.object({
  action: z.enum(['CONFIRMED_PRESENT', 'CONFIRMED_ABSENT', 'ESCALATED']),
  note: z.string().min(5, 'Review note must be at least 5 characters'),
});

/** TypeScript type inferred from {@link ReviewAnomalySchema}. */
export type ReviewAnomalyInput = z.infer<typeof ReviewAnomalySchema>;

/**
 * Input shape for creating an anomaly flag internally (called by check-in services).
 * Not exposed as a public API endpoint.
 */
export interface CreateAnomalyFlagInput {
  /** UUID of the student being flagged. */
  studentId: string;
  /** Optional UUID of the course session where the anomaly occurred. */
  sessionId?: string;
  /** The type of anomaly detected. */
  flagType: AnomalyType;
  /** Human-readable description of the anomaly. */
  description: string;
}
