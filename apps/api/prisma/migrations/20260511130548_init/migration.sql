-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ACADEMIC_AFFAIRS', 'VICE_CHANCELLOR', 'DEAN', 'HOD', 'EXAM_OFFICER', 'LECTURER', 'STUDENT');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'REVOKED', 'PENDING_APPROVAL');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGED', 'TOTP_ENROLLED', 'TOTP_RESET', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED', 'USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'ATTENDANCE_RECORDED', 'ATTENDANCE_OVERRIDDEN', 'EXCUSE_SUBMITTED', 'EXCUSE_APPROVED', 'EXCUSE_REJECTED', 'EXCUSE_APPEALED', 'HOD_EXCUSE_APPROVED', 'HOD_EXCUSE_REJECTED', 'ELIGIBILITY_COMPUTED', 'ELIGIBILITY_OVERRIDDEN', 'SESSION_CREATED', 'SESSION_OPENED', 'SESSION_CLOSED', 'SESSION_LOCKED', 'DEVICE_REGISTERED', 'DEVICE_REVOKED', 'BULK_IMPORT_STARTED', 'BULK_IMPORT_COMPLETED', 'REPORT_GENERATED', 'WEBHOOK_FIRED', 'SYSTEM_SETTING_CHANGED', 'DATA_EXPORT_REQUESTED');

-- CreateEnum
CREATE TYPE "AnomalyType" AS ENUM ('GPS_PRECISION_SPOOFING', 'GPS_VELOCITY_SPOOFING', 'MOCK_LOCATION_DETECTED', 'OUTSIDE_NIGERIA_BOUNDS', 'CONCURRENT_SESSION_CONFLICT', 'BOUNDARY_CLUSTERING', 'LAST_MINUTE_PATTERN', 'CLUSTER_IDENTICAL_GPS', 'REPEATED_DAY_PATTERN', 'HOD_AWARENESS_FLAG');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('ATTENDANCE_DISPUTE', 'ACCOUNT_ACCESS', 'TECHNICAL_ISSUE', 'EXCUSE_QUERY', 'ELIGIBILITY_QUERY', 'OTHER');

-- CreateEnum
CREATE TYPE "SemesterType" AS ENUM ('FIRST', 'SECOND', 'THIRD');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'CLOSED', 'LOCKED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'EXCUSED', 'LATE', 'MANUAL_OVERRIDE', 'PENDING_REVIEW');

-- CreateEnum
CREATE TYPE "CheckInMethod" AS ENUM ('GPS_DIRECT', 'QR_CODE', 'ALPHANUMERIC_CODE', 'FACE_RECOGNITION', 'MANUAL_OVERRIDE');

-- CreateEnum
CREATE TYPE "ExcuseStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'APPEAL_SUBMITTED', 'HOD_APPROVED', 'HOD_REJECTED');

