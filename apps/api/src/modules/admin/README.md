# Admin Module

Handles account provisioning for KWASU AMS administrators.

## Endpoints

| Method | Path                  | Roles                         | Description                  |
| ------ | --------------------- | ----------------------------- | ---------------------------- |
| POST   | `/admin/users`        | SUPER_ADMIN, ACADEMIC_AFFAIRS | Create a single user account |
| POST   | `/admin/users/import` | SUPER_ADMIN                   | Bulk import users from CSV   |

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

POST /admin/users/import
  → accepts multipart CSV file (max 10 MB)
  → uploads to S3: imports/{timestamp}-{actorId}.csv
  → TODO Phase 27: queues BullMQ job bulk-account-creation
  → returns { jobId } immediately (202 Accepted)
  → writes AuditLog entry (BULK_IMPORT_STARTED)
```

## Security Rules

- Guard chain: `authenticate → requireRoles(SUPER_ADMIN | ACADEMIC_AFFAIRS)`
- `POST /admin/users/import` is restricted to `SUPER_ADMIN` only.
- Temporary passwords are never stored in plaintext — only the Argon2id hash.
- All provisioned accounts require password change + TOTP setup on first login.

## Dependencies

- `lib/argon2.ts` — Argon2id password hashing
- `lib/prisma.ts` — database access
- `lib/s3.ts` — CSV file upload
- `middleware/authenticate.ts` — JWT verification
- `middleware/role-guard.ts` — role enforcement
