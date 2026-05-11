import { PrismaClient, SemesterType } from '@prisma/client';

export async function seedEnrollments(prisma: PrismaClient): Promise<void> {
  const activeSemester = await prisma.semester.findFirstOrThrow({
    where: { isActive: true, type: SemesterType.FIRST },
  });

  const students = await prisma.student.findMany({
    include: { programme: { include: { department: true } } },
  });

  for (const student of students) {
    // Find courses matching the student's level and department
    const deptCourses = await prisma.course.findMany({
      where: {
        departmentId: student.programme.departmentId,
        level: student.level,
      },
      take: 5,
    });

    for (const course of deptCourses) {
      // Find the section for this course in the active semester
      const section = await prisma.courseSection.findFirst({
        where: {
          courseId: course.id,
          semesterId: activeSemester.id,
          sectionLabel: 'A',
        },
      });

      if (!section) continue;

      await prisma.courseEnrollment.upsert({
        where: {
          studentId_courseSectionId: {
            studentId: student.id,
            courseSectionId: section.id,
          },
        },
        update: {},
        create: {
          studentId: student.id,
          courseSectionId: section.id,
          isCarryOver: false,
        },
      });
    }
  }
}
