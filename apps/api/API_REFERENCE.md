# KWASU AMS — API Reference

**Base URL:** `http://localhost:3000` (dev) | `https://api.ams.kwasu.edu.ng` (prod)  
**Auth:** Bearer token — `Authorization: Bearer <accessToken>`  
**Rate limit (auth routes):** 5 req/min per IP  
**Rate limit (global):** 200 req/min per IP  

---

## Roles

| Role | Description |
|------|-------------|
| `SUPER_ADMIN` | Full system access |
| `ACADEMIC_AFFAIRS` | Academic admin access |
| `VICE_CHANCELLOR` | Executive read access |
| `DEAN` | Faculty-level access |
| `HOD` | Department-level access |
| `EXAM_OFFICER` | Eligibility & exam access |
| `LECTURER` | Teaching staff access |
| `STUDENT` | Student access |

---

## Authentication Flow

```
POST /auth/login          → interimToken (5 min)
POST /auth/setup-totp     → qrCodeUri + secret   (first-time enrollment)
POST /auth/confirm-totp   → backupCodes           (confirm enrollment)
POST /auth/verify-totp    → accessToken + refreshToken (login complete)
POST /auth/refresh        → new accessToken + refreshToken
POST /auth/logout         → invalidates refreshToken
```

---

## 1. Auth (`/auth`)

> All auth routes: 5 req/min rate limit.

### `POST /auth/login`
**Auth:** None  
**Description:** Password login. Returns a 5-min interim token for the TOTP step.

**Request Body:**
```json
{
  "identifier": "22/47CSC/00001",  // matric number or staff ID
  "password": "string"
}
```
**Response `200`:**
```json
{ "interimToken": "string" }
```
**Errors:** `401` wrong credentials, `423` account locked

---

### `POST /auth/verify-totp`
**Auth:** Interim token (Bearer)  
**Description:** Verifies 6-digit TOTP code. Issues full JWT pair. ±1 step tolerance (90s window).

**Request Body:**
```json
{ "code": "123456" }
```
**Response `200`:**
```json
{
  "accessToken": "string",  // 30-min
  "refreshToken": "string"  // 7-day
}
```
**Errors:** `401` invalid code, `403` TOTP not enrolled

---

### `POST /auth/setup-totp`
**Auth:** Interim token (Bearer)  
**Description:** Generates a TOTP secret. Returns QR URI for authenticator app enrollment.

**Request Body:** _(none)_  
**Response `200`:**
```json
{
  "secret": "BASE32SECRET",
  "qrCodeUri": "otpauth://totp/KWASU-AMS:user@example.com?secret=..."
}
```
**Errors:** `409` already enrolled

---

### `POST /auth/confirm-totp`
**Auth:** Interim token (Bearer)  
**Description:** Confirms TOTP enrollment. Shows backup codes **once** — save them.

**Request Body:**
```json
{ "code": "123456" }
```
**Response `200`:**
```json
{
  "backupCodes": ["ABC12345", "XYZ67890", "..."],  // 8 codes, shown once
  "message": "TOTP enrollment complete"
}
```

---

### `POST /auth/refresh`
**Auth:** None  
**Description:** Rotates token pair. Old refresh token is immediately invalidated.

**Request Body:**
```json
{ "refreshToken": "string" }
```
**Response `200`:**
```json
{
  "accessToken": "string",
  "refreshToken": "string"
}
```

---

### `POST /auth/logout`
**Auth:** Access token (Bearer)  
**Description:** Blocklists the refresh token. Access token expires naturally.

**Request Body:**
```json
{ "refreshToken": "string" }  // optional
```
**Response `200`:** `{ "message": "Logged out" }`

---

### `POST /auth/change-password`
**Auth:** Access token (Bearer)  
**Description:** Changes password. Clears `mustChangePassword` flag.

**Request Body:**
```json
{
  "currentPassword": "string",
  "newPassword": "string"  // min 12 chars, upper+lower+digit+special
}
```
**Response `200`:** `{ "message": "Password changed" }`

---

### `POST /auth/forgot-password`
**Auth:** None  
**Description:** Sends reset link to registered email. Always returns 200 (anti-enumeration).

**Request Body:**
```json
{
  "identifier": "22/47CSC/00001",
  "email": "student@kwasu.edu.ng"
}
```
**Response `200`:** `{ "message": "..." }`

---

### `POST /auth/reset-password`
**Auth:** None  
**Description:** Consumes single-use reset token from email link and updates password.

**Request Body:**
```json
{
  "resetToken": "string",
  "newPassword": "string"
}
```
**Response `200`:** `{ "message": "Password reset" }`

---

### `POST /auth/recover-totp`
**Auth:** None  
**Description:** Bypasses TOTP using a backup code. Issues full JWT pair. Consumes the code permanently.

**Request Body:**
```json
{
  "identifier": "22/47CSC/00001",
  "recoveryCode": "ABC12345"
}
```
**Response `200`:**
```json
{
  "accessToken": "string",
  "refreshToken": "string"
}
```


---

## 2. Admin (`/admin`)

> All admin routes require `SUPER_ADMIN` unless noted.

