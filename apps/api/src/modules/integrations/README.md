# Integrations Module

This module contains **stub implementations** for planned integrations with external KWASU systems.

## Status

All services are stubs pending external API specifications from KWASU IT department.

## Planned Integrations

| File                            | System                         | Purpose                                                  |
| ------------------------------- | ------------------------------ | -------------------------------------------------------- |
| `student-portal-sso.service.ts` | KWASU Student Portal           | Single Sign-On token exchange                            |
| `result-management.service.ts`  | Result Management System (RMS) | Semester result sync for eligibility cross-check         |
| `moodle-lms.service.ts`         | Moodle LMS                     | Attendance data export to Moodle gradebook               |
| `bursary.service.ts`            | KWASU Bursary                  | Financial clearance verification before exam eligibility |
| `hr-staff-sync.service.ts`      | KWASU HR System                | Lecturer and staff record synchronisation                |

## Implementation Notes

- Each stub exports the correct function signature so it can be imported and wired into future controllers without interface changes.
- All stubs throw `Error('Not implemented')` — they will be caught and surfaced as 501 errors if accidentally called before implementation.
- Routes: `integrations.routes.ts` is registered in `app.ts` but registers no actual HTTP endpoints in v1.0.
