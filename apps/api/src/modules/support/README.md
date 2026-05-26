# Support Module

Support ticket system for students and staff.

## Endpoints

| Method | Path         | Roles                              | Description      |
| ------ | ------------ | ---------------------------------- | ---------------- |
| POST   | /support     | authenticated                      | Create ticket    |
| GET    | /support     | authenticated                      | List own tickets |
| GET    | /support/:id | authenticated                      | Get ticket by ID |
| PATCH  | /support/:id | SUPER_ADMIN, ACADEMIC_AFFAIRS, HOD | Update ticket    |

## State Machine

```
OPEN → IN_PROGRESS → RESOLVED → CLOSED
```

Setting `status: 'RESOLVED'` automatically sets `resolvedAt = now()`. `CLOSED` is terminal.

## Scope Rules

- `STUDENT` / `LECTURER` — can only view their own tickets.
- `HOD` — can view tickets from their department's students.
- `SUPER_ADMIN`, `ACADEMIC_AFFAIRS` — can view all tickets.