### `GET /admin/users`
**Roles:** `SUPER_ADMIN`  
**Description:** Paginated list of all users.

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| `role` | string | Filter by role |
| `isActive` | boolean | Filter by active status |
| `search` | string | Search by name/identifier |
| `page` | integer | Default: 1 |
| `pageSize` | integer | Default: 20, max: 100 |

**Response `200`:** `{ data: User[], total, page, pageSize }`

---

### `POST /admin/users`
**Roles:** `SUPER_ADMIN`  
**Description:** Create a single user account.

**Request Body:**
```json
{
  "identifier": "KWASU/LEC/CSC/00134",
  "email": "staff@kwasu.edu.ng",
  "role": "LECTURER",
  "firstName": "string",
  "lastName": "string",
  "phone": "string"
}
```
**Response `201`:** User object. **`409`** if identifier already exists.

---

### `GET /admin/users/:id`
**Roles:** `SUPER_ADMIN`  
**Params:** `id` (UUID)  
**Response `200`:** Full user object. **`404`** if not found.

---

### `PATCH /admin/users/:id`
**Roles:** `SUPER_ADMIN`  
**Params:** `id` (UUID)  
**Description:** Update user fields (email, phone, isActive, role, scopeId).

**Request Body:** _(any subset of user fields)_  
**Response `200`:** Updated user. **`404`** if not found.

---

### `DELETE /admin/users/:id`
**Roles:** `SUPER_ADMIN`  
**Params:** `id` (UUID)  
**Description:** Soft-delete — sets `deletedAt` and `isActive = false`. Never hard-deletes.  
**Response `200`:** `{ "message": "User deleted" }`

---

### `POST /admin/users/import`
**Roles:** `SUPER_ADMIN`  
**Description:** Bulk import users from a CSV file (multipart form data).

**Form Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `file` | file | CSV with columns: identifier, email, role, firstName, lastName |
| `dryRun` | boolean | If `true`, validates only — no accounts created |

**Response `200`** (dryRun): preview + validation errors  
**Response `201`** (live): `{ created, skipped, errors[] }`

---

### `POST /admin/users/:id/reset-totp`
**Roles:** `SUPER_ADMIN`  
**Params:** `id` (UUID)  
**Description:** Clears TOTP secret and backup codes. User must re-enroll on next login.  
**Response `200`:** `{ "message": "TOTP reset" }`

---

### `GET /admin/academic-sessions`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `VICE_CHANCELLOR`  
**Response `200`:** `AcademicSession[]`

---

### `POST /admin/academic-sessions`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`

**Request Body:**
```json
{
  "name": "2024/2025",
  "startDate": "2024-09-01T00:00:00Z",
  "endDate": "2025-07-31T00:00:00Z"
}
```
**Response `201`:** AcademicSession object. **`409`** if name already exists.

---

### `PATCH /admin/academic-sessions/:id/activate`
**Roles:** `SUPER_ADMIN`  
**Params:** `id` (UUID)  
**Description:** Activates this session; deactivates all others.  
**Response `200`:** Updated session.

---

### `POST /admin/academic-sessions/:id/semesters`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`  
**Params:** `id` (UUID) — academic session ID

**Request Body:**
```json
{
  "type": "FIRST",                       // FIRST | SECOND | THIRD
  "startDate": "2024-09-01T00:00:00Z",
  "endDate": "2025-01-31T00:00:00Z",
  "examStartDate": "2025-01-15T00:00:00Z",          // optional
  "eligibilityComputeDate": "2025-01-10T00:00:00Z", // optional
  "eligibilityThreshold": 75,                        // optional, default 75
  "appealWindowDays": 5,                             // optional
  "maxApprovedExcuses": 3                            // optional
}
```
**Response `201`:** Semester object.

---

### `PATCH /admin/academic-sessions/:id/semesters/:semesterId/activate`
**Roles:** `SUPER_ADMIN`  
**Description:** Activates a semester within a session.

---

### `PATCH /admin/academic-sessions/:id/semesters/:semesterId/freeze`
**Roles:** `SUPER_ADMIN`  
**Description:** Freezes a semester — locks eligibility records from non-admin overrides.

---

## 3. Users (`/users`)

### `GET /users/me`
**Auth:** Any authenticated role  
**Description:** Returns the current user's full profile.  
**Response `200`:** User + linked student/lecturer profile.

---

### `PATCH /users/me`
**Auth:** Any authenticated role  
**Description:** Update own profile (firstName, lastName, phone, avatar).

**Request Body:** _(any updatable fields)_  
**Response `200`:** Updated user.

---

### `GET /users/me/access-log`
**Auth:** Any authenticated role  
**Description:** Returns own audit log entries (login events, password changes).  
**Query Params:** `page`, `pageSize`  
**Response `200`:** `{ data: AuditLog[], total }`

---

### `POST /users/me/data-export`
**Auth:** Any authenticated role  
**Description:** NDPA-compliant export. Generates a JSON archive of all own data and emails a download link.  
**Response `200`:** `{ "message": "Export queued" }`


---

## 4. Academic Structure

### Faculties (`/faculties`)

