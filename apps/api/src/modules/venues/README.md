# Venues Module

## What This Module Does

Manages lecture venues with GPS coordinates and configurable geofence radii.

- **Venue CRUD** — create, list, fetch, update, and soft-deactivate venues.
- **Geofence configuration** — each venue has a `geofenceRadius` (30–150m, default 50m) used as the check-in boundary.
- **Soft deactivation** — venues are never hard-deleted; `DELETE /venues/:id` sets `isActive = false`.

## Endpoints

| Method | Path          | Roles                                              | Description                     |
| ------ | ------------- | -------------------------------------------------- | ------------------------------- |
| GET    | `/venues`     | SUPER_ADMIN, ACADEMIC_AFFAIRS, DEAN, HOD, LECTURER | List venues (active by default) |
| GET    | `/venues/:id` | Same as above                                      | Get single venue                |
| POST   | `/venues`     | SUPER_ADMIN, ACADEMIC_AFFAIRS                      | Create venue                    |
| PATCH  | `/venues/:id` | SUPER_ADMIN, ACADEMIC_AFFAIRS                      | Update venue                    |
| DELETE | `/venues/:id` | SUPER_ADMIN                                        | Soft-deactivate venue           |

## Key Business Rules

- `geofenceRadius` must be 30–150 metres. Values outside this range return `400`.
- `latitude` and `longitude` are the venue's permanent registered GPS coordinates — not student check-in coordinates.
- Deactivated venues are excluded from list results by default. Pass `?isActive=false` to include them.
- Sessions already scheduled at a deactivated venue are not affected.

## Dependencies

- **Phase 09** — `authenticate`, `requireRoles`, `AppError`.
- **Phase 08** — `lib/prisma.ts`.

## Consumed By

- **Phase 18** — session creation (venue GPS for geofence centre).
- **Phase 19–20** — geofence validation (Haversine formula uses venue lat/lng).
- **Phase 15** — timetable entries reference venue IDs.
