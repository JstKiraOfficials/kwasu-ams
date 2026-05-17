# Lecturers Module

## What This Module Does

Manages lecturer records linked to User accounts.

- **Lecturer CRUD** — create, list, fetch, and update lecturer records.
- **Staff ID validation** — validated against `STAFF_ID_REGEX` from `@kwasu-ams/utils` (single source of truth).
- **`accountabilityScore` access control** — never returned to users with role `LECTURER`. Included only for HOD, DEAN, ACADEMIC_AFFAIRS, SUPER_ADMIN.

## Endpoints

| Method | Path             | Roles                                    | Description                                        |
| ------ | ---------------- | ---------------------------------------- | -------------------------------------------------- |
| GET    | `/lecturers`     | SUPER_ADMIN, ACADEMIC_AFFAIRS, DEAN, HOD | Scope-aware list                                   |
| GET    | `/lecturers/:id` | Above + LECTURER                         | Single lecturer (score stripped for LECTURER role) |
| POST   | `/lecturers`     | SUPER_ADMIN, ACADEMIC_AFFAIRS            | Create lecturer                                    |
| PATCH  | `/lecturers/:id` | SUPER_ADMIN, ACADEMIC_AFFAIRS            | Update lecturer                                    |

## Key Business Rules

- `staffId` validated against `STAFF_ID_REGEX` before storage.
- `userId` must reference an existing `User` with role `LECTURER`.
- `accountabilityScore` is excluded at the Prisma `select` level — not post-processed.
