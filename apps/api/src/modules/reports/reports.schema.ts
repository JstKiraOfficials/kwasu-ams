/**
 * @file reports.schema.ts
 * @module modules/reports
 *
 * Zod validation schemas for the reports module.
 */

import { z } from 'zod';

/**
 * Schema for report filter options.
 *
 * All fields are optional — omitting them returns data for the entire active semester.
 */
export const ReportFiltersSchema = z.object({
  /** ISO 8601 start date for the report time range. */
  startDate: z.string().datetime().optional(),
  /** ISO 8601 end date for the report time range. */
  endDate: z.string().datetime().optional(),
  /** Optional UUID filter by faculty. */
  facultyId: z.string().uuid().optional(),
  /** Optional UUID filter by department. */
  departmentId: z.string().uuid().optional(),
  /** Optional UUID filter by course section. */
  courseSectionId: z.string().uuid().optional(),
  /** Optional UUID filter by student. */
  studentId: z.string().uuid().optional(),
  /** Optional UUID filter by semester. */
  semesterId: z.string().uuid().optional(),
});

/** TypeScript type inferred from {@link ReportFiltersSchema}. */
export type ReportFilters = z.infer<typeof ReportFiltersSchema>;

/**
 * Schema for report metric selection.
 *
 * Each boolean flag enables a specific metric in the generated report.
 */
export const ReportMetricsSchema = z.object({
  /** Include attendance rate per course. */
  attendanceRate: z.boolean().default(true),
  /** Include sessions held vs scheduled count. */
  sessionsHeld: z.boolean().default(false),
  /** Include absence count per student. */
  absences: z.boolean().default(false),
  /** Include manual override count. */
  overrides: z.boolean().default(false),
  /** Include approved excuse count. */
  excuses: z.boolean().default(false),
  /** Include anomaly flag count. */
  anomalies: z.boolean().default(false),
});

/** TypeScript type inferred from {@link ReportMetricsSchema}. */
export type ReportMetrics = z.infer<typeof ReportMetricsSchema>;

/**
 * Schema for the body of `POST /reports/generate`.
 *
 * - `filters`  — Data filter options.
 * - `metrics`  — Metrics to include in the report.
 * - `format`   — Output format: `'PDF'`, `'EXCEL'`, or `'CSV'`.
 */
export const GenerateReportSchema = z.object({
  filters: ReportFiltersSchema,
  metrics: ReportMetricsSchema,
  format: z.enum(['PDF', 'EXCEL', 'CSV']),
});

/** TypeScript type inferred from {@link GenerateReportSchema}. */
export type GenerateReportInput = z.infer<typeof GenerateReportSchema>;

/**
 * Schema for the body of `POST /reports/templates`.
 *
 * - `name`    — Template name. Minimum 3 characters.
 * - `filters` — Filter configuration to save.
 * - `metrics` — Metrics configuration to save.
 */
export const SaveTemplateSchema = z.object({
  name: z.string().min(3, 'Template name must be at least 3 characters'),
  filters: ReportFiltersSchema,
  metrics: ReportMetricsSchema,
});

/** TypeScript type inferred from {@link SaveTemplateSchema}. */
export type SaveTemplateInput = z.infer<typeof SaveTemplateSchema>;

/**
 * Schema for the body of `POST /reports/nuc-package`.
 *
 * - `semesterId` — UUID of the semester to generate the NUC package for.
 */
export const NucPackageSchema = z.object({
  semesterId: z.string().uuid('semesterId must be a valid UUID'),
});

/** TypeScript type inferred from {@link NucPackageSchema}. */
export type NucPackageInput = z.infer<typeof NucPackageSchema>;

/**
 * Schema for the body of `POST /reports/certificates`.
 *
 * - `courseSectionId` — UUID of the course section.
 * - `semesterId`      — UUID of the completed semester.
 */
export const CertificateSchema = z.object({
  courseSectionId: z.string().uuid('courseSectionId must be a valid UUID'),
  semesterId: z.string().uuid('semesterId must be a valid UUID'),
});

/** TypeScript type inferred from {@link CertificateSchema}. */
export type CertificateInput = z.infer<typeof CertificateSchema>;
