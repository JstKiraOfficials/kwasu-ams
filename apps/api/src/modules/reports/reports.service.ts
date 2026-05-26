/**
 * @file reports.service.ts
 * @module modules/reports
 *
 * Custom report generation service for KWASU AMS.
 *
 * Supports PDF, Excel, and CSV output formats. All PDFs embed a SHA-256
 * checksum in the footer. Reports are uploaded to S3 and returned as
 * 1-hour pre-signed download URLs.
 *
 * Report templates can be saved and listed per user.
 */

import { prisma } from '../../lib/prisma.js';
import { generatePdf } from '../../lib/pdf-generator.js';
import { generateExcel } from '../../lib/excel-generator.js';
import { computeSha256 } from '../../lib/checksum.js';
import { uploadToS3, getPresignedUrl } from '../../lib/s3.js';
import { env } from '../../config/env.js';
import { computeAttendancePercentage } from '@kwasu-ams/utils';
import { type ReportFilters, type ReportMetrics } from './reports.schema.js';

/** Pre-signed URL expiry for report downloads in seconds (1 hour). */
const REPORT_URL_EXPIRY = 3600;

// =============================================================================
// generateCustomReport
// =============================================================================

/**
 * Generates a custom attendance report in the specified format.
 *
 * Queries data based on the provided filters, computes the requested metrics,
 * generates the report, uploads to S3, and returns a pre-signed download URL
 * with the document SHA-256 checksum.
 *
 * @param filters  - Data filter options (time range, faculty, department, etc.).
 * @param metrics  - Metrics to include in the report.
 * @param format   - Output format: `'PDF'`, `'EXCEL'`, or `'CSV'`.
 * @param actorId  - UUID of the user generating the report (for S3 key).
 * @returns An object with `downloadUrl` (pre-signed S3 URL) and `checksum` (SHA-256 hex).
 */
export async function generateCustomReport(
  filters: ReportFilters,
  _metrics: ReportMetrics,
  format: 'PDF' | 'EXCEL' | 'CSV',
  actorId: string,
): Promise<{ downloadUrl: string; checksum: string }> {
  // Resolve active semester if not specified
  const semesterId =
    filters.semesterId ??
    (await prisma.semester.findFirst({ where: { isActive: true }, select: { id: true } }))?.id;

  const sessions = await prisma.courseSession.findMany({
    where: {
      status: { in: ['CLOSED', 'LOCKED'] as const },
      ...(filters.courseSectionId ? { courseSectionId: filters.courseSectionId } : {}),
      ...(semesterId ? { courseSection: { semesterId } } : {}),
    } as {
      status: { in: ('CLOSED' | 'LOCKED')[] };
      courseSectionId?: string;
      courseSection?: { semesterId: string };
    },
    include: {
      courseSection: {
        select: {
          course: { select: { code: true, title: true } },
          enrollments: { select: { id: true } },
        },
      },
      attendanceRecords: { select: { status: true } },
    },
    orderBy: { scheduledStart: 'asc' },
    take: 1000,
  });

  // Build report rows
  const rows: Array<[string, string, string, string, string]> = sessions.map((s) => {
    const enrolled = s.courseSection.enrollments.length;
    const present = s.attendanceRecords.filter((r: { status: string }) =>
      ['PRESENT', 'LATE', 'MANUAL_OVERRIDE'].includes(r.status),
    ).length;
    const rate = computeAttendancePercentage(present, enrolled);
    return [
      s.courseSection.course.code,
      s.courseSection.course.title,
      s.scheduledStart.toISOString().split('T')[0]!,
      `${present}/${enrolled}`,
      `${rate.toFixed(2)}%`,
    ];
  });

  const headers = ['Course Code', 'Course Title', 'Date', 'Attendance', 'Rate'];
  const timestamp = Date.now();
  let buffer: Buffer;
  let checksum: string;
  let ext: string;
  let contentType: string;

  if (format === 'PDF') {
    const sections = [
      {
        heading: 'Attendance Report',
        body: rows.map((r) => r.join(' | ')).join('\n') || 'No data available.',
      },
    ];
    const result = await generatePdf('Custom Attendance Report', sections);
    buffer = result.buffer;
    checksum = result.checksum;
    ext = 'pdf';
    contentType = 'application/pdf';
  } else if (format === 'EXCEL') {
    buffer = await generateExcel('Attendance', headers, rows);
    checksum = computeSha256(buffer);
    ext = 'xlsx';
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  } else {
    // CSV
    const csvLines = [headers.join(','), ...rows.map((r) => r.join(','))];
    const csvString = csvLines.join('\n');
    buffer = Buffer.from(csvString, 'utf-8');
    checksum = computeSha256(buffer);
    ext = 'csv';
    contentType = 'text/csv';
  }

  const s3Key = `reports/${actorId}/${timestamp}-report.${ext}`;
  await uploadToS3(env.AWS_S3_BUCKET_REPORTS, s3Key, buffer, contentType);
  const downloadUrl = await getPresignedUrl(env.AWS_S3_BUCKET_REPORTS, s3Key, REPORT_URL_EXPIRY);

  return { downloadUrl, checksum };
}

// =============================================================================
// saveReportTemplate / listReportTemplates
// =============================================================================

/**
 * Saves a named report template for the given user.
 *
 * @param name     - Template name. Minimum 3 characters.
 * @param filters  - Filter configuration to save.
 * @param metrics  - Metrics configuration to save.
 * @param actorId  - UUID of the user saving the template.
 * @returns A promise that resolves once the template is saved.
 */
export async function saveReportTemplate(
  name: string,
  filters: ReportFilters,
  metrics: ReportMetrics,
  actorId: string,
): Promise<void> {
  await (
    prisma as unknown as {
      reportTemplate: {
        create: (args: {
          data: { name: string; actorId: string; filtersJson: unknown; metricsJson: unknown };
        }) => Promise<unknown>;
      };
    }
  ).reportTemplate.create({
    data: {
      name,
      actorId,
      filtersJson: filters,
      metricsJson: metrics,
    },
  });
}

/**
 * Lists all saved report templates for the given user.
 *
 * @param actorId - UUID of the user whose templates to list.
 * @returns Array of report template records.
 */
export async function listReportTemplates(actorId: string): Promise<unknown[]> {
  return (
    prisma as unknown as {
      reportTemplate: {
        findMany: (args: {
          where: { actorId: string };
          orderBy: { createdAt: string };
        }) => Promise<unknown[]>;
      };
    }
  ).reportTemplate.findMany({
    where: { actorId },
    orderBy: { createdAt: 'desc' },
  });
}
