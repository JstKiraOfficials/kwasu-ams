# Jobs Module

BullMQ queue definitions, workers, and schedulers for KWASU AMS background processing.

## Structure

```
jobs/
├── queue.ts          ← All BullMQ queue instances and typed job data interfaces
├── workers/          ← One worker file per queue
└── schedulers/       ← Cron-based job schedulers
```

## Queue Summary

| Queue                      | Worker                              | Trigger                                              | Retry |
| -------------------------- | ----------------------------------- | ---------------------------------------------------- | ----- |
| `audit-log`                | `audit-log.worker.ts`               | Any state-changing operation (non-security-critical) | 0     |
| `notification-dispatch`    | `notification-dispatch.worker.ts`   | Any notification trigger                             | 3     |
| `anomaly-detection`        | `anomaly-detection.worker.ts`       | Session close (5s delay)                             | 3     |
| `eligibility-computation`  | `eligibility-computation.worker.ts` | Manual or semester-end scheduler                     | 3     |
| `early-intervention`       | `early-intervention.worker.ts`      | Weekly Monday 07:00 NST                              | 3     |
| `lecturer-accountability`  | `lecturer-accountability.worker.ts` | Weekly Monday 08:00 NST                              | 3     |
| `welfare-check`            | `welfare-check.worker.ts`           | Weekly Monday 06:00 NST                              | 3     |
| `weekly-summary`           | `weekly-summary.worker.ts`          | Weekly Monday 06:00 NST                              | 3     |
| `semester-reports`         | `semester-reports.worker.ts`        | Semester end date                                    | 3     |
| `class-register-pdf`       | `class-register-pdf.worker.ts`      | Sub-job from semester-reports                        | 3     |
| `student-report-card`      | `student-report-card.worker.ts`     | Sub-job from semester-reports                        | 3     |
| `bulk-account-creation`    | `bulk-account-creation.worker.ts`   | Admin CSV upload                                     | 3     |
| `smart-conflict-detection` | Phase 32                            | Phase 32                                             | 3     |
| `heatmap-refresh`          | Phase 34                            | Phase 34                                             | 3     |

## Security Note

**Security-critical audit events must NOT use `auditLogQueue`.** The following must remain as synchronous `prisma.auditLog.create()` calls:

- Login / logout
- Account lockout
- Password change
- TOTP enroll / reset
- Account creation / deletion
- Data export

Only high-volume, non-critical events (attendance recorded, session opened/closed, etc.) use the async queue.