#### `GET /faculties`
**Roles:** All authenticated  
**Query Params:** `page`, `pageSize`, `search`  
**Response `200`:** `{ data: Faculty[], total }`

#### `POST /faculties`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`

**Request Body:**
```json
{ "name": "Faculty of Computing", "code": "FCP", "deanId": "uuid" }
```
**Response `201`:** Faculty object.

#### `GET /faculties/:id`
**Roles:** All authenticated  
**Response `200`:** Faculty with departments.

#### `PATCH /faculties/:id`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`  
**Body:** Any subset of faculty fields.

#### `DELETE /faculties/:id`
**Roles:** `SUPER_ADMIN`  
**Response `200`:** `{ "message": "Faculty deleted" }`

---

### Departments (`/departments`)

#### `GET /departments`
**Roles:** All authenticated  
**Query Params:** `facultyId` (uuid), `page`, `pageSize`, `search`  
**Response `200`:** `{ data: Department[], total }`

#### `POST /departments`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`

**Request Body:**
```json
{
  "name": "Computer Science",
  "code": "CSC",
  "facultyId": "uuid",
  "hodId": "uuid"
}
```

#### `GET /departments/:id`
**Roles:** All authenticated

#### `PATCH /departments/:id`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`

#### `DELETE /departments/:id`
**Roles:** `SUPER_ADMIN`

---

### Programmes (`/programmes`)

#### `GET /programmes`
**Roles:** All authenticated  
**Query Params:** `departmentId`, `page`, `pageSize`

#### `POST /programmes`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`

**Request Body:**
```json
{
  "name": "B.Sc. Computer Science",
  "code": "BSC-CSC",
  "departmentId": "uuid",
  "durationYears": 4
}
```

#### `GET /programmes/:id`
#### `PATCH /programmes/:id`
#### `DELETE /programmes/:id`

---

### Courses (`/courses`)

#### `GET /courses`
**Roles:** All authenticated  
**Query Params:** `departmentId`, `level`, `semesterId`, `page`, `pageSize`  
**Response `200`:** `{ data: Course[], total }`

#### `POST /courses`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `HOD`

**Request Body:**
```json
{
  "title": "Data Structures & Algorithms",
  "code": "CSC301",
  "departmentId": "uuid",
  "units": 3,
  "level": 300,
  "isElective": false
}
```

#### `GET /courses/:id`
**Roles:** All authenticated

#### `PATCH /courses/:id`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `HOD`

#### `DELETE /courses/:id`
**Roles:** `SUPER_ADMIN`

#### `POST /courses/:id/sections`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `HOD`  
**Description:** Create a course section (links course to a lecturer and semester).

**Request Body:**
```json
{
  "lecturerId": "uuid",
  "semesterId": "uuid",
  "maxEnrollment": 80
}
```
**Response `201`:** CourseSection object.

---

### Students (`/students`)

#### `GET /students`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `DEAN`, `HOD`, `LECTURER`  
**Query Params:** `programmeId`, `level`, `search`, `page`, `pageSize`

#### `GET /students/:id`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `DEAN`, `HOD`, `LECTURER`, `STUDENT` (own)

#### `POST /students`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`

**Request Body:**
```json
{
  "userId": "uuid",
  "matricNumber": "22/47CSC/00001",
  "programmeId": "uuid",
  "level": 300
}
```

#### `PATCH /students/:id`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`

**Request Body:**
```json
{
  "programmeId": "uuid",
  "level": 400,
  "hasCarryOver": true
}
```

---

### Lecturers (`/lecturers`)

#### `GET /lecturers`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `DEAN`, `HOD`  
**Query Params:** `departmentId`, `search`, `page`, `pageSize`

#### `GET /lecturers/:id`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `DEAN`, `HOD`, `LECTURER`  
> Note: `accountabilityScore` is hidden when requesting role is `LECTURER`.

#### `POST /lecturers`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`

**Request Body:**
```json
{
  "userId": "uuid",
  "staffId": "KWASU/LEC/CSC/00134",
  "departmentId": "uuid",
  "title": "Dr."
}
```

#### `PATCH /lecturers/:id`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`

---

### Venues (`/venues`)

#### `GET /venues`
**Roles:** All authenticated  
**Query Params:** `capacity`, `page`, `pageSize`

#### `POST /venues`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`

**Request Body:**
```json
{
  "name": "LT1",
  "building": "Faculty of Computing",
  "capacity": 200,
  "latitude": 8.4897,
  "longitude": 4.5426,
  "radiusMeters": 50
}
```

#### `GET /venues/:id`
#### `PATCH /venues/:id`
#### `DELETE /venues/:id`


---

## 5. Timetable (`/timetable`)

### `GET /timetable/student/:studentId`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `HOD`, `LECTURER`, `STUDENT` (own)  
**Params:** `studentId` (UUID)  
**Query Params:** `semesterId` (UUID, optional)  
**Response `200`:** `TimetableEntry[]` for that student's enrolled sections.

---

### `GET /timetable/lecturer/:lecturerId`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `HOD`, `LECTURER` (own)  
**Params:** `lecturerId` (UUID)  
**Query Params:** `semesterId` (UUID, optional)  
**Response `200`:** `TimetableEntry[]` for that lecturer's assigned sections.

