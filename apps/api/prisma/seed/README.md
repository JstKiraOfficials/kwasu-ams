# KWASU AMS — Seed Data

## ⚠️ WARNING: Development and Testing Only

This seed script creates test accounts with known passwords (`TestPassword123!`).
**Never run this against a production database.**

The seed script enforces this with a production guard:

```typescript
if (process.env.NODE_ENV === 'production') {
  throw new Error('Seed script must never run in production. Exiting.');
}
```

## Running the Seed

```bash
# From apps/api/
npx prisma db seed

# Or from monorepo root:
pnpm --filter @kwasu-ams/api exec npx prisma db seed
```

## Seed Contents

| Entity                    | Count                |
| ------------------------- | -------------------- |
| University                | 1                    |
| Faculties                 | 3                    |
| Departments               | 10                   |
| Programmes                | 20                   |
| Courses                   | 50                   |
| Venues                    | 30                   |
| Users (total)             | 227                  |
| — SUPER_ADMIN             | 1                    |
| — Staff (DEAN, HOD, etc.) | 5                    |
| — Lecturers               | 20 (+ User records)  |
| — Students                | 200 (+ User records) |
| Academic Sessions         | 2                    |
| Semesters                 | 4                    |
| Course Sections           | 50                   |
| Timetable Entries         | ~50                  |
| Enrollments               | ~1,000               |

## Idempotency

All seed functions use `upsert` — running the seed twice produces the same state.

## Test Credentials

All accounts use password: `TestPassword123!`

| Role               | Identifier             |
| ------------------ | ---------------------- |
| SUPER_ADMIN        | `KWASU/ADM/SYS/00001`  |
| ACADEMIC_AFFAIRS   | `KWASU/AFF/ACA/00001`  |
| VICE_CHANCELLOR    | `KWASU/VC/EXEC/00001`  |
| DEAN               | `KWASU/DEAN/SCI/00001` |
| HOD                | `KWASU/HOD/CSC/00001`  |
| EXAM_OFFICER       | `KWASU/EXM/REG/00001`  |
| LECTURER (example) | `KWASU/LEC/BIO/00001`  |
| STUDENT (example)  | `20/47CSC/00001`       |
