# Excuses Module

Handles the full excuse letter lifecycle for KWASU AMS.

## Endpoints

| Method | Path                        | Roles                               | Description                                  |
| ------ | --------------------------- | ----------------------------------- | -------------------------------------------- |
| POST   | /excuses                    | STUDENT                             | Submit excuse with optional document uploads |
| GET    | /excuses                    | STUDENT, LECTURER, HOD, SUPER_ADMIN | List excuses (scope-aware)                   |
| GET    | /excuses/:id                | STUDENT, LECTURER, HOD, SUPER_ADMIN | Get excuse detail                            |
| PATCH  | /excuses/:id/review         | LECTURER, HOD, SUPER_ADMIN          | Approve or reject                            |
| PATCH  | /excuses/:id/appeal         | STUDENT                             | Appeal a rejection                           |
| PATCH  | /excuses/:id/hod-review     | HOD, SUPER_ADMIN                    | Final HOD decision                           |
| GET    | /excuses/:id/documents/:key | STUDENT, LECTURER, HOD, SUPER_ADMIN | Pre-signed S3 URL                            |

## State Machine

```
SUBMITTED → UNDER_REVIEW → APPROVED (terminal)
                         → REJECTED → APPEAL_SUBMITTED → HOD_APPROVED (terminal)
                                                        → HOD_REJECTED (terminal)
```

## Dependencies

- Phase 19: `AttendanceRecord` model
- Phase 08: `lib/s3.ts` for document upload and pre-signed URLs
- Phase 17: `anomaliesService.createAnomalyFlag()` for `REPEATED_DAY_PATTERN`