---

### `GET /timetable`
**Roles:** All authenticated  
**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| `semesterId` | uuid | Filter by semester |
| `courseSectionId` | uuid | Filter by section |
| `venueId` | uuid | Filter by venue |
| `dayOfWeek` | string | MONDAY–SATURDAY |
| `page` | integer | Default: 1 |
| `pageSize` | integer | Max: 100 |

**Response `200`:** `{ data: TimetableEntry[], total }`

---

### `GET /timetable/:id`
**Roles:** All authenticated  
**Params:** `id` (UUID)

---

### `POST /timetable`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `HOD`  
**Description:** Creates an entry with smart conflict detection (venue + lecturer clash).

**Request Body:**
```json
{
  "courseSectionId": "uuid",
  "semesterId": "uuid",
  "venueId": "uuid",
  "dayOfWeek": "MONDAY",
  "startTime": "09:00",
  "endTime": "11:00"
}
```
**Response `201`:** TimetableEntry. **`409`** venue or lecturer conflict.

---

### `PATCH /timetable/:id`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `HOD`  
**Body:** Any subset of timetable fields. Conflict detection re-runs.  
**Response `200`:** Updated entry. **`409`** conflict.

---

### `DELETE /timetable/:id`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `HOD`  
**Response `200`:** `{ "message": "Entry deleted" }`

---

## 6. Enrollments (`/enrollments`)

### `GET /enrollments/my`
**Roles:** `STUDENT`  
**Description:** Lists all course section enrollments for the logged-in student.  
**Query Params:** `semesterId` (UUID, optional)  
**Response `200`:** `CourseEnrollment[]`

---

### `POST /enrollments`
**Roles:** `STUDENT`  
**Description:** Enroll in a course section.

**Request Body:**
```json
{ "courseSectionId": "uuid" }
```
**Response `201`:** CourseEnrollment. **`409`** already enrolled.

---

### `DELETE /enrollments/:id`
**Roles:** `STUDENT`, `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`  
**Params:** `id` (UUID)  
**Description:** Drop an enrollment. Students can only drop their own.  
**Response `200`:** `{ "message": "Enrollment dropped" }`

---

## 7. Sessions (`/sessions`)

### `GET /sessions`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `DEAN`, `HOD`, `LECTURER`  
**Query Params:** `courseSectionId`, `semesterId`, `status`, `page`, `pageSize`  
**Response `200`:** `{ data: CourseSession[], total }`

---

### `POST /sessions`
**Roles:** `LECTURER`, `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`  
**Description:** Open a new class session and generate check-in tokens.

**Request Body:**
```json
{
  "courseSectionId": "uuid",
  "venueId": "uuid",
  "scheduledStart": "2024-11-04T09:00:00Z",
  "scheduledEnd": "2024-11-04T11:00:00Z"
}
```
**Response `201`:** `{ session, qrCode, attendanceCode }`

---

### `GET /sessions/:id`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `DEAN`, `HOD`, `LECTURER`, `STUDENT`  
**Params:** `id` (UUID)  
**Response `200`:** Session with attendance summary.

---

### `PATCH /sessions/:id/open`
**Roles:** `LECTURER`, `SUPER_ADMIN`  
**Description:** Re-opens a closed session.  
**Response `200`:** Updated session.

---

### `PATCH /sessions/:id/close`
**Roles:** `LECTURER`, `SUPER_ADMIN`  
**Description:** Closes a session — no further check-ins accepted.  
**Response `200`:** Updated session.

---

### `PATCH /sessions/:id/attendance/:studentId/override`
**Roles:** `LECTURER`, `HOD`, `SUPER_ADMIN`  
**Description:** Manually marks a student present/absent with justification.

**Request Body:**
```json
{
  "status": "PRESENT",
  "justification": "Student was present but device failed"
}
```
**Response `200`:** Override record.

---

### `GET /sessions/:id/overrides`
**Roles:** `LECTURER`, `HOD`, `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`  
**Description:** Lists all manual overrides for a session.  
**Response `200`:** `ManualOverride[]`

---

### `POST /overrides/:id/approve`
**Roles:** `HOD`, `SUPER_ADMIN`  
**Params:** `id` (UUID) — override ID  
**Response `200`:** Approved override.

---

### `POST /overrides/:id/reject`
**Roles:** `HOD`, `SUPER_ADMIN`  
**Body:** `{ "reason": "string" }`  
**Response `200`:** Rejected override.


---

## 8. Attendance (`/attendance`)

### `GET /attendance`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `DEAN`, `HOD`, `LECTURER`, `STUDENT`  
**Description:** Lists attendance records (scope-aware — students see only own records).

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| `sessionId` | uuid | Filter by session |
| `studentId` | uuid | Filter by student |
| `courseSectionId` | uuid | Filter by section |
| `status` | string | `PRESENT`, `ABSENT`, `EXCUSED`, `LATE` |
| `page` | integer | Default: 1 |
| `pageSize` | integer | Max: 100 |

