# Programmes Module

Manages the third level of KWASU's academic hierarchy: Faculty → Department → **Programme**.

## Endpoints

| Method | Path              | Roles                         | Description                   |
| ------ | ----------------- | ----------------------------- | ----------------------------- |
| GET    | `/programmes`     | All authenticated roles       | List programmes (scope-aware) |
| GET    | `/programmes/:id` | All authenticated roles       | Get programme by UUID         |
| POST   | `/programmes`     | SUPER_ADMIN, ACADEMIC_AFFAIRS | Create a programme            |
| PATCH  | `/programmes/:id` | SUPER_ADMIN, ACADEMIC_AFFAIRS | Update a programme            |
| DELETE | `/programmes/:id` | SUPER_ADMIN only              | Delete a programme            |

## Scope Enforcement

Read operations are scope-restricted at the **database query level**:

| Role             | Sees                                             |
| ---------------- | ------------------------------------------------ |
| SUPER_ADMIN      | All programmes (optional `?departmentId` filter) |
| ACADEMIC_AFFAIRS | All programmes (optional `?departmentId` filter) |
| VICE_CHANCELLOR  | All programmes                                   |
| STUDENT          | All programmes                                   |
| DEAN             | Only programmes in their faculty                 |
| HOD              | Only programmes in their department              |
| LECTURER         | Only programmes in their department              |

## Business Rules

- Programme `code` is unique and stored uppercase (e.g. `"BSC-BIO"`).
- `DELETE` is blocked with `409 CONFLICT` if students are enrolled in the programme.
- All write operations write a `SYSTEM_SETTING_CHANGED` AuditLog entry.

## Dependencies

- `lib/prisma.ts` — database access
- `middleware/authenticate.ts` — JWT verification
- `middleware/role-guard.ts` — role enforcement
