# Timetable Module

## What This Module Does

Manages course section scheduling with automatic conflict detection.

- **Timetable CRUD** — create, list, fetch, update, and delete timetable entries.
- **Conflict detection** — checks three conflict types before every create/update:
  1. **VENUE** — same venue booked at an overlapping time on the same day.
  2. **LECTURER** — same lecturer assigned to an overlapping slot on the same day.
  3. **SECTION** — same course section scheduled at an overlapping time on the same day.
- **Personal timetables** — student and lecturer views filtered by their enrollments/assignments.

## Endpoints

| Method | Path                              | Roles                                                 | Description                   |
| ------ | --------------------------------- | ----------------------------------------------------- | ----------------------------- |
| GET    | `/timetable`                      | All authenticated                                     | List entries with filters     |
| GET    | `/timetable/:id`                  | All authenticated                                     | Get single entry              |
| POST   | `/timetable`                      | SUPER_ADMIN, ACADEMIC_AFFAIRS                         | Create entry (conflict check) |
| PATCH  | `/timetable/:id`                  | SUPER_ADMIN, ACADEMIC_AFFAIRS                         | Update entry (conflict check) |
| DELETE | `/timetable/:id`                  | SUPER_ADMIN, ACADEMIC_AFFAIRS                         | Hard delete                   |
| GET    | `/timetable/student/:studentId`   | SUPER_ADMIN, ACADEMIC_AFFAIRS, HOD, LECTURER, STUDENT | Student's timetable           |
| GET    | `/timetable/lecturer/:lecturerId` | SUPER_ADMIN, ACADEMIC_AFFAIRS, HOD, LECTURER          | Lecturer's timetable          |

## Key Business Rules

- `startTime` must be strictly before `endTime` (both `HH:MM` 24-hour format).
- Time overlap: `s1 < e2 && e1 > s2`. Adjacent slots (e.g. 08:00–10:00 and 10:00–12:00) do **not** conflict.
- Conflict detection runs on every create and update. Returns `409` with conflict details if any found.
- On update, the entry being updated is excluded from its own conflict check (`excludeId`).

## Dependencies

- **Phase 14** — `CourseSection` model for timetable entries.
- **Phase 15 (venues)** — `Venue` model referenced by timetable entries.
- **Phase 09** — `authenticate`, `requireRoles`, `AppError`.

## Consumed By

- **Phase 18** — session auto-population from timetable entries.
- **Phase 32** — smart conflict detector (reuses `conflict-detector.service.ts`).
- **Phase 39** — student timetable display (web).
- **Phase 45** — lecturer timetable (web).