**Response `200`:** `{ data: AttendanceRecord[], total }`

---

### `POST /attendance/checkin/gps`
**Roles:** `STUDENT` only  
**Description:** GPS-based check-in. Validates device fingerprint and distance from venue.

**Request Body:**
```json
{
  "sessionId": "uuid",
  "deviceFingerprint": "string",
  "latitude": 8.4897,
  "longitude": 4.5426
}
```
**Response `201`:** AttendanceRecord.  
**Errors:** `403` outside radius, `409` already checked in, `422` session closed.

---

### `POST /attendance/checkin/qr`
**Roles:** `STUDENT` only  
**Description:** QR code check-in. Validates the session QR token.

**Request Body:**
```json
{
  "sessionId": "uuid",
  "qrToken": "string",
  "deviceFingerprint": "string"
}
```
**Response `201`:** AttendanceRecord.

---

### `POST /attendance/checkin/code`
**Roles:** `STUDENT` only  
**Description:** Alphanumeric attendance code check-in (shown on projector).

**Request Body:**
```json
{
  "sessionId": "uuid",
  "code": "string",
  "deviceFingerprint": "string"
}
```
**Response `201`:** AttendanceRecord.

---

## 9. Excuses (`/excuses`)

### `POST /excuses`
**Roles:** `STUDENT` only  
**Description:** Submit an excuse letter with optional document attachments.  
**Content-Type:** `multipart/form-data`

**Form Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | uuid | ✅ | The missed session |
| `reason` | string (enum) | ✅ | `MEDICAL`, `BEREAVEMENT`, `OFFICIAL_DUTY`, `EMERGENCY`, `OTHER` |
| `explanation` | string | ✅ | Min 20 chars |
| `documents` | file(s) | ❌ | PDF/JPG/PNG, max 5 files, 5MB each |

**Response `201`:** ExcuseLetter object.

---

### `GET /excuses`
**Roles:** `STUDENT`, `LECTURER`, `HOD`, `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`  
**Description:** Scope-aware — students see only own excuses.

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `APPEAL_SUBMITTED`, `HOD_APPROVED`, `HOD_REJECTED` |
| `courseSectionId` | uuid | Filter by course |
| `page` | integer | Default: 1 |
| `pageSize` | integer | Max: 100 |

---

### `GET /excuses/:id`
**Roles:** `STUDENT` (own), `LECTURER`, `HOD`, `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`

---

### `PATCH /excuses/:id/review`
**Roles:** `LECTURER`, `HOD`, `SUPER_ADMIN`  
**Description:** Lecturer approves or rejects an excuse.

**Request Body:**
```json
{
  "decision": "APPROVED",  // or "REJECTED"
  "comment": "Medical certificate verified"
}
```
**Response `200`:** Updated excuse.

---

### `PATCH /excuses/:id/appeal`
**Roles:** `STUDENT` only  
**Description:** Student appeals a rejected excuse.

**Request Body:**
```json
{ "appealReason": "string (min 20 chars)" }
```
**Response `200`:** Excuse with status `APPEAL_SUBMITTED`.

---

### `PATCH /excuses/:id/hod-review`
**Roles:** `HOD`, `SUPER_ADMIN`  
**Description:** HOD makes final decision on an appealed excuse.

**Request Body:**
```json
{
  "decision": "HOD_APPROVED",  // or "HOD_REJECTED"
  "comment": "string"
}
```

---

### `GET /excuses/:id/documents/:key`
**Roles:** `STUDENT` (own), `LECTURER`, `HOD`, `SUPER_ADMIN`  
**Params:** `id` (excuse UUID), `key` (S3 key)  
**Description:** Returns a 15-minute pre-signed S3 URL for the document.  
**Response `200`:** `{ "url": "https://s3.example.com/..." }`

---

## 10. Eligibility (`/eligibility`)

### `GET /eligibility/student/:studentId`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `DEAN`, `HOD`, `EXAM_OFFICER`, `STUDENT` (own)  
**Params:** `studentId` (UUID)  
**Query Params:** `semesterId`  
**Response `200`:** `ExamEligibility[]` per enrolled course.

---

### `GET /eligibility/course/:courseSectionId`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `HOD`, `EXAM_OFFICER`, `LECTURER`  
**Params:** `courseSectionId` (UUID)  
**Response `200`:** All eligibility records for a course section.

---

### `GET /eligibility/at-risk`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `DEAN`, `HOD`, `EXAM_OFFICER`, `LECTURER`  
**Description:** Lists students below the attendance threshold.  
**Query Params:** `semesterId`, `courseSectionId`, `threshold` (number), `page`, `pageSize`  
**Response `200`:** `{ data: AtRiskStudent[], total }`

---

### `POST /eligibility/compute`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `EXAM_OFFICER`  
**Description:** Triggers eligibility computation job for a semester.

**Request Body:**
```json
{ "semesterId": "uuid" }
```
**Response `202`:** `{ "message": "Computation queued" }`

---

### `POST /eligibility/freeze/:semesterId`
**Roles:** `SUPER_ADMIN`  
**Params:** `semesterId` (UUID)  
**Description:** Freezes all eligibility records for a semester. Prevents further automatic changes.  
**Response `200`:** `{ "message": "Semester frozen" }`

