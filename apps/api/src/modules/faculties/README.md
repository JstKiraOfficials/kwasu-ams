# Faculties Module

Manages the top level of KWASU's academic hierarchy: Faculty → Department → Programme.

## Endpoints

| Method | Path             | Roles                         | Description              |
| ------ | ---------------- | ----------------------------- | ------------------------ |
| GET    | `/faculties`     | All authenticated roles       | List faculties paginated |
| GET    | `/faculties/:id` | All authenticated roles       | Get faculty by UUID      |
| POST   | `/faculties`     | SUPER_ADMIN, ACADEMIC_AFFAIRS | Create a faculty         |
| PATCH  | `/faculties/:id` | SUPER_ADMIN, ACADEMIC_AFFAIRS | Update a faculty         |
| DELETE | `/faculties/:id` | SUPER_ADMIN only              | Delete a faculty         |

## Business Rules

- Faculty `code` is unique and stored uppercase (e.g. `"SCI"`).
- `DELETE` is blocked with `409 CONFLICT` if any departments exist under the faculty.
- All write operations write a `SYSTEM_SETTING_CHANGED` AuditLog entry.
- List response includes `_count.departments` for each faculty.

## Dependencies

- `lib/prisma.ts` — database access
- `middleware/authenticate.ts` — JWT verification
- `middleware/role-guard.ts` — role enforcement
