/**
 * @file venues.service.ts
 * @module modules/venues
 *
 * Business logic for the venues module.
 *
 * Responsibilities:
 * - Creating, listing, fetching, updating, and soft-deactivating venues
 * - Venues are never hard-deleted — they may have historical session records
 * - Writing AuditLog entries for all state-changing operations (fire-and-forget)
 *
 * Phase 27 note: Replace direct `prisma.auditLog.create` calls with
 * `auditLogQueue.add()` once BullMQ is wired up.
 */

import { type AuditAction, Prisma } from '@prisma/client';
import { type IVenue, type PaginatedResponse } from '@kwasu-ams/types';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error-handler.js';
import {
  type CreateVenueInput,
  type UpdateVenueInput,
  type ListVenuesQuery,
} from './venues.schema.js';

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Writes an immutable audit log entry via a direct Prisma call.
 * Errors are swallowed — audit failures must never surface to the caller.
 *
 * @param actorId    - UUID of the user performing the action.
 * @param actorRole  - Role string of the actor.
 * @param action     - The {@link AuditAction} enum value.
 * @param entityType - Human-readable entity name, e.g. `"Venue"`.
 * @param entityId   - Optional UUID of the affected entity.
 * @param metadata   - Optional free-form context object.
 * @returns A promise that resolves once the log is written (or silently fails).
 */
async function writeAuditLog(
  actorId: string,
  actorRole: string,
  action: AuditAction,
  entityType: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        actorRole: actorRole as never,
        action,
        entityType,
        entityId: entityId ?? null,
        metadata: metadata !== undefined ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  } catch {
    // Fire-and-forget — audit failures must not surface to the caller
  }
}

// =============================================================================
// Prisma select — IVenue fields
// =============================================================================

/**
 * Prisma `select` object that returns all `IVenue` fields.
 */
const VENUE_SELECT = {
  id: true,
  name: true,
  buildingName: true,
  latitude: true,
  longitude: true,
  geofenceRadius: true,
  capacity: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

// =============================================================================
// createVenue
// =============================================================================

/**
 * Creates a new venue record.
 *
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param data    - Validated creation payload from {@link CreateVenueSchema}.
 * @param actorId - UUID of the admin creating the venue (for audit trail).
 * @returns The created venue record as {@link IVenue}.
 */
export async function createVenue(data: CreateVenueInput, actorId: string): Promise<IVenue> {
  const venue = await prisma.venue.create({
    data: {
      name: data.name,
      buildingName: data.buildingName,
      latitude: data.latitude,
      longitude: data.longitude,
      geofenceRadius: data.geofenceRadius,
      capacity: data.capacity,
    },
    select: VENUE_SELECT,
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SYSTEM_SETTING_CHANGED', 'Venue', venue.id, {
    action: 'CREATE',
    name: data.name,
  });

  return venue as IVenue;
}

// =============================================================================
// listVenues
// =============================================================================

/**
 * Returns a paginated list of venues, optionally filtered by building name and
 * active status.
 *
 * By default (when `isActive` is not provided), only active venues are returned.
 * Pass `isActive: false` to retrieve deactivated venues.
 *
 * @param query - Validated query params from {@link ListVenuesQuerySchema}.
 * @returns Paginated list of {@link IVenue} records with `meta` object.
 */
export async function listVenues(query: ListVenuesQuery): Promise<PaginatedResponse<IVenue>> {
  const { page, pageSize, buildingName, isActive } = query;
  const skip = (page - 1) * pageSize;

  const where: Prisma.VenueWhereInput = {
    // Default to active-only when isActive is not explicitly provided
    isActive: isActive !== undefined ? isActive : true,
  };

  if (buildingName !== undefined) {
    where.buildingName = { contains: buildingName, mode: 'insensitive' };
  }

  const [venues, total] = await Promise.all([
    prisma.venue.findMany({
      where,
      select: VENUE_SELECT,
      skip,
      take: pageSize,
      orderBy: { name: 'asc' },
    }),
    prisma.venue.count({ where }),
  ]);

  return {
    data: venues as IVenue[],
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

// =============================================================================
// getVenueById
// =============================================================================

/**
 * Fetches a single venue by UUID.
 *
 * @param id - UUID of the venue to fetch.
 * @returns The venue record as {@link IVenue}.
 * @throws {AppError} `NOT_FOUND` (404) — venue does not exist.
 */
export async function getVenueById(id: string): Promise<IVenue> {
  const venue = await prisma.venue.findUnique({ where: { id }, select: VENUE_SELECT });
  if (!venue) {
    throw new AppError('NOT_FOUND', 'Venue not found.', 404);
  }
  return venue as IVenue;
}

// =============================================================================
// updateVenue
// =============================================================================

/**
 * Partially updates a venue's fields.
 *
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param id      - UUID of the venue to update.
 * @param data    - Validated partial update payload from {@link UpdateVenueSchema}.
 * @param actorId - UUID of the admin performing the update (for audit trail).
 * @returns The updated venue record as {@link IVenue}.
 * @throws {AppError} `NOT_FOUND` (404) — venue does not exist.
 */
export async function updateVenue(
  id: string,
  data: UpdateVenueInput,
  actorId: string,
): Promise<IVenue> {
  const existing = await prisma.venue.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Venue not found.', 404);
  }

  const updated = await prisma.venue.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.buildingName !== undefined && { buildingName: data.buildingName }),
      ...(data.latitude !== undefined && { latitude: data.latitude }),
      ...(data.longitude !== undefined && { longitude: data.longitude }),
      ...(data.geofenceRadius !== undefined && { geofenceRadius: data.geofenceRadius }),
      ...(data.capacity !== undefined && { capacity: data.capacity }),
    },
    select: VENUE_SELECT,
  });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SYSTEM_SETTING_CHANGED', 'Venue', id, {
    action: 'UPDATE',
  });

  return updated as IVenue;
}

// =============================================================================
// deactivateVenue
// =============================================================================

/**
 * Soft-deactivates a venue by setting `isActive = false`.
 *
 * Venues are never hard-deleted because they may have historical session records.
 * Sessions already scheduled at a deactivated venue are not affected.
 * Writes a `SYSTEM_SETTING_CHANGED` AuditLog entry on success.
 *
 * @param id      - UUID of the venue to deactivate.
 * @param actorId - UUID of the SUPER_ADMIN performing the deactivation (for audit trail).
 * @returns A promise that resolves once the deactivation is complete.
 * @throws {AppError} `NOT_FOUND` (404) — venue does not exist.
 */
export async function deactivateVenue(id: string, actorId: string): Promise<void> {
  const existing = await prisma.venue.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Venue not found.', 404);
  }

  await prisma.venue.update({ where: { id }, data: { isActive: false } });

  void writeAuditLog(actorId, 'SUPER_ADMIN', 'SYSTEM_SETTING_CHANGED', 'Venue', id, {
    action: 'DEACTIVATE',
  });
}