---

### `PATCH /eligibility/:id/override`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `EXAM_OFFICER`, `HOD`, `DEAN`  
**Params:** `id` (UUID)  
**Description:** Manual override of computed eligibility status.

**Request Body:**
```json
{
  "status": "ELIGIBLE",  // ELIGIBLE | BARRED | CONDITIONAL
  "justification": "string"
}
```

---

### `POST /eligibility/:id/appeal`
**Roles:** `STUDENT`  
**Params:** `id` (UUID)  
**Description:** Student appeals a BARRED eligibility status.

**Request Body:**
```json
{ "reason": "string (min 20 chars)" }
```

---

### `PATCH /eligibility/:id/appeal/decide`
**Roles:** `SUPER_ADMIN`, `EXAM_OFFICER`, `ACADEMIC_AFFAIRS`  
**Description:** Final decision on a student's eligibility appeal.

**Request Body:**
```json
{
  "decision": "APPROVED",  // or "REJECTED"
  "comment": "string"
}
```


---

## 11. Anomalies (`/anomalies`)

> Anomaly flags are auto-generated by the background detection worker (GPS spoofing, impossible travel, shared device, etc.)

### `GET /anomalies`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `DEAN`, `HOD`, `LECTURER`

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| `sessionId` | uuid | Filter by session |
| `studentId` | uuid | Filter by student |
| `flagType` | string | e.g. `GPS_SPOOF`, `IMPOSSIBLE_TRAVEL`, `SHARED_DEVICE` |
| `isReviewed` | boolean | Filter reviewed/unreviewed |
| `page` | integer | Default: 1 |
| `pageSize` | integer | Max: 100 |

**Response `200`:** `{ data: AnomalyFlag[], total }`

---

### `GET /anomalies/:id`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `DEAN`, `HOD`, `LECTURER`  
**Response `200`:** AnomalyFlag with full details.

---

### `PATCH /anomalies/:id/review`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `DEAN`, `HOD`, `LECTURER`

**Request Body:**
```json
{
  "action": "CONFIRMED_PRESENT",  // CONFIRMED_PRESENT | CONFIRMED_ABSENT | ESCALATED
  "note": "string (min 5 chars)"
}
```
**Response `200`:** Reviewed flag. **`409`** already reviewed.

---

## 12. Notifications (`/notifications`)

### `GET /notifications`
**Roles:** All authenticated  
**Description:** Lists own notifications.

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| `channel` | string | `PUSH`, `SMS`, `EMAIL` |
| `page` | integer | Default: 1 |
| `pageSize` | integer | Max: 100 |

**Response `200`:** `{ data: Notification[], total, unreadCount }`

---

### `PATCH /notifications/:id/read`
**Roles:** All authenticated  
**Params:** `id` (UUID)  
**Description:** Marks a notification as read.  
**Response `200`:** Updated notification.

---

### `POST /notifications/fcm-token`
**Roles:** All authenticated  
**Description:** Registers a Firebase Cloud Messaging token for push notifications (mobile).

**Request Body:**
```json
{
  "token": "firebase-fcm-token-string",
  "platform": "ios"  // or "android"
}
```
**Response `200`:** `{ "message": "Token registered" }`

---

### `POST /notifications/warn-student`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `HOD`, `LECTURER`, `EXAM_OFFICER`  
**Description:** Sends a manual attendance warning to a student via all channels.

**Request Body:**
```json
{
  "studentId": "uuid",
  "courseSectionId": "uuid",
  "message": "string (optional custom message)"
}
```
**Response `200`:** `{ "message": "Warning sent" }`

---

## 13. Dashboard & Analytics

### `GET /dashboard`
**Roles:** All authenticated  
**Description:** Returns role-scoped dashboard data. Cached 60 seconds in Redis.

**Response `200`** (varies by role):
```json
{
  // STUDENT: enrollments, attendance %, at-risk courses, next session
  // LECTURER: today's sessions, pending overrides, at-risk students
  // HOD/DEAN: department attendance overview, anomaly count
  // SUPER_ADMIN: system-wide stats, active sessions count
}
```

---

### `GET /analytics/course/:courseSectionId`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `DEAN`, `HOD`, `LECTURER`  
**Params:** `courseSectionId` (UUID)  
**Query Params:** `semesterId` (UUID, optional)

**Response `200`:**
```json
{
  "courseSectionId": "uuid",
  "totalSessions": 20,
  "avgAttendanceRate": 78.5,
  "trend": "IMPROVING",  // IMPROVING | DECLINING | STABLE
  "sessionBreakdown": [...],
  "distribution": { "PRESENT": 120, "ABSENT": 30, "EXCUSED": 5 }
}
```

---

### `GET /analytics/student/:studentId`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `DEAN`, `HOD`, `LECTURER`, `STUDENT`  
**Params:** `studentId` (UUID)  
**Query Params:** `semesterId` (UUID, optional)

