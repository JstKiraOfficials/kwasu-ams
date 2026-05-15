# Departments Module

Manages the second level of KWASU's academic hierarchy: Faculty → **Department** → Programme.

## Endpoints

| Method | Path               | Roles                         | Description                    |
| ------ | ------------------ | ----------------------------- | ------------------------------ |
| GET    | `/departments`     | All authenticated roles       | List departments (scope-aware) |
| GET    | `/departments/:id` | All authenticated roles       | Get department by UUID         |
| POST   | `/departments`     | SUPER_ADMIN, ACADEMIC_AFFAIRS | Create a department            |
| PATCH  | `/departments/:id` | SUPER_ADMIN, ACADEMIC_AFFAIRS | Update a department            |
| DELETE | `/departments/:id` | SUPER_ADMIN only              | Delete a department            |

## Scope Enforcement

Read operations are scope-restricted at the **database query level**:

| Role             | Sees                                           |
| ---------------- | ---------------------------------------------- |
| SUPER_ADMIN      | All departments (optional `?facultyId` filter) |
| ACADEMIC_AFFAIRS | All departments (optional `?facultyId` filter) |
| VICE_CHANCELLOR  | All departments                                |
| DEAN             | Only departments in their faculty              |
| HOD              | Only their own department                      |
| LECTURER         | Only their own department                      |

A DEAN accessing `GET /departments/:id` for a department outside their faculty receives `403`.
An HOD accessing `GET /departments/:id` for a different department receives `403`.

## Business Rules

- Department `code` is unique and stored uppercase (e.g. `"BIO"`).
- `DELETE` is blocked with `409 CONFLICT` if programmes or courses exist.
- All write operations write a `SYSTEM_SETTING_CHANGED` AuditLog entry.
- List response includes `_count.courses` and `_count.lecturers` for each department.

## Dependencies

- `lib/prisma.ts` — database access
- `middleware/authenticate.ts` — JWT verification
- `middleware/role-guard.ts` — role enforcement
