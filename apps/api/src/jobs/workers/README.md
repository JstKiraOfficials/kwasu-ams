# BullMQ Workers

Each worker file exports a `process*` function and a `Worker` instance.

## Worker Registration

Workers are imported in `src/index.ts` at startup. They run in the same process as the API server in development. In production (Phase 48), they can be extracted to a separate worker process.

## Retry Policy

All workers use 3 retries with exponential backoff (1s, 2s, 4s), **except `audit-log.worker.ts`** which uses 0 retries.

## Idempotency

All workers are idempotent — running the same job twice produces no duplicate side effects. The eligibility computation worker uses `upsert`; the anomaly detection worker uses the unique constraint on `[studentId, sessionId, flagType]`.

## Workers

| File                                | Queue                     | Description                                   |
| ----------------------------------- | ------------------------- | --------------------------------------------- |
| `audit-log.worker.ts`               | `audit-log`               | Writes non-critical AuditLog records          |
| `notification-dispatch.worker.ts`   | `notification-dispatch`   | Dispatches push/SMS/email notifications       |
| `anomaly-detection.worker.ts`       | `anomaly-detection`       | Post-session anomaly pattern detection        |
| `eligibility-computation.worker.ts` | `eligibility-computation` | Computes exam eligibility for all enrollments |
| `early-intervention.worker.ts`      | `early-intervention`      | Projects at-risk students, notifies HODs      |
| `lecturer-accountability.worker.ts` | `lecturer-accountability` | Computes lecturer accountability scores       |
| `welfare-check.worker.ts`           | `welfare-check`           | Flags students below 70% in 3+ courses        |
| `weekly-summary.worker.ts`          | `weekly-summary`          | Sends weekly attendance summaries             |
| `semester-reports.worker.ts`        | `semester-reports`        | Orchestrates end-of-semester PDF generation   |
| `class-register-pdf.worker.ts`      | `class-register-pdf`      | Generates class register PDFs (Phase 28)      |
| `student-report-card.worker.ts`     | `student-report-card`     | Generates student report card PDFs (Phase 28) |
| `bulk-account-creation.worker.ts`   | `bulk-account-creation`   | Processes bulk CSV account imports (Phase 29) |
