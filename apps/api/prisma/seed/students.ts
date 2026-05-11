import { PrismaClient } from '@prisma/client';
import { STUDENT_MATRICS } from './users';

// Map matric index → programme code and level
// 20 students per dept, 4 years each → 5 students per level per dept
function getProgrammeAndLevel(index: number): { programmeCode: string; level: number } {
  const deptIndex = Math.floor(index / 20);
  const posInDept = index % 20;
  const level = (Math.floor(posInDept / 5) + 1) * 100; // 100, 200, 300, 400
  const deptCodes = ['CSC', 'BIO', 'CHM', 'MTH', 'ENG', 'HIS', 'PHI', 'ECO', 'POL', 'SOC_DEP'];
  const deptCode = deptCodes[deptIndex] ?? 'CSC';
  return { programmeCode: `BSC-${deptCode}`, level };
}

export async function seedStudents(prisma: PrismaClient): Promise<void> {
  for (let i = 0; i < STUDENT_MATRICS.length; i++) {
    const matric = STUDENT_MATRICS[i]!;
    const user = await prisma.user.findUniqueOrThrow({ where: { identifier: matric } });
    const { programmeCode, level } = getProgrammeAndLevel(i);
    const programme = await prisma.programme.findUniqueOrThrow({ where: { code: programmeCode } });

    await prisma.student.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        matricNumber: matric,
        programmeId: programme.id,
        level,
        hasCarryOver: false,
      },
    });
  }
}
