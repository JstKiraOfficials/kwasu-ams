# Anomalies Module

## What This Module Does

Manages anomaly flags — soft signals surfaced for human review. Never auto-bans students.

- **Scope-aware listing** — LECTURER sees only their sessions; HOD sees their dept; DEAN sees their faculty.
- **Review actions** — `CONFIRMED_PRESENT`, `CONFIRMED_ABSENT` (updates AttendanceRecord), `ESCALATED` (creates HOD_AWARENESS_FLAG).
- **Internal creation** — `createAnomalyFlag()` is called by check-in services and the anomaly detection worker, not exposed as a public API.

## Endpoints

| Method | Path                    | Roles                                              | Description                                      |
| ------ | ----------------------- | -------------------------------------------------- | ------------------------------------------------ |
| GET    | `/anomalies`            | SUPER_ADMIN, ACADEMIC_AFFAIRS, DEAN, HOD, LECTURER | Scope-aware list                                 |
| GET    | `/anomalies/:id`        | Same                                               | Single flag with details                         |
| PATCH  | `/anomalies/:id/review` | Same                                               | Review flag (CONFIRMED_PRESENT/ABSENT/ESCALATED) |

## Key Business Rules

- Anomaly flags are **never** auto-bans — all decisions are made by humans.
- `ESCALATED` creates a new `HOD_AWARENESS_FLAG` for the HOD's queue.
- Reviewing an already-reviewed flag returns `409 CONFLICT`.