**Response `200`:**
```json
{
  "studentId": "uuid",
  "overallRate": 72.0,
  "courseBreakdown": [...],
  "dynamicMessage": "You need 3 more classes to reach 75% in CSC301",
  "absenceClustering": true,
  "benchmarkRank": "bottom_quartile"
}
```

---

### `GET /analytics/heatmap/live`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `VICE_CHANCELLOR`, `DEAN`  
**Description:** Live venue occupancy heatmap across campus. Cached 30 seconds.

**Response `200`:**
```json
{
  "timestamp": "2024-11-04T10:00:00Z",
  "venues": [
    {
      "venueId": "uuid",
      "name": "LT1",
      "activeSession": true,
      "checkInsLast30Min": 87,
      "latitude": 8.4897,
      "longitude": 4.5426
    }
  ]
}
```

---

## 14. Devices (`/devices`)

### `GET /devices`  _(aliased as `/devices/my`)_
**Roles:** `STUDENT`  
**Description:** Lists own registered device bindings.  
**Response `200`:** `DeviceBinding[]`

---

### `POST /devices`
**Roles:** `STUDENT`  
**Description:** Register a new device for check-in.

**Request Body:**
```json
{
  "deviceFingerprint": "string (min 10 chars)",
  "platform": "android",  // ios | android
  "deviceModel": "Samsung Galaxy S24",
  "osVersion": "Android 14",
  "isPrimary": true
}
```
**Response `201`:** DeviceBinding. **`403`** if device limit exceeded.

---

### `DELETE /devices/:id`
**Roles:** `STUDENT` (own), `SUPER_ADMIN`  
**Params:** `id` (UUID)  
**Body:** `{ "reason": "string (min 5 chars)" }`  
**Response `200`:** `{ "message": "Device revoked" }`

---

### `POST /admin/devices/:id/approve`
**Roles:** `SUPER_ADMIN`  
**Params:** `id` (UUID)  
**Description:** Approves a pending device binding.  
**Response `200`:** Updated DeviceBinding.

---

### `GET /admin/users/:userId/devices`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`  
**Params:** `userId` (UUID)  
**Response `200`:** `DeviceBinding[]` for that user.


---

## 15. Reports (`/reports`)

### `POST /reports/generate`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `DEAN`, `HOD`, `EXAM_OFFICER`  
**Description:** Queues a background job to generate a PDF/CSV report.

**Request Body:**
```json
{
  "type": "COURSE_ATTENDANCE",  // COURSE_ATTENDANCE | DEPARTMENT_SUMMARY | FACULTY_OVERVIEW | NUC_PACKAGE
  "semesterId": "uuid",
  "courseSectionId": "uuid",   // required for COURSE_ATTENDANCE
  "departmentId": "uuid",      // required for DEPARTMENT_SUMMARY
  "facultyId": "uuid",         // required for FACULTY_OVERVIEW
  "format": "PDF"              // PDF | CSV
}
```
**Response `202`:** `{ "jobId": "uuid", "message": "Report queued" }`

---

### `GET /reports/templates`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`  
**Description:** Lists all saved report templates.  
**Response `200`:** `ReportTemplate[]`

---

### `POST /reports/templates`
**Roles:** `SUPER_ADMIN`  
**Description:** Save a reusable report template.

**Request Body:**
```json
{
  "name": "Weekly Dept Summary",
  "type": "DEPARTMENT_SUMMARY",
  "config": { "threshold": 75, "includeExcuses": true }
}
```
**Response `201`:** ReportTemplate.

---

### `POST /reports/nuc-package`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `VICE_CHANCELLOR`  
**Description:** Generates a complete NUC accreditation data package for an academic session.

**Request Body:**
```json
{
  "academicSessionId": "uuid",
  "includeAnalytics": true
}
```
**Response `202`:** `{ "jobId": "uuid" }`

---

### `POST /reports/certificates`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `EXAM_OFFICER`  
**Description:** Generates individual attendance certificates for students.

**Request Body:**
```json
{
  "studentId": "uuid",
  "semesterId": "uuid"
}
```
**Response `202`:** `{ "jobId": "uuid" }`. Certificate uploaded to S3 on completion.

---

### `GET /reports/class-register/:courseSectionId`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `HOD`, `EXAM_OFFICER`, `LECTURER`  
**Params:** `courseSectionId` (UUID)  
**Query Params:** `semesterId` (UUID, optional)  
**Description:** Returns a pre-signed S3 URL for the class register PDF (generated on demand, idempotent).

**Response `200`:**
```json
{ "url": "https://s3.example.com/class-register-CSC301-S1.pdf", "expiresIn": 900 }
```

---

### `GET /reports/report-card/:studentId`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `HOD`, `EXAM_OFFICER`, `STUDENT` (own), `LECTURER`  
**Params:** `studentId` (UUID)  
**Query Params:** `semesterId` (UUID, optional)  
**Description:** Returns a pre-signed S3 URL for the student's attendance report card PDF.

**Response `200`:**
```json
{ "url": "https://s3.example.com/report-card-22-47CSC-00001.pdf", "expiresIn": 900 }
```

---

## 16. Audit Logs (`/audit-logs`)

