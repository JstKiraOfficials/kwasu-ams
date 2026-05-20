# Sessions Module

## What This Module Does

Manages the complete course session lifecycle with real-time WebSocket support.

- **Lifecycle state machine:** `SCHEDULED → ACTIVE → CLOSED → LOCKED`
- **On close:** All enrolled students without an attendance record are marked `ABSENT` atomically. `overrideWindowEnd = actualEnd + 48h`.
- **Redis pub/sub:** Lifecycle events published to `session:{id}:lifecycle`. Check-in events (Phase 19) published to `session:{id}:checkins`.
- **WebSocket:** `GET /ws/sessions/:id/live?token=<jwt>` for real-time check-in feed.

## Endpoints

| Method | Path                    | Roles                      | Description                    |
| ------ | ----------------------- | -------------------------- | ------------------------------ |
| GET    | `/sessions`             | SUPER_ADMIN…LECTURER       | Scope-aware list               |
| GET    | `/sessions/:id`         | Above + STUDENT            | Session with attendance counts |
| POST   | `/sessions`             | SUPER_ADMIN, HOD, LECTURER | Create session                 |
| PATCH  | `/sessions/:id/open`    | SUPER_ADMIN, HOD, LECTURER | SCHEDULED → ACTIVE             |
| PATCH  | `/sessions/:id/close`   | SUPER_ADMIN, HOD, LECTURER | ACTIVE → CLOSED                |
| PATCH  | `/sessions/:id/lock`    | SUPER_ADMIN                | CLOSED → LOCKED                |
| GET    | `/sessions/:id/live`    | SUPER_ADMIN, HOD, LECTURER | Live check-in snapshot         |
| WS     | `/ws/sessions/:id/live` | JWT query param            | Real-time check-in events      |
