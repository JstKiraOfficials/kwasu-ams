/**
 * @file users.schema.ts
 * @module modules/users
 *
 * Zod validation schemas for the users module.
 *
 * Re-exports shared schemas from `@kwasu-ams/types` and defines
 * module-local schemas for profile update operations.
 */

import { z } from 'zod';

export { UpdateProfileSchema } from '@kwasu-ams/types';
export type { UpdateProfileInput } from '@kwasu-ams/types';

/**
 * Schema for `GET /users/me/access-log` query parameters.
 */
export const AccessLogQuerySchema = z.object({
  /** Page number (1-indexed). */
  page: z.coerce.number().int().min(1).default(1),
  /** Number of entries per page. */
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Inferred TypeScript type for {@link AccessLogQuerySchema}. */
export type AccessLogQuery = z.infer<typeof AccessLogQuerySchema>;
