export interface ICourseEnrollment {
  id: string;
  studentId: string;
  courseSectionId: string;
  isCarryOver: boolean;
  enrolledAt: Date;
  droppedAt: Date | null;
}
