/**
 * @file support.schema.ts
 * @module modules/support
 *
 * Zod validation schemas for the support ticket module.
 */

import { z } from 'zod';
import { TicketCategory, TicketStatus } from '@kwasu-ams/types';
import { Role } from '@kwasu-ams/types';

/**
 * Schema for the body of `POST /support`.
 *
 * - `category`    — {@link TicketCategory} enum value.
 * - `subject`     — Ticket subject. Min 5, max 200 characters.
 * - `description` — Detailed description. Minimum 20 characters.
 */
export const CreateTicketSchema = z.object({
  category: z.nativeEnum(TicketCategory, { error: 'Invalid ticket category' }),
  subject: z.string().min(5, 'Subject must be at least 5 characters').max(200),
  description: z.string().min(20, 'Description must be at least 20 characters'),
});

/** TypeScript type inferred from {@link CreateTicketSchema}. */
export type CreateTicketInput = z.infer<typeof CreateTicketSchema>;

/**
 * Schema for the body of `PATCH /support/:id`.
 *
 * All fields are optional — only provided fields are updated.
 *
 * - `status`       — New {@link TicketStatus}.
 * - `assignedRole` — Role to assign the ticket to.
 * - `assignedToId` — UUID of the specific user to assign.
 * - `resolution`   — Resolution text (required when status is `RESOLVED`).
 */
export const UpdateTicketSchema = z.object({
  status: z.nativeEnum(TicketStatus).optional(),
  assignedRole: z.nativeEnum(Role).optional(),
  assignedToId: z.string().uuid().optional(),
  resolution: z.string().optional(),
});

/** TypeScript type inferred from {@link UpdateTicketSchema}. */
export type UpdateTicketInput = z.infer<typeof UpdateTicketSchema>;

/**
 * Schema for query parameters on `GET /support`.
 *
 * - `status`   — Optional filter by {@link TicketStatus}.
 * - `category` — Optional filter by {@link TicketCategory}.
 * - `page`     — 1-based page number. Defaults to 1.
 * - `pageSize` — Records per page. Min 1, max 100. Defaults to 20.
 */
export const ListTicketsQuerySchema = z.object({
  status: z.nativeEnum(TicketStatus).optional(),
  category: z.nativeEnum(TicketCategory).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** TypeScript type inferred from {@link ListTicketsQuerySchema}. */
export type ListTicketsQuery = z.infer<typeof ListTicketsQuerySchema>;
