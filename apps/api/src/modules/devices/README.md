# Devices Module

## What This Module Does

Manages student device bindings with a 1 primary + 1 secondary device limit.

- **Device registration** — records device fingerprint, platform, and model.
- **Limit enforcement** — max 2 active bindings per student; 3rd attempt returns `400 DEVICE_LIMIT_REACHED`.
- **PENDING_APPROVAL** — new devices when a student already has an active device require TOTP challenge (enforced by check-in service in Phase 19).
- **Admin approval** — more than 1 device change per semester requires `SUPER_ADMIN` approval.
- **Revocation** — sets `status: 'REVOKED'` with reason and audit trail.

## Endpoints

| Method | Path                           | Roles                         | Description            |
| ------ | ------------------------------ | ----------------------------- | ---------------------- |
| GET    | `/devices`                     | STUDENT                       | List own devices       |
| POST   | `/devices`                     | STUDENT                       | Register device        |
| DELETE | `/devices/:id`                 | STUDENT, SUPER_ADMIN          | Revoke device          |
| POST   | `/admin/devices/:id/approve`   | SUPER_ADMIN                   | Approve pending device |
| GET    | `/admin/users/:userId/devices` | SUPER_ADMIN, ACADEMIC_AFFAIRS | List user's devices    |
