/**
 * @file admin.schema.ts
 * @module modules/admin
 *
 * Zod validation schemas for the admin module.
 *
 * Re-exports the shared `CreateUserSchema` from `@kwasu-ams/types` and defines
 * module-specific schemas for listing and updating users. All schemas are the
 * single source of truth for request validation on admin endpoints.
 */

import { z } from 'zod';
import { Role } from '@kwasu-ams/types';

export { CreateUserSchema, type CreateUserInput } from '@kwasu-ams/types';

// =============================================================================
// List users query schema
// =============================================================================

/**
 * Zod schema for validating query parameters on `GET /admin/users`.
 *
 * Coerces string query params to their correct types (numbers, booleans) so
 * the controller can pass the raw query string directly without manual casting.
 *
 * Fields:
 * - `page`         — 1-based page number. Defaults to 1.
 * - `pageSize`     — Records per page. Min 1, max 100. Defaults to 20.
 * - `role`         — Filter by {@link Role} enum value. Optional.
 * - `departmentId` — Filter by department UUID. Optional.
 * - `isActive`     — Filter by account active status. Optional.
 * - `search`       — Case-insensitive substring match on `fullName` or `identifier`. Optional.
 */
export const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  role: z.nativeEnum(Role).optional(),
  departmentId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

/**
 * TypeScript type inferred from {@link ListUsersQuerySchema}.
 * Used as the parameter type for `listUsers()` in the service layer.
 */
export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

// =============================================================================
// Update user schema
// =============================================================================

/**
 * Zod schema for validating the request body on `PATCH /admin/users/:id`.
 *
 * All fields are optional — only the provided fields are updated (partial update
 * semantics). `scopeId` accepts `null` to explicitly clear the scope (e.g. when
 * changing a user's role to SUPER_ADMIN which has no scope restriction).
 *
 * Fields:
 * - `fullName`  — Full legal name. Min 2 characters.
 * - `email`     — Valid email address.
 * - `phone`     — Phone number. Min 10 characters.
 * - `role`      — New {@link Role} enum value. Triggers `scopeId` compatibility check in service.
 * - `scopeId`   — Faculty or department UUID, or `null` to clear. Optional.
 * - `isActive`  — Account active status. Set to `false` to disable without soft-deleting.
 */
export const UpdateUserSchema = z.object({
  fullName: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(10).optional(),
  role: z.nativeEnum(Role).optional(),
  scopeId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

/**
 * TypeScript type inferred from {@link UpdateUserSchema}.
 * Used as the parameter type for `updateUser()` in the service layer.
 */
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
