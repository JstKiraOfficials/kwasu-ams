import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

// All seed accounts use this test password — NEVER use in production
const TEST_PASSWORD = 'TestPassword123!';

// Matric number format: YY/[NUM][DEPT]/[SERIAL] — valid per MATRIC_NUMBER_REGEX
// MATRIC_NUMBER_REGEX = /^\d{2}[dD]?\/\d{1,2}[A-Za-z]{1,3}\/\d{3,5}$/
function makeMatric(year: number, num: number, dept: string, serial: number): string {
  return `${String(year).padStart(2, '0')}/${num}${dept}/${String(serial).padStart(5, '0')}`;
}

// Staff ID format: KWASU/[RANK]/[DEPT]/[SERIAL] — valid per STAFF_ID_REGEX
// STAFF_ID_REGEX = /^[Kk][Ww][Aa][Ss][Uu]\/[A-Za-z]{2,5}\/[A-Za-z]{2,5}\/\d{2,5}$/
function makeStaffId(rank: string, dept: string, serial: number): string {
  return `KWASU/${rank}/${dept}/${String(serial).padStart(5, '0')}`;
}

// 200 student matric numbers distributed across departments and years
export const STUDENT_MATRICS: string[] = [];
const STUDENT_DEPTS = [
  { num: 47, code: 'CSC' },
  { num: 12, code: 'BIO' },
  { num: 8, code: 'CHM' },
  { num: 4, code: 'MTH' },
  { num: 15, code: 'ENG' },
  { num: 6, code: 'HIS' },
  { num: 9, code: 'PHI' },
  { num: 11, code: 'ECO' },
  { num: 7, code: 'POL' },
  { num: 3, code: 'SOC' },
];

let matricSerial = 1;
for (const dept of STUDENT_DEPTS) {
  for (let i = 0; i < 20; i++) {
    const year = 20 + (i % 4); // years 20–23
    STUDENT_MATRICS.push(makeMatric(year, dept.num, dept.code, matricSerial++));
  }
}

// 20 lecturer staff IDs — 2 per department
export const LECTURER_STAFF_IDS: string[] = [];
const LECTURER_DEPTS = ['BIO', 'CHM', 'CSC', 'MTH', 'ENG', 'HIS', 'PHI', 'ECO', 'POL', 'SOC'];
let lecSerial = 1;
for (const dept of LECTURER_DEPTS) {
  LECTURER_STAFF_IDS.push(makeStaffId('LEC', dept, lecSerial++));
  LECTURER_STAFF_IDS.push(makeStaffId('LEC', dept, lecSerial++));
}

export async function seedUsers(prisma: PrismaClient): Promise<void> {
  const passwordHash = await argon2.hash(TEST_PASSWORD);

  // Fetch scope IDs for scoped roles
  const sciDept = await prisma.faculty.findUniqueOrThrow({ where: { code: 'SCI' } });
  const cscDept = await prisma.department.findUniqueOrThrow({ where: { code: 'CSC' } });

  // SUPER_ADMIN
  await prisma.user.upsert({
    where: { identifier: 'KWASU/ADM/SYS/00001' },
    update: {},
    create: {
      identifier: 'KWASU/ADM/SYS/00001',
      fullName: 'System Administrator',
      email: 'admin@kwasu.edu.ng',
      phone: '+2348000000001',
      role: Role.SUPER_ADMIN,
      passwordHash,
      mustChangePassword: false,
      totpEnrolled: false,
    },
  });

  // Role-specific test staff users
  const staffUsers: Array<{
    identifier: string;
    fullName: string;
    email: string;
    phone: string;
    role: Role;
    scopeId?: string;
  }> = [
    {
      identifier: 'KWASU/AFF/ACA/00001',
      fullName: 'Academic Affairs Officer',
      email: 'academic@kwasu.edu.ng',
      phone: '+2348000000002',
      role: Role.ACADEMIC_AFFAIRS,
    },
    {
      identifier: 'KWASU/VC/EXEC/00001',
      fullName: 'Vice Chancellor',
      email: 'vc@kwasu.edu.ng',
      phone: '+2348000000003',
      role: Role.VICE_CHANCELLOR,
    },
    {
      identifier: 'KWASU/DEAN/SCI/00001',
      fullName: 'Dean of Sciences',
      email: 'dean.sci@kwasu.edu.ng',
      phone: '+2348000000004',
      role: Role.DEAN,
      scopeId: sciDept.id,
    },
    {
      identifier: 'KWASU/HOD/CSC/00001',
      fullName: 'HOD Computer Science',
      email: 'hod.csc@kwasu.edu.ng',
      phone: '+2348000000005',
      role: Role.HOD,
      scopeId: cscDept.id,
    },
    {
      identifier: 'KWASU/EXM/REG/00001',
      fullName: 'Exam Officer',
      email: 'exams@kwasu.edu.ng',
      phone: '+2348000000006',
      role: Role.EXAM_OFFICER,
    },
  ];

  for (const user of staffUsers) {
    await prisma.user.upsert({
      where: { identifier: user.identifier },
      update: {},
      create: { ...user, passwordHash, mustChangePassword: false, totpEnrolled: false },
    });
  }

  // 20 lecturer users
  for (let i = 0; i < LECTURER_STAFF_IDS.length; i++) {
    const staffId = LECTURER_STAFF_IDS[i]!;
    const deptCode = LECTURER_DEPTS[Math.floor(i / 2)]!;
    await prisma.user.upsert({
      where: { identifier: staffId },
      update: {},
      create: {
        identifier: staffId,
        fullName: `Lecturer ${staffId}`,
        email: `lec${i + 1}@kwasu.edu.ng`,
        phone: `+23480000${String(100 + i).padStart(5, '0')}`,
        role: Role.LECTURER,
        passwordHash,
        mustChangePassword: true,
        totpEnrolled: false,
      },
    });
    // suppress unused variable warning
    void deptCode;
  }

  // 200 student users
  for (let i = 0; i < STUDENT_MATRICS.length; i++) {
    const matric = STUDENT_MATRICS[i]!;
    await prisma.user.upsert({
      where: { identifier: matric },
      update: {},
      create: {
        identifier: matric,
        fullName: `Student ${matric}`,
        email: `student${i + 1}@student.kwasu.edu.ng`,
        phone: `+23481000${String(i + 1).padStart(5, '0')}`,
        role: Role.STUDENT,
        passwordHash,
        mustChangePassword: true,
        totpEnrolled: false,
      },
    });
  }
}
