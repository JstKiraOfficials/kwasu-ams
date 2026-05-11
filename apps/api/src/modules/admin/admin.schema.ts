/**
 * @file admin.schema.ts
 * @module modules/admin
 *
 * Re-exports shared Zod validation schemas from `@kwasu-ams/types` for use
 * within the admin module.
 *
 * Keeping schemas in the shared package ensures the web app, mobile app, and
 * API all validate against identical rules without duplication.
 */

export { CreateUserSchema, type CreateUserInput } from '@kwasu-ams/types';
