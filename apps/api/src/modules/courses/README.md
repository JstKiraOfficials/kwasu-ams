# Courses Module

## What This Module Does

Manages the full course lifecycle within the KWASU AMS academic hierarchy:

- **Course CRUD** — create, list, fetch, update, and delete courses linked to departments.
- **Course Sections** — per-semester instances of a course (Section A, B, C), each with a lecturer and enrollment cap.
- **Batch Enrollment** — atomically enroll up to 500 students into a section in a single transaction.
- **Lecturer Assignment** — assign a lecturer to a section with same-department enforcement.
- **Student Attendance Summary** — paginated list of enrolled students with per-student attendance stats.

## Endpoints

| Method | Path                                        | Roles                                              | Description                 |
| ------ | ------------------------------------------- | -------------------------------------------------- | --------------------------- |
| GET    | `/courses`                                  | All authenticated                                  | Scope-aware course list     |
| GET    | `/courses/:id`                              | All authenticated                                  | Single course with sections |
| POST   | `/courses`                                  | SUPER_ADMIN, ACADEMIC_AFFAIRS                      | Create course               |
| PATCH  | `/courses/:id`                              | SUPER_ADMIN, ACADEMIC_AFFAIRS                      | Update course               |
| DELETE | `/courses/:id`                              | SUPER_ADMIN                                        | Delete course (no sessions) |
| POST   | `/courses/:id/sections`                     | SUPER_ADMIN, ACADEMIC_AFFAIRS, HOD                 | Create section              |
| POST   | `/courses/:id/sections/:sectionId/enroll`   | SUPER_ADMIN, ACADEMIC_AFFAIRS, HOD                 | Batch enroll students       |
| PATCH  | `/courses/:id/sections/:sectionId/lecturer` | SUPER_ADMIN, ACADEMIC_AFFAIRS, HOD                 | Assign lecturer             |
| GET    | `/courses/:id/students`                     | SUPER_ADMIN, ACADEMIC_AFFAIRS, DEAN, HOD, LECTURER | Students with attendance    |

## Scope Enforcement

Scope is enforced **at the Prisma query level** — not just the route level.

| Role                                             | Scope                                             |
| ------------------------------------------------ | ------------------------------------------------- |
| SUPER_ADMIN / ACADEMIC_AFFAIRS / VICE_CHANCELLOR | All courses (optional `?departmentId` filter)     |
| DEAN                                             | Only courses in their faculty                     |
| HOD                                              | Only courses in their department                  |
| LECTURER                                         | Only courses where they are assigned to a section |
| STUDENT                                          | Only courses they are enrolled in                 |

## Key Business Rules

- Course `code` is unique across the system and normalised to uppercase.
- Course `level` must be one of: 100, 200, 300, 400, 500, 600.
- `CourseSection` is unique per `[courseId, semesterId, sectionLabel]`.
- Batch enrollment is **atomic** — all students enrolled or none (Prisma transaction).
- Re-enrolling an already-enrolled student is a no-op (counted as `skipped`).
- When `isCarryOver: true`, `Student.hasCarryOver` is also set to `true` in the same transaction.
- Lecturer assignment requires the lecturer to belong to the same department as the course, unless the actor is `SUPER_ADMIN` or `ACADEMIC_AFFAIRS`.
- A course cannot be deleted if any sessions exist across its sections.

## Dependencies

- **Phase 13** — departments and programmes modules (department lookup for scope).
- **Phase 09** — `authenticate`, `requireRoles`, `AppError`.
- **Phase 08** — `lib/prisma.ts`.

## Consumed By

- **Phase 15** — timetable module (section → timetable entries).
- **Phase 18** — session management (section → sessions).
- **Phase 24** — eligibility computation (enrollment data).
- **Phase 37** — lecturer dashboard (course student list).
- **Phase 41** — web course detail page.
