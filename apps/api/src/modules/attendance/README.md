# Attendance Module

## What This Module Does

Handles student attendance check-in and record retrieval.

- **GPS direct check-in:** Student submits GPS coordinates → server validates geofence (Haversine formula) → spoofing detection → writes `AttendanceRecord`. GPS coordinates are **never stored** — only the boolean geofence result is implicit in the record.
- **Spoofing detection:** Precision spoofing, mock location, and Nigeria bounds checks. Flagged records receive `PENDING_REVIEW` status for human review.
- **Concurrent session detection:** Blocks check-in if the student is already `PRESENT` in another active session and raises a `CONCURRENT_SESSION_CONFLICT` anomaly flag.
- **Attendance list:** Paginated, filtered list of the authenticated student's own records with full session details.

## Endpoints

| Method | Path                      | Roles   | Description                                       |
| ------ | ------------------------- | ------- | ------------------------------------------------- |
| POST   | `/attendance/checkin/gps` | STUDENT | GPS direct check-in with geofence validation      |
| GET    | `/attendance`             | STUDENT | List own attendance records (paginated, filtered) |

## Guard Chain

`authenticate → requireRoles(STUDENT)` on all routes.

## Security Invariants

- GPS coordinates submitted by the student are **never written** to any database table.
- Server-side geofence validation is the security control — the mobile GPS check is UX only.
- Spoofing flags produce `PENDING_REVIEW`, not auto-rejection.
- Concurrent session conflict blocks check-in and raises an `AnomalyFlag`.

## Error Codes

| Code                 | Status | Meaning                                                                                                         |
| -------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| `SESSION_CLOSED`     | 400    | Session is not in `ACTIVE` state                                                                                |
| `OUTSIDE_GEOFENCE`   | 400    | Student is outside the venue geofence (includes `details.distanceMetres` and optional `details.hint` if ≤ 200m) |
| `CONCURRENT_SESSION` | 400    | Student already `PRESENT` in another active session                                                             |
| `FORBIDDEN`          | 403    | Student not enrolled in this course                                                                             |
| `NOT_FOUND`          | 404    | Student or session does not exist                                                                               |
| `CONFLICT`           | 409    | Student already has `PRESENT` status for this session                                                           |

## Dependencies

- **Phase 07:** `validateGeofence`, `checkSpoofing`, `isWithinNigeriaBounds` from `@kwasu-ams/utils`
- **Phase 08:** `lib/redis.ts` for pub/sub events on `session:{id}:checkins`
- **Phase 17:** `AnomalyFlag` creation via `anomalies.service.createAnomalyFlag()`
- **Phase 18:** `CourseSession` with `status: 'ACTIVE'`

## Consumed By

- **Phase 20:** QR and alphanumeric code check-in services reuse the geofence/spoofing helpers
- **Phase 38:** Web check-in UI
- **Phase 44:** Mobile check-in screen
