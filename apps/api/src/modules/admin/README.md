# Admin Module

Handles account provisioning and full user management for KWASU AMS administrators.

## Endpoints

| Method | Path                          | Roles                         | Description                          |
| ------ | ----------------------------- | ----------------------------- | ------------------------------------ |
| GET    | `/admin/users`                | SUPER_ADMIN, ACADEMIC_AFFAIRS | List users with pagination & filters |
| GET    | `/admin/users/:id`            | SUPER_ADMIN, ACADEMIC_AFFAIRS | Get a single user by UUID            |
| POST   | `/admin/users`                | SUPER_ADMIN, ACADEMIC_AFFAIRS | Create a single user account         |
| PATCH  | `/admin/users/:id`            | SUPER_ADMIN, ACADEMIC_AFFAIRS | Update user fields                   |
| DELETE | `/admin/users/:id`            | SUPER_ADMIN only              | Soft-delete a user                   |
| POST   | `/admin/users/import`         | SUPER_ADMIN only              | Bulk import users from CSV           |
| POST   | `/admin/users/:id/reset-totp` | SUPER_ADMIN only              | Reset TOTP enrollment                |

## User Listing

`GET /admin/users` supports the following query parameters:

| Param      | Type    | Description                                          |
| ---------- | ------- | ---------------------------------------------------- |
| `page`     | integer | Page number (default: 1)                             |
| `pageSize` | integer | Records per page (default: 20, max: 100)             |
| `role`     | string  | Filter by Role enum value                            |
| `isActive` | boolean | Filter by account active status                      |
| `search`   | string  | Case-insensitive match on `fullName` or `identifier` |

Response shape: `{ data: IUserPublic[], meta: { page, pageSize, total, totalPages } }`

## Bulk Import Flow

```
POST /admin/users/import (multipart form-data)
  → reads CSV file field from multipart body
  → optional dryRun field: "true" returns preview without creating accounts
  → uploads CSV to S3: imports/{timestamp}-{actorId}.csv
  → validates every row (identifier format, email, phone, role)
  → if any row invalid: returns { success: false, errors: [{ row, field, message }] }
  → if dryRun=true: returns { success: true, dryRun: true, wouldCreate, wouldSkip, errors: [] }
  → otherwise: creates accounts one-by-one, skips duplicates
  → writes AuditLog entry (BULK_IMPORT_COMPLETED)
  → returns { success: true, created, skipped }
```

### CSV Format

The CSV must have a header row with these columns:

```
identifier,fullName,email,phone,role,scopeId
```

- `scopeId` is optional (leave blank for SUPER_ADMIN/STUDENT/VICE_CHANCELLOR).
- `identifier` must match `MATRIC_NUMBER_REGEX` for `STUDENT` role, or `STAFF_ID_REGEX` for all other roles.

## Account Provisioning Flow

```
POST /admin/users
  → validates identifier format against role (matric for STUDENT, staff ID for others)
  → checks for duplicate identifier
  → generates cryptographically random 12-char temporary password
  → hashes with Argon2id
  → creates user with mustChangePassword: true
  → TODO Phase 25: sends temp password via SMS
  → returns IUserPublic (sensitive fields omitted)
  → writes AuditLog entry (USER_CREATED)
```

## Soft Delete

`DELETE /admin/users/:id` sets `deletedAt = now()` and `isActive = false`. The record is never
hard-deleted. Soft-deleted users cannot log in — the `authenticate` middleware checks both fields.

## Scope Enforcement

- `SUPER_ADMIN` — no scope restriction, can manage all users.
- `ACADEMIC_AFFAIRS` — restricted to users whose `scopeId` matches the actor's own `scopeId`.
  Enforced at the Prisma query level, not in memory.
- `DELETE` and `reset-totp` are restricted to `SUPER_ADMIN` only.

## Security Rules

- Guard chain: `authenticate → requireRoles(SUPER_ADMIN | ACADEMIC_AFFAIRS)`
- `DELETE /admin/users/:id` and `POST /admin/users/:id/reset-totp` are restricted to `SUPER_ADMIN` only.
- Temporary passwords are never stored in plaintext — only the Argon2id hash.
- Temporary passwords are never returned in API responses — delivered via SMS only.
- All provisioned accounts require password change + TOTP setup on first login.
- All state-changing operations write an `AuditLog` entry (fire-and-forget).

## Dependencies

- `lib/argon2.ts` — Argon2id password hashing
- `lib/prisma.ts` — database access
- `lib/s3.ts` — CSV file upload and download
- `middleware/authenticate.ts` — JWT verification
- `middleware/role-guard.ts` — role enforcement
- `modules/auth/totp.service.ts` — TOTP reset delegation
- `csv-parse` — CSV parsing for bulk import
