# Welfare Module

Welfare referral system for students at academic risk.

## Endpoints

| Method | Path                      | Roles                                    | Description                   |
| ------ | ------------------------- | ---------------------------------------- | ----------------------------- |
| GET    | /welfare                  | SUPER_ADMIN, ACADEMIC_AFFAIRS, DEAN, HOD | List welfare referral records |
| POST   | /welfare/check/:studentId | SUPER_ADMIN, ACADEMIC_AFFAIRS, HOD       | Check and trigger referral    |

## Rules

- A student needs a referral if they have `effectivePercentage < 70` in **3 or more** courses.
- Welfare referrals do **not** change any `AttendanceRecord` or `ExamEligibility` records.
- The student notification is compassionate and does **not** mention specific percentages or course names.
- The HOD notification includes the student's name and the number of at-risk courses.
- Referrals are logged in `AuditLog` with `metadata.type = 'WELFARE_REFERRAL'`.
