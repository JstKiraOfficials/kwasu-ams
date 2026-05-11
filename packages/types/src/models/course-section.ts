export interface ICourseSection {
  id: string;
  courseId: string;
  semesterId: string;
  sectionLabel: string;
  lecturerId: string | null;
  maxEnrollment: number;
  createdAt: Date;
  updatedAt: Date;
}
