# KWASU AMS — API Modules

**Backend complete.** All 20 modules have been implemented across Phases 10–34.

---

## Module Index

| #   | Module            | Phase  | Key Endpoints                                                                          |
| --- | ----------------- | ------ | -------------------------------------------------------------------------------------- |
| 01  | **auth**          | 10     | `POST /auth/login`, `/auth/totp/verify`, `/auth/refresh`, `/auth/logout`               |
| 02  | **users**         | 31     | `GET /users/me`, `PATCH /users/me`, `GET /users/:id`, `DELETE /users/:id`              |
| 03  | **admin**         | 12     | `POST /admin/users/bulk-import`, `POST /admin/users`, role and lock management         |
| 04  | **students**      | 13     | `GET /students/:id`, `PATCH /students/:id`, programme assignment                       |
| 05  | **lecturers**     | 14     | `GET /lecturers/:id`, accountability score, section assignment                         |
| 06  | **devices**       | 15     | `POST /devices/register`, `DELETE /devices/:id`, binding list                          |
| 07  | **faculties**     | 16     | `GET /faculties`, `POST /faculties`, DEAN assignment                                   |
| 08  | **departments**   | 16     | `GET /departments`, `POST /departments`, HOD assignment                                |
| 09  | **programmes**    | 16     | `GET /programmes`, `POST /programmes`                                                  |
| 10  | **courses**       | 17     | `GET /courses`, `POST /courses`, `PATCH /courses/:id`                                  |
| 11  | **timetable**     | 17     | `POST /timetable`, conflict detection, `GET /timetable/:sectionId`                     |
| 12  | **sessions**      | 18–20  | `POST /sessions`, open/close/lock, QR & alphanumeric code generation                   |
| 13  | **attendance**    | 21–22  | GPS/QR/code check-in, manual override, `GET /attendance/:sessionId`                    |
| 14  | **excuses**       | 23     | Submit, approve/reject, HOD escalation, appeal flow                                    |
| 15  | **eligibility**   | 24     | Compute eligibility, appeal, freeze, `GET /eligibility/:studentId`                     |
| 16  | **anomalies**     | 25     | Anomaly flag list, review, HOD awareness                                               |
| 17  | **notifications** | 26     | Dispatch push/SMS/email, history, read status                                          |
| 18  | **reports**       | 28, 33 | Custom reports, NUC package, attendance certificates, class register PDF, report cards |
| 19  | **analytics**     | 28, 34 | Dashboard, course analytics, student analytics, **live heatmap**                       |
| 20  | **audit**         | 29     | Audit log query, export                                                                |

**Supporting modules (not counted above):**

| Module           | Notes                                                       |
| ---------------- | ----------------------------------------------------------- |
| **integrations** | Webhooks delivery, event registry (Phase 30)                |
| **support**      | Support ticket CRUD (Phase 32)                              |
| **welfare**      | Welfare check results and welfare officer alerts (Phase 27) |
| **venues**       | Venue CRUD and geofence management (Phase 04)               |
| **webhooks**     | External webhook subscription management (Phase 30)         |

---

## Background Jobs (BullMQ)

| Queue                      | Worker                              | Schedule                      |
| -------------------------- | ----------------------------------- | ----------------------------- |
| `audit-log`                | `audit-log.worker.ts`               | On-demand                     |
| `notification-dispatch`    | `notification-dispatch.worker.ts`   | On-demand                     |
| `anomaly-detection`        | `anomaly-detection.worker.ts`       | 5 s delay after session close |
| `eligibility-computation`  | `eligibility-computation.worker.ts` | On-demand / semester-end      |
| `early-intervention`       | `early-intervention.worker.ts`      | Monday 07:00 NST              |
| `lecturer-accountability`  | `lecturer-accountability.worker.ts` | Monday 08:00 NST              |
| `welfare-check`            | `welfare-check.worker.ts`           | Monday 06:00 NST              |
| `weekly-summary`           | `weekly-summary.worker.ts`          | Monday 06:00 NST              |
| `smart-conflict-detection` | `smart-conflict-detector.worker.ts` | Monday 09:00 NST              |
| `semester-reports`         | `semester-reports.worker.ts`        | Semester end date             |
| `class-register-pdf`       | `class-register-pdf.worker.ts`      | Sub-job of semester-reports   |
| `student-report-card`      | `student-report-card.worker.ts`     | Sub-job of semester-reports   |
| `bulk-account-creation`    | `bulk-account-creation.worker.ts`   | On-demand (admin import)      |
| `heatmap-refresh`          | Inline in `queue.ts`                | Every 30 s                    |

---

## Architecture Notes

- All queues share a single `ioredis` connection from `lib/redis.ts`.
- Default retry policy: 3 attempts, exponential backoff (1 s, 2 s, 4 s). Exception: `audit-log` uses 0 retries.
- PDF generation uses `pdfkit` for class registers and `lib/pdf-generator.ts` for certificates and report cards.
- All generated PDFs are SHA-256 checksummed, uploaded to S3, and served via 1-hour pre-signed URLs.
- Heatmap data is cached in Redis with a 60-second TTL; the BullMQ repeating job refreshes it every 30 seconds.
- DEAN-scoped heatmap uses a separate Redis key (`heatmap:live:faculty:<facultyId>`) to avoid polluting the university-wide cache.

---

_Backend implementation complete — Phases 35–49 implement the web app, mobile app, E2E tests, and DevOps._
