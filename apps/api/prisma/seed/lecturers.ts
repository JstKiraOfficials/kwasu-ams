import { PrismaClient } from '@prisma/client';
import { LECTURER_STAFF_IDS } from './users';

const LECTURER_DEPTS = ['BIO', 'CHM', 'CSC', 'MTH', 'ENG', 'HIS', 'PHI', 'ECO', 'POL', 'SOC_DEP'];

export async function seedLecturers(prisma: PrismaClient): Promise<void> {
  for (let i = 0; i < LECTURER_STAFF_IDS.length; i++) {
    const staffId = LECTURER_STAFF_IDS[i]!;
    const deptCode = LECTURER_DEPTS[Math.floor(i / 2)]!;

    const user = await prisma.user.findUniqueOrThrow({ where: { identifier: staffId } });
    const dept = await prisma.department.findUniqueOrThrow({ where: { code: deptCode } });

    await prisma.lecturer.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        staffId,
        departmentId: dept.id,
        title: i % 3 === 0 ? 'Dr.' : i % 3 === 1 ? 'Prof.' : null,
      },
    });
  }
}
