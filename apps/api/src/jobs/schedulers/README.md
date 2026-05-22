# BullMQ Schedulers

Cron-based job schedulers using BullMQ's `repeat` option.

All schedules use `tz: 'Africa/Lagos'` (UTC+1, no DST — Nigeria Standard Time).

## Schedulers

### `weekly-scheduler.ts`

Registered at server startup. Enqueues weekly jobs for the active semester:

| Time (NST) | Day    | Job                       |
| ---------- | ------ | ------------------------- |
| 06:00      | Monday | `welfare-check`           |
| 06:00      | Monday | `weekly-summary`          |
| 07:00      | Monday | `early-intervention`      |
| 08:00      | Monday | `lecturer-accountability` |

### `semester-end-scheduler.ts`

Runs daily at 01:00 NST. Checks:

1. If `semester.eligibilityComputeDate` has passed → enqueues `eligibility-computation`.
2. If `semester.endDate` has passed → enqueues `semester-reports`.

Uses stable `jobId` values so BullMQ deduplicates on restart.
