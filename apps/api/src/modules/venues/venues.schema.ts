/**
 * @file venues.schema.ts
 * @module modules/venues
 *
 * Zod validation schemas for the venues module.
 *
 * Geofence radius is validated to the 30–150 metre range mandated by the
 * attendance engine rules. GPS coordinates are the venue's permanent registered
 * location — not student check-in coordinates.
 */

import { z } from 'zod';

/**
 * Schema for creating a new venue.
 *
 * - `name`           — Human-readable venue name (e.g. "LT1 — Main Lecture Theatre").
 * - `buildingName`   — Building the venue is located in.
 * - `latitude`       — Venue GPS latitude. Stored permanently as geofence centre.
 * - `longitude`      — Venue GPS longitude. Stored permanently as geofence centre.
 * - `geofenceRadius` — Radius in metres (30–150). Defaults to 50.
 * - `capacity`       — Maximum seating capacity.
 */
export const CreateVenueSchema = z.object({
  name: z.string().min(2, 'Venue name must be at least 2 characters'),
  buildingName: z.string().min(2, 'Building name must be at least 2 characters'),
  latitude: z
    .number()
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90'),
  longitude: z
    .number()
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180'),
  geofenceRadius: z
    .number()
    .int('Geofence radius must be an integer')
    .min(30, 'Geofence radius must be at least 30 metres')
    .max(150, 'Geofence radius must be at most 150 metres')
    .default(50),
  capacity: z.number().int('Capacity must be an integer').min(1, 'Capacity must be at least 1'),
});

/** TypeScript type inferred from {@link CreateVenueSchema}. */
export type CreateVenueInput = z.infer<typeof CreateVenueSchema>;

/**
 * Schema for partially updating an existing venue.
 * All fields are optional — only provided fields are updated.
 */
export const UpdateVenueSchema = CreateVenueSchema.partial();

/** TypeScript type inferred from {@link UpdateVenueSchema}. */
export type UpdateVenueInput = z.infer<typeof UpdateVenueSchema>;

/**
 * Schema for validating query parameters on `GET /venues`.
 *
 * - `buildingName` — Optional partial-match filter on building name.
 * - `isActive`     — Optional boolean filter. Defaults to showing only active venues.
 * - `page`         — 1-based page number. Defaults to 1.
 * - `pageSize`     — Records per page. Min 1, max 100. Defaults to 20.
 */
export const ListVenuesQuerySchema = z.object({
  buildingName: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** TypeScript type inferred from {@link ListVenuesQuerySchema}. */
export type ListVenuesQuery = z.infer<typeof ListVenuesQuerySchema>;
