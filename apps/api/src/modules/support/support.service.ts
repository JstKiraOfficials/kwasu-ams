/**
 * @file support.service.ts
 * @module modules/support
 *
 * Business logic for the support ticket module.
 *
 * State machine: `OPEN → IN_PROGRESS → RESOLVED → CLOSED`.
 * Setting `status: 'RESOLVED'` automatically sets `resolvedAt = now()`.
 * `CLOSED` is a terminal state — no further transitions are permitted.
 *
 * Scope rules:
 * - `STUDENT` / `LECTURER` — can only view their own tickets.
 * - `HOD` — can view tickets from their department's students.
 * - `SUPER_ADMIN`, `ACADEMIC_AFFAIRS` — can view all tickets.
 */

import { type Prisma } from '@prisma/client';
import { type ISupportTicket, type PaginatedResponse, Role } from '@kwasu-ams/types';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error-handler.js';
import {
  type CreateTicketInput,
  type UpdateTicketInput,
  type ListTicketsQuery,
} from './support.schema.js';

/**
 * Creates a new support ticket with `status: 'OPEN'`.
 *
 * @param userId - UUID of the authenticated user submitting the ticket.
 * @param data   - Validated ticket creation payload from {@link CreateTicketSchema}.
 * @returns The created {@link ISupportTicket} record.
 */
export async function createTicket(
  userId: string,
  data: CreateTicketInput,
): Promise<ISupportTicket> {
  const ticket = await prisma.supportTicket.create({
    data: {
      submittedById: userId,
      category: data.category,
      subject: data.subject,
      description: data.description,
      status: 'OPEN',
    },
  });

  void prisma.auditLog.create({
    data: {
      actorId: userId,
      actorRole: 'STUDENT',
      action: 'USER_CREATED',
      entityType: 'SupportTicket',
      entityId: ticket.id,
      afterJson: { category: data.category, subject: data.subject },
    },
  });

  return ticket as unknown as ISupportTicket;
}

/**
 * Returns a paginated, scope-aware list of support tickets.
 *
 * @param query       - Validated query params from {@link ListTicketsQuerySchema}.
 * @param actorRole   - Role of the requesting user.
 * @param actorUserId - UUID of the requesting user.
 * @param actorScopeId - Department UUID for HOD scope, or `null`.
 * @returns Paginated list of {@link ISupportTicket} records.
 */
export async function listTickets(
  query: ListTicketsQuery,
  actorRole: Role,
  actorUserId: string,
  actorScopeId: string | null,
): Promise<PaginatedResponse<ISupportTicket>> {
  const { page, pageSize, status, category } = query;
  const skip = (page - 1) * pageSize;

  const where: Prisma.SupportTicketWhereInput = {};

  // Scope enforcement
  if (actorRole === Role.STUDENT || actorRole === Role.LECTURER) {
    where.submittedById = actorUserId;
  } else if (actorRole === Role.HOD && actorScopeId !== null) {
    where.submittedBy = {
      student: { programme: { departmentId: actorScopeId } },
    };
  }
  // SUPER_ADMIN and ACADEMIC_AFFAIRS see all tickets

  if (status !== undefined) where.status = status;
  if (category !== undefined) where.category = category;

  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: { submittedBy: { select: { fullName: true, role: true } } },
    }),
    prisma.supportTicket.count({ where }),
  ]);

  return {
    data: tickets as unknown as ISupportTicket[],
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

/**
 * Returns a single support ticket by UUID with scope enforcement.
 *
 * @param id          - UUID of the `SupportTicket` to fetch.
 * @param actorRole   - Role of the requesting user.
 * @param actorUserId - UUID of the requesting user.
 * @returns The {@link ISupportTicket} record.
 * @throws {AppError} `NOT_FOUND` (404) — ticket does not exist.
 * @throws {AppError} `FORBIDDEN` (403) — actor does not have access to this ticket.
 */
export async function getTicketById(
  id: string,
  actorRole: Role,
  actorUserId: string,
): Promise<ISupportTicket> {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: { submittedBy: { select: { fullName: true, role: true } } },
  });
  if (!ticket) throw new AppError('NOT_FOUND', 'Support ticket not found.', 404);

  // Scope check for STUDENT/LECTURER
  if (
    (actorRole === Role.STUDENT || actorRole === Role.LECTURER) &&
    ticket.submittedById !== actorUserId
  ) {
    throw new AppError('FORBIDDEN', 'You do not have access to this ticket.', 403);
  }

  return ticket as unknown as ISupportTicket;
}

/**
 * Updates a support ticket's status, assignment, or resolution.
 *
 * Setting `status: 'RESOLVED'` automatically sets `resolvedAt = now()`.
 *
 * @param id      - UUID of the `SupportTicket` to update.
 * @param data    - Validated update payload from {@link UpdateTicketSchema}.
 * @param actorId - UUID of the user performing the update.
 * @returns The updated {@link ISupportTicket} record.
 * @throws {AppError} `NOT_FOUND` (404) — ticket does not exist.
 */
export async function updateTicket(
  id: string,
  data: UpdateTicketInput,
  actorId: string,
): Promise<ISupportTicket> {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!ticket) throw new AppError('NOT_FOUND', 'Support ticket not found.', 404);

  const now = new Date();
  const updated = await prisma.supportTicket.update({
    where: { id },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.assignedRole !== undefined ? { assignedRole: data.assignedRole } : {}),
      ...(data.assignedToId !== undefined ? { assignedToId: data.assignedToId } : {}),
      ...(data.resolution !== undefined ? { resolution: data.resolution } : {}),
      ...(data.status === 'RESOLVED' ? { resolvedAt: now } : {}),
    },
  });

  void prisma.auditLog.create({
    data: {
      actorId,
      actorRole: 'SUPER_ADMIN',
      action: 'USER_UPDATED',
      entityType: 'SupportTicket',
      entityId: id,
      beforeJson: { status: ticket.status },
      afterJson: { status: data.status },
    },
  });

  return updated as unknown as ISupportTicket;
}
