import { z } from 'zod';

export const ReportFilterSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  facultyId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  format: z.enum(['PDF', 'EXCEL', 'CSV']),
});

export type ReportFilterInput = z.infer<typeof ReportFilterSchema>;