-- CreateEnum
CREATE TYPE "ExcuseReason" AS ENUM ('MEDICAL', 'BEREAVEMENT', 'OFFICIAL_UNIVERSITY_ACTIVITY', 'GOVERNMENT_SUMMONS', 'TRANSPORT_SECURITY_EMERGENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "EligibilityStatus" AS ENUM ('PENDING', 'ELIGIBLE', 'BARRED', 'CONDITIONAL');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identifier" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "scopeId" UUID,
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "totpSecret" TEXT,
    "totpEnrolled" BOOLEAN NOT NULL DEFAULT false,
    "totpBackupCodes" TEXT[],
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockoutUntil" TIMESTAMP(3),
    "languagePreference" TEXT NOT NULL DEFAULT 'en',
    "fcmToken" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_bindings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "deviceFingerprint" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceModel" TEXT,
    "osVersion" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "device_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorId" UUID NOT NULL,
    "actorRole" "Role" NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomaly_flags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "studentId" UUID NOT NULL,
    "sessionId" UUID,
    "flagType" "AnomalyType" NOT NULL,
    "description" TEXT NOT NULL,
    "isReviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewAction" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anomaly_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipientId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "templateKey" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "externalId" TEXT,
    "failureReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "submittedById" UUID NOT NULL,
    "category" "TicketCategory" NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "assignedRole" "Role",
    "assignedToId" UUID,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "courseSectionId" UUID NOT NULL,
    "venueId" UUID NOT NULL,
    "lecturerId" UUID NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "qrToken" TEXT,
    "qrTokenExpiresAt" TIMESTAMP(3),
    "alphanumericCode" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "isMakeUp" BOOLEAN NOT NULL DEFAULT false,
    "overrideWindowEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "studentId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "checkInMethod" "CheckInMethod",
    "checkedInAt" TIMESTAMP(3),
    "deviceRooted" BOOLEAN NOT NULL DEFAULT false,
    "spoofingFlagged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attendanceRecordId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "actorRole" "Role" NOT NULL,
    "justification" TEXT NOT NULL,
    "beforeStatus" "AttendanceStatus" NOT NULL,
    "afterStatus" "AttendanceStatus" NOT NULL,
    "requiresAdminApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" UUID,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excuse_letters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "studentId" UUID NOT NULL,
    "attendanceRecordId" UUID,
    "courseSectionId" UUID NOT NULL,
    "absenceDates" TIMESTAMP(3)[],
    "reason" "ExcuseReason" NOT NULL,
    "otherExplanation" TEXT,
    "documentS3Keys" TEXT[],
    "status" "ExcuseStatus" NOT NULL DEFAULT 'SUBMITTED',
    "lecturerComment" TEXT,
    "lecturerReviewedById" UUID,
    "lecturerReviewedAt" TIMESTAMP(3),
    "hodComment" TEXT,
    "hodReviewedById" UUID,
    "hodReviewedAt" TIMESTAMP(3),
    "appealReason" TEXT,
    "appealSubmittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "excuse_letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_eligibilities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "studentId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "semesterId" UUID NOT NULL,
    "rawPercentage" DOUBLE PRECISION NOT NULL,
    "effectivePercentage" DOUBLE PRECISION NOT NULL,
    "status" "EligibilityStatus" NOT NULL DEFAULT 'PENDING',
    "atRiskPredicted" BOOLEAN NOT NULL DEFAULT false,
    "appealSubmittedAt" TIMESTAMP(3),
    "appealDecidedAt" TIMESTAMP(3),
    "appealDecision" TEXT,
    "computedAt" TIMESTAMP(3),
    "frozenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_eligibilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "secretEncrypted" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "universities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "universities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculties" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "universityId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "deanId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faculties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "facultyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "hodId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programmes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "departmentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "durationYears" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programmes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semesters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academicSessionId" UUID NOT NULL,
    "type" "SemesterType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "examStartDate" TIMESTAMP(3),
    "eligibilityComputeDate" TIMESTAMP(3),
    "eligibilityThreshold" DOUBLE PRECISION NOT NULL DEFAULT 75.0,
    "appealWindowDays" INTEGER NOT NULL DEFAULT 5,
    "maxApprovedExcuses" INTEGER NOT NULL DEFAULT 4,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "semesters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "departmentId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "creditUnits" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "isElective" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_sections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "courseId" UUID NOT NULL,
    "semesterId" UUID NOT NULL,
    "sectionLabel" TEXT NOT NULL,
    "lecturerId" UUID,
    "maxEnrollment" INTEGER NOT NULL DEFAULT 200,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "studentId" UUID NOT NULL,
    "courseSectionId" UUID NOT NULL,
    "isCarryOver" BOOLEAN NOT NULL DEFAULT false,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "droppedAt" TIMESTAMP(3),

    CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "buildingName" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geofenceRadius" INTEGER NOT NULL DEFAULT 50,
    "capacity" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "courseSectionId" UUID NOT NULL,
    "semesterId" UUID NOT NULL,
    "venueId" UUID NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "matricNumber" TEXT NOT NULL,
    "programmeId" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "hasCarryOver" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lecturers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "staffId" TEXT NOT NULL,
    "departmentId" UUID NOT NULL,
    "title" TEXT,
    "accountabilityScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lecturers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_identifier_key" ON "users"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_scopeId_idx" ON "users"("scopeId");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE INDEX "device_bindings_userId_idx" ON "device_bindings"("userId");

-- CreateIndex
CREATE INDEX "device_bindings_status_idx" ON "device_bindings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "device_bindings_userId_deviceFingerprint_key" ON "device_bindings"("userId", "deviceFingerprint");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "anomaly_flags_studentId_idx" ON "anomaly_flags"("studentId");

-- CreateIndex
CREATE INDEX "anomaly_flags_sessionId_idx" ON "anomaly_flags"("sessionId");

-- CreateIndex
CREATE INDEX "anomaly_flags_flagType_idx" ON "anomaly_flags"("flagType");

-- CreateIndex
CREATE INDEX "anomaly_flags_isReviewed_idx" ON "anomaly_flags"("isReviewed");

-- CreateIndex
CREATE UNIQUE INDEX "anomaly_flags_studentId_sessionId_flagType_key" ON "anomaly_flags"("studentId", "sessionId", "flagType");

-- CreateIndex
CREATE INDEX "notifications_recipientId_idx" ON "notifications"("recipientId");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "notifications_channel_idx" ON "notifications"("channel");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "support_tickets_submittedById_idx" ON "support_tickets"("submittedById");

-- CreateIndex
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");

-- CreateIndex
CREATE INDEX "support_tickets_category_idx" ON "support_tickets"("category");

-- CreateIndex
CREATE INDEX "course_sessions_courseSectionId_idx" ON "course_sessions"("courseSectionId");

-- CreateIndex
CREATE INDEX "course_sessions_venueId_idx" ON "course_sessions"("venueId");

-- CreateIndex
CREATE INDEX "course_sessions_lecturerId_idx" ON "course_sessions"("lecturerId");

-- CreateIndex
CREATE INDEX "course_sessions_status_idx" ON "course_sessions"("status");

-- CreateIndex
CREATE INDEX "course_sessions_scheduledStart_idx" ON "course_sessions"("scheduledStart");

-- CreateIndex
CREATE INDEX "attendance_records_studentId_idx" ON "attendance_records"("studentId");

-- CreateIndex
CREATE INDEX "attendance_records_sessionId_idx" ON "attendance_records"("sessionId");

-- CreateIndex
CREATE INDEX "attendance_records_enrollmentId_idx" ON "attendance_records"("enrollmentId");

-- CreateIndex
CREATE INDEX "attendance_records_status_idx" ON "attendance_records"("status");

-- CreateIndex
CREATE INDEX "attendance_records_checkedInAt_idx" ON "attendance_records"("checkedInAt");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_studentId_sessionId_key" ON "attendance_records"("studentId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "manual_overrides_attendanceRecordId_key" ON "manual_overrides"("attendanceRecordId");

-- CreateIndex
CREATE INDEX "manual_overrides_attendanceRecordId_idx" ON "manual_overrides"("attendanceRecordId");

-- CreateIndex
CREATE INDEX "manual_overrides_actorId_idx" ON "manual_overrides"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "excuse_letters_attendanceRecordId_key" ON "excuse_letters"("attendanceRecordId");

-- CreateIndex
CREATE INDEX "excuse_letters_studentId_idx" ON "excuse_letters"("studentId");

-- CreateIndex
CREATE INDEX "excuse_letters_courseSectionId_idx" ON "excuse_letters"("courseSectionId");

-- CreateIndex
CREATE INDEX "excuse_letters_status_idx" ON "excuse_letters"("status");

-- CreateIndex
CREATE INDEX "excuse_letters_createdAt_idx" ON "excuse_letters"("createdAt");

-- CreateIndex
CREATE INDEX "exam_eligibilities_studentId_idx" ON "exam_eligibilities"("studentId");

-- CreateIndex
CREATE INDEX "exam_eligibilities_enrollmentId_idx" ON "exam_eligibilities"("enrollmentId");

-- CreateIndex
CREATE INDEX "exam_eligibilities_semesterId_idx" ON "exam_eligibilities"("semesterId");

-- CreateIndex
CREATE INDEX "exam_eligibilities_status_idx" ON "exam_eligibilities"("status");

-- CreateIndex
CREATE INDEX "exam_eligibilities_atRiskPredicted_idx" ON "exam_eligibilities"("atRiskPredicted");

-- CreateIndex
CREATE UNIQUE INDEX "exam_eligibilities_studentId_enrollmentId_semesterId_key" ON "exam_eligibilities"("studentId", "enrollmentId", "semesterId");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE INDEX "webhooks_isActive_idx" ON "webhooks"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "universities_name_key" ON "universities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "universities_shortName_key" ON "universities"("shortName");

-- CreateIndex
CREATE UNIQUE INDEX "faculties_code_key" ON "faculties"("code");

-- CreateIndex
CREATE INDEX "faculties_universityId_idx" ON "faculties"("universityId");

-- CreateIndex
CREATE UNIQUE INDEX "faculties_universityId_name_key" ON "faculties"("universityId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE INDEX "departments_facultyId_idx" ON "departments"("facultyId");

-- CreateIndex
CREATE UNIQUE INDEX "departments_facultyId_name_key" ON "departments"("facultyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "programmes_code_key" ON "programmes"("code");

-- CreateIndex
CREATE INDEX "programmes_departmentId_idx" ON "programmes"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "programmes_departmentId_name_key" ON "programmes"("departmentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "academic_sessions_name_key" ON "academic_sessions"("name");

-- CreateIndex
CREATE INDEX "semesters_academicSessionId_idx" ON "semesters"("academicSessionId");

-- CreateIndex
CREATE INDEX "semesters_isActive_idx" ON "semesters"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "semesters_academicSessionId_type_key" ON "semesters"("academicSessionId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_key" ON "courses"("code");

-- CreateIndex
CREATE INDEX "courses_departmentId_idx" ON "courses"("departmentId");

-- CreateIndex
CREATE INDEX "courses_level_idx" ON "courses"("level");

-- CreateIndex
CREATE INDEX "course_sections_courseId_idx" ON "course_sections"("courseId");

-- CreateIndex
CREATE INDEX "course_sections_semesterId_idx" ON "course_sections"("semesterId");

-- CreateIndex
CREATE INDEX "course_sections_lecturerId_idx" ON "course_sections"("lecturerId");

-- CreateIndex
CREATE UNIQUE INDEX "course_sections_courseId_semesterId_sectionLabel_key" ON "course_sections"("courseId", "semesterId", "sectionLabel");

-- CreateIndex
CREATE INDEX "course_enrollments_studentId_idx" ON "course_enrollments"("studentId");

-- CreateIndex
CREATE INDEX "course_enrollments_courseSectionId_idx" ON "course_enrollments"("courseSectionId");

-- CreateIndex
CREATE UNIQUE INDEX "course_enrollments_studentId_courseSectionId_key" ON "course_enrollments"("studentId", "courseSectionId");

-- CreateIndex
CREATE INDEX "venues_isActive_idx" ON "venues"("isActive");

-- CreateIndex
CREATE INDEX "timetable_entries_courseSectionId_idx" ON "timetable_entries"("courseSectionId");

-- CreateIndex
CREATE INDEX "timetable_entries_semesterId_idx" ON "timetable_entries"("semesterId");

-- CreateIndex
CREATE INDEX "timetable_entries_venueId_idx" ON "timetable_entries"("venueId");

-- CreateIndex
CREATE INDEX "timetable_entries_dayOfWeek_idx" ON "timetable_entries"("dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_entries_dayOfWeek_startTime_venueId_semesterId_key" ON "timetable_entries"("dayOfWeek", "startTime", "venueId", "semesterId");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_entries_dayOfWeek_startTime_courseSectionId_semes_key" ON "timetable_entries"("dayOfWeek", "startTime", "courseSectionId", "semesterId");

-- CreateIndex
CREATE UNIQUE INDEX "students_userId_key" ON "students"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "students_matricNumber_key" ON "students"("matricNumber");

-- CreateIndex
CREATE INDEX "students_programmeId_idx" ON "students"("programmeId");

-- CreateIndex
CREATE INDEX "students_level_idx" ON "students"("level");

-- CreateIndex
CREATE UNIQUE INDEX "lecturers_userId_key" ON "lecturers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "lecturers_staffId_key" ON "lecturers"("staffId");

-- CreateIndex
CREATE INDEX "lecturers_departmentId_idx" ON "lecturers"("departmentId");

-- AddForeignKey
ALTER TABLE "device_bindings" ADD CONSTRAINT "device_bindings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_flags" ADD CONSTRAINT "anomaly_flags_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sessions" ADD CONSTRAINT "course_sessions_courseSectionId_fkey" FOREIGN KEY ("courseSectionId") REFERENCES "course_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sessions" ADD CONSTRAINT "course_sessions_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sessions" ADD CONSTRAINT "course_sessions_lecturerId_fkey" FOREIGN KEY ("lecturerId") REFERENCES "lecturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "course_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "course_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_overrides" ADD CONSTRAINT "manual_overrides_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "attendance_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excuse_letters" ADD CONSTRAINT "excuse_letters_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excuse_letters" ADD CONSTRAINT "excuse_letters_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "attendance_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excuse_letters" ADD CONSTRAINT "excuse_letters_courseSectionId_fkey" FOREIGN KEY ("courseSectionId") REFERENCES "course_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_eligibilities" ADD CONSTRAINT "exam_eligibilities_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_eligibilities" ADD CONSTRAINT "exam_eligibilities_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "course_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_eligibilities" ADD CONSTRAINT "exam_eligibilities_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculties" ADD CONSTRAINT "faculties_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "faculties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programmes" ADD CONSTRAINT "programmes_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_academicSessionId_fkey" FOREIGN KEY ("academicSessionId") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_lecturerId_fkey" FOREIGN KEY ("lecturerId") REFERENCES "lecturers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_courseSectionId_fkey" FOREIGN KEY ("courseSectionId") REFERENCES "course_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_courseSectionId_fkey" FOREIGN KEY ("courseSectionId") REFERENCES "course_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lecturers" ADD CONSTRAINT "lecturers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lecturers" ADD CONSTRAINT "lecturers_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
