import { z } from 'zod';
import { ExcuseReason } from '../enums/excuse-reason.enum';

export const SubmitExcuseSchema = z
  .object({
    courseSectionId: z.string().uuid(),
    absenceDates: z.array(z.string().datetime()).min(1, 'At least one absence date is required'),
    reason: z.nativeEnum(ExcuseReason),
    otherExplanation: z.string().min(30).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.reason === ExcuseReason.OTHER && !data.otherExplanation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['otherExplanation'],
        message: 'Explanation is required when reason is OTHER (minimum 30 characters)',
      });
    }
  });

export const ReviewExcuseSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().min(1, 'Comment is required'),
});

export const AppealExcuseSchema = z.object({
  appealReason: z.string().min(20, 'Appeal reason must be at least 20 characters'),
});

export const HodReviewExcuseSchema = z.object({
  decision: z.enum(['HOD_APPROVED', 'HOD_REJECTED']),
  comment: z.string().min(1, 'Comment is required'),
});

export type SubmitExcuseInput = z.infer<typeof SubmitExcuseSchema>;
export type ReviewExcuseInput = z.infer<typeof ReviewExcuseSchema>;
export type AppealExcuseInput = z.infer<typeof AppealExcuseSchema>;
export type HodReviewExcuseInput = z.infer<typeof HodReviewExcuseSchema>;
