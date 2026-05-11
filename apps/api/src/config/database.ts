/**
 * @file database.ts
 * @module config
 *
 * Database connection configuration derived from validated environment variables.
 * `url` is used by Prisma at runtime (may point to a connection pooler in production).
 * `directUrl` is used by Prisma Migrate and must bypass any pooler.
 */

import { env } from './env.js';

/** Prisma database connection URLs read from the validated environment. */
export const databaseConfig = {
  url: env.DATABASE_URL,
  directUrl: env.DATABASE_DIRECT_URL,
} as const;
