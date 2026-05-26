# Audit Module

Read-only access to the append-only `AuditLog` table. `SUPER_ADMIN` only.

## Endpoints

| Method | Path            | Roles       | Description                    |
| ------ | --------------- | ----------- | ------------------------------ |
| GET    | /audit-logs     | SUPER_ADMIN | Paginated, filtered audit logs |
| GET    | /audit-logs/:id | SUPER_ADMIN | Single audit log entry         |

## Notes

- No write endpoints — the audit log is append-only (enforced by PostgreSQL RLS).
- Supports filtering by `actorId`, `action`, `entityType`, `entityId`, `startDate`, `endDate`.
- Maximum page size: 100 records.
- Includes actor name and role in each response entry.
