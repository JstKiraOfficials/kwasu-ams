import { PrismaClient, SemesterType } from '@prisma/client';

export async function seedAcademicSessions(prisma: PrismaClient): Promise<void> {
  // 2023/2024 — inactive
  const session2324 = await prisma.academicSession.upsert({
    where: { name: '2023/2024' },
    update: {},
    create: {
      name: '2023/2024',
      startDate: new Date('2023-09-01'),
      endDate: new Date('2024-07-31'),
      isActive: false,
    },
  });

  await prisma.semester.upsert({
    where: {
      academicSessionId_type: { academicSessionId: session2324.id, type: SemesterType.FIRST },
    },
    update: {},
    create: {
      academicSessionId: session2324.id,
      type: SemesterType.FIRST,
      startDate: new Date('2023-09-01'),
      endDate: new Date('2024-01-31'),
      examStartDate: new Date('2024-01-15'),
      eligibilityThreshold: 75.0,
      maxApprovedExcuses: 4,
      isActive: false,
      isFrozen: true,
    },
  });

  await prisma.semester.upsert({
    where: {
      academicSessionId_type: { academicSessionId: session2324.id, type: SemesterType.SECOND },
    },
    update: {},
    create: {
      academicSessionId: session2324.id,
      type: SemesterType.SECOND,
      startDate: new Date('2024-02-01'),
      endDate: new Date('2024-07-31'),
      examStartDate: new Date('2024-07-01'),
      eligibilityThreshold: 75.0,
      maxApprovedExcuses: 4,
      isActive: false,
      isFrozen: true,
    },
  });

  // 2024/2025 — active
  const session2425 = await prisma.academicSession.upsert({
    where: { name: '2024/2025' },
    update: {},
    create: {
      name: '2024/2025',
      startDate: new Date('2024-09-01'),
      endDate: new Date('2025-07-31'),
      isActive: true,
    },
  });

  // Active FIRST semester
  await prisma.semester.upsert({
    where: {
      academicSessionId_type: { academicSessionId: session2425.id, type: SemesterType.FIRST },
    },
    update: {},
    create: {
      academicSessionId: session2425.id,
      type: SemesterType.FIRST,
      startDate: new Date('2024-09-01'),
      endDate: new Date('2025-01-31'),
      examStartDate: new Date('2025-01-15'),
      eligibilityComputeDate: new Date('2025-01-10'),
      eligibilityThreshold: 75.0,
      appealWindowDays: 5,
      maxApprovedExcuses: 4,
      isActive: true,
      isFrozen: false,
    },
  });

  // Inactive SECOND semester
  await prisma.semester.upsert({
    where: {
      academicSessionId_type: { academicSessionId: session2425.id, type: SemesterType.SECOND },
    },
    update: {},
    create: {
      academicSessionId: session2425.id,
      type: SemesterType.SECOND,
      startDate: new Date('2025-02-01'),
      endDate: new Date('2025-07-31'),
      examStartDate: new Date('2025-07-01'),
      eligibilityThreshold: 75.0,
      maxApprovedExcuses: 4,
      isActive: false,
      isFrozen: false,
    },
  });
}
