# Students Module

## What This Module Does

Manages student records linked to User accounts.

- **Student CRUD** — create, list, fetch, and update student records.
- **Matric number validation** — validated against `MATRIC_NUMBER_REGEX` from `@kwasu-ams/utils` (single source of truth).
- **Scope-aware listing** — HOD sees only their department; DEAN sees their faculty; LECTURER sees only enrolled students.

## Endpoints

| Method | Path            | Roles                                                            | Description                     |
| ------ | --------------- | ---------------------------------------------------------------- | ------------------------------- |
| GET    | `/students`     | SUPER_ADMIN, ACADEMIC_AFFAIRS, DEAN, HOD, LECTURER, EXAM_OFFICER | Scope-aware list                |
| GET    | `/students/:id` | Above + STUDENT                                                  | Single student with enrollments |
| POST   | `/students`     | SUPER_ADMIN, ACADEMIC_AFFAIRS                                    | Create student                  |
| PATCH  | `/students/:id` | SUPER_ADMIN, ACADEMIC_AFFAIRS                                    | Update student                  |

## Key Business Rules

- `matricNumber` validated against `MATRIC_NUMBER_REGEX` and normalised to uppercase before storage.
- `userId` must reference an existing `User` with role `STUDENT`.
- Duplicate matric numbers return `409 CONFLICT`.
