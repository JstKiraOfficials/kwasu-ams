# KWASU AMS — Prisma Schema

## Schema Build Order

The schema is built incrementally across phases before the first migration runs in Phase 05:

| Phase    | Models Added                                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 02 | `User`, `DeviceBinding`, `AuditLog`, `AnomalyFlag`, `Notification`, `SupportTicket`                                                       |
| Phase 03 | `Faculty`, `Department`, `Programme`, `AcademicSession`, `Semester`, `Venue`, `TimetableEntry`, `Student`, `Lecturer`, `CourseEnrollment` |
| Phase 04 | `Course`, `Section`, `CourseSession`, `AttendanceRecord`, `ManualOverride`, `ExcuseLetter`, `ExamEligibility`, `SystemSetting`, `Webhook` |
| Phase 05 | Initial migration + RLS policy on `audit_logs`                                                                                            |

## Key Rules

- **Never edit a migration file** after it has been applied. Always generate a new migration.
- **`AuditLog` is append-only.** The RLS policy added in Phase 05 prevents `UPDATE` and `DELETE` at the database level.
- **GPS coordinates are never stored.** `AttendanceRecord` stores only `inside: Boolean`.
- **Soft deletes** on `User` via `deletedAt`. Always filter `deletedAt: null` in queries.
- **UUID primary keys** via `gen_random_uuid()` from the `pgcrypto` extension.

## Commands

```bash
# Validate schema (no DB connection required)
npx prisma validate

# Generate Prisma Client
npx prisma generate

# Create and apply a new migration (Phase 05+)
npx prisma migrate dev --name <migration-name>

# Apply migrations in CI/production
npx prisma migrate deploy
```