### `GET /audit-logs`
**Roles:** `SUPER_ADMIN` only  
**Description:** Append-only log of all significant system actions.

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| `actorId` | uuid | Filter by actor |
| `action` | string | e.g. `USER_CREATED`, `ELIGIBILITY_OVERRIDDEN` |
| `entityType` | string | e.g. `User`, `ExamEligibility` |
| `entityId` | uuid | Filter by affected entity |
| `startDate` | datetime | ISO 8601 |
| `endDate` | datetime | ISO 8601 |
| `page` | integer | Default: 1 |
| `pageSize` | integer | Max: 100 |

**Response `200`:** `{ data: AuditLog[], total }`

---

### `GET /audit-logs/:id`
**Roles:** `SUPER_ADMIN`  
**Response `200`:** Full AuditLog entry.

---

## 17. Support Tickets (`/support`)

### `GET /support`
**Roles:** All authenticated  
**Description:** Lists own tickets (students) or all tickets (admins).  
**Query Params:** `status`, `page`, `pageSize`  
**Response `200`:** `{ data: SupportTicket[], total }`

---

### `POST /support`
**Roles:** All authenticated  
**Description:** Creates a support ticket.

**Request Body:**
```json
{
  "subject": "Cannot check in — device error",
  "description": "string (min 10 chars)",
  "category": "ATTENDANCE"  // ATTENDANCE | ACCOUNT | TECHNICAL | OTHER
}
```
**Response `201`:** SupportTicket.

---

### `GET /support/:id`
**Roles:** All authenticated (own ticket or admin)  
**Response `200`:** SupportTicket with thread.

---

### `PATCH /support/:id`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`  
**Description:** Update ticket status or assignment.

**Request Body:**
```json
{
  "status": "IN_PROGRESS",         // OPEN | IN_PROGRESS | RESOLVED | CLOSED
  "assignedRole": "ACADEMIC_AFFAIRS",
  "assignedToId": "uuid",
  "resolution": "string"
}
```

---

## 18. Welfare (`/welfare`)

### `GET /welfare`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `DEAN`, `HOD`  
**Description:** Lists students flagged for welfare concerns (chronic absenteeism, sudden drops).  
**Query Params:** `semesterId`, `departmentId`, `threshold`, `page`, `pageSize`  
**Response `200`:** `{ data: WelfareFlag[], total }`

---

### `POST /welfare/check/:studentId`
**Roles:** `SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, `HOD`, `DEAN`  
**Params:** `studentId` (UUID)  
**Description:** Triggers a manual welfare check for a specific student.  
**Response `200`:** `{ studentId, riskLevel, recommendations[] }`

---

## 19. Webhooks (`/webhooks`)

> All webhook routes are `SUPER_ADMIN` only.

### `GET /webhooks`
**Response `200`:** `WebhookSubscription[]`

---

### `POST /webhooks`
**Description:** Subscribe an external URL to one or more system events.

**Request Body:**
```json
{
  "url": "https://your-server.com/kwasu-webhook",
  "events": ["attendance.checkin", "eligibility.computed", "anomaly.detected"],
  "secret": "string (min 16 chars)"
}
```

**Available events:**
- `attendance.checkin`
- `attendance.override`
- `eligibility.computed`
- `eligibility.appeal.decided`
- `anomaly.detected`
- `excuse.submitted`
- `excuse.reviewed`
- `session.opened`
- `session.closed`

> Payloads are HMAC-SHA256 signed using your secret — verify the `X-KWASU-Signature` header.

**Response `201`:** WebhookSubscription.

---

### `DELETE /webhooks/:id`
**Params:** `id` (UUID)  
**Description:** Soft-deactivates a webhook subscription.  
**Response `200`:** `{ "message": "Webhook deleted" }`

---

## Error Response Format

All errors follow a consistent shape:

```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "code": "INSUFFICIENT_ROLE",
  "message": "You do not have permission to access this resource"
}
```

**Common error codes:**

| Code | HTTP | Description |
|------|------|-------------|
| `INVALID_CREDENTIALS` | 401 | Wrong password |
| `ACCOUNT_LOCKED` | 423 | Too many failed attempts |
| `TOTP_REQUIRED` | 403 | TOTP not verified |
| `TOTP_SETUP_REQUIRED` | 403 | User has not enrolled TOTP |
| `INSUFFICIENT_ROLE` | 403 | Role not allowed |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Duplicate / already exists |
| `VALIDATION_ERROR` | 422 | Schema validation failed |
| `ELIGIBILITY_FROZEN` | 400 | Semester is frozen |
| `SESSION_CLOSED` | 422 | Check-in on closed session |
| `OUTSIDE_GEOFENCE` | 403 | GPS check-in outside venue radius |

---

## Token Reference

| Token | Lifetime | Usage |
|-------|----------|-------|
| Interim token | 5 min | After login, before TOTP |
| Access token | 30 min | All authenticated endpoints |
| Refresh token | 7 days | `POST /auth/refresh` only |
| Reset token | 15 min | `POST /auth/reset-password` |

> Send tokens as: `Authorization: Bearer <token>`  
> Refresh token also set as `HttpOnly` cookie on `/auth/verify-totp`.
