import { type FastifyReply, type FastifyRequest } from 'fastify';
import { Role } from '@kwasu-ams/types';
import { prisma } from '../lib/prisma.js';

type ResourceType = 'faculty' | 'department' | 'course' | 'student' | 'lecturer';

function forbidden(reply: FastifyReply): void {
  void reply.status(403).send({
    errors: [{ code: 'FORBIDDEN', message: 'Insufficient permissions.' }],
    statusCode: 403,
    timestamp: new Date().toISOString(),
  });
}

function getParam(request: FastifyRequest, key: string): string | undefined {
  const params = request.params as Record<string, string | undefined>;
  const body = request.body as Record<string, string | undefined> | null;
  return params[key] ?? body?.[key];
}

/**
 * Factory that returns a Fastify preHandler enforcing data scope.
 * Scope is enforced at the database query level — not just by comparing URL params.
 * Must run after `authenticate` and `requireRoles`.
 *
 * SUPER_ADMIN bypasses all scope checks.
 */
export function requireScope(
  resourceType: ResourceType,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async function scopeGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      void reply.status(401).send({
        errors: [{ code: 'UNAUTHORIZED', message: 'Authentication required.' }],
        statusCode: 401,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const { role, scopeId, userId } = request.user;

    // SUPER_ADMIN, ACADEMIC_AFFAIRS, VICE_CHANCELLOR have no scope restriction
    if (
      role === Role.SUPER_ADMIN ||
      role === Role.ACADEMIC_AFFAIRS ||
      role === Role.VICE_CHANCELLOR
    ) {
      return;
    }

    switch (resourceType) {
      case 'faculty': {
        await checkFacultyScope(request, reply, role, scopeId);
        break;
      }
      case 'department': {
        await checkDepartmentScope(request, reply, role, scopeId);
        break;
      }
      case 'course': {
        await checkCourseScope(request, reply, role, scopeId);
        break;
      }
      case 'student': {
        await checkStudentScope(request, reply, role, userId, scopeId);
        break;
      }
      case 'lecturer': {
        await checkLecturerScope(request, reply, role, userId, scopeId);
        break;
      }
    }
  };
}

// ── Faculty scope ─────────────────────────────────────────────────────────────

async function checkFacultyScope(
  request: FastifyRequest,
  reply: FastifyReply,
  role: Role,
  scopeId: string | null,
): Promise<void> {
  if (role === Role.DEAN) {
    const facultyId = getParam(request, 'facultyId');
    if (!facultyId || scopeId !== facultyId) {
      forbidden(reply);
    }
  }
  // EXAM_OFFICER, HOD, LECTURER, STUDENT — no faculty-level access
  else {
    forbidden(reply);
  }
}

// ── Department scope ──────────────────────────────────────────────────────────

async function checkDepartmentScope(
  request: FastifyRequest,
  reply: FastifyReply,
  role: Role,
  scopeId: string | null,
): Promise<void> {
  const departmentId = getParam(request, 'departmentId');

  if (role === Role.HOD || role === Role.LECTURER) {
    // HOD/LECTURER scopeId IS the departmentId
    if (!departmentId || scopeId !== departmentId) {
      forbidden(reply);
    }
    return;
  }

  if (role === Role.DEAN) {
    // DEAN scopeId is facultyId — verify department belongs to that faculty
    if (!departmentId || !scopeId) {
      forbidden(reply);
      return;
    }
    const dept = await prisma.department.findFirst({
      where: { id: departmentId, facultyId: scopeId },
      select: { id: true },
    });
    if (!dept) {
      forbidden(reply);
    }
    return;
  }

  // EXAM_OFFICER, STUDENT — no department-level write access
  forbidden(reply);
}

// ── Course scope ──────────────────────────────────────────────────────────────

async function checkCourseScope(
  request: FastifyRequest,
  reply: FastifyReply,
  role: Role,
  scopeId: string | null,
): Promise<void> {
  const courseId = getParam(request, 'courseId');

  if (!courseId || !scopeId) {
    forbidden(reply);
    return;
  }

  if (role === Role.HOD || role === Role.LECTURER) {
    // Verify course belongs to the user's department
    const course = await prisma.course.findFirst({
      where: { id: courseId, departmentId: scopeId },
      select: { id: true },
    });
    if (!course) {
      forbidden(reply);
    }
    return;
  }

  if (role === Role.DEAN) {
    // Verify course's department belongs to the dean's faculty
    const course = await prisma.course.findFirst({
      where: { id: courseId, department: { facultyId: scopeId } },
      select: { id: true },
    });
    if (!course) {
      forbidden(reply);
    }
    return;
  }

  forbidden(reply);
}

// ── Student scope ─────────────────────────────────────────────────────────────

async function checkStudentScope(
  request: FastifyRequest,
  reply: FastifyReply,
  role: Role,
  userId: string,
  scopeId: string | null,
): Promise<void> {
  const studentId = getParam(request, 'studentId');

  if (role === Role.STUDENT) {
    // Student can only access their own record
    if (!studentId) {
      forbidden(reply);
      return;
    }
    const student = await prisma.student.findFirst({
      where: { id: studentId, userId },
      select: { id: true },
    });
    if (!student) {
      forbidden(reply);
    }
    return;
  }

  if (role === Role.LECTURER) {
    // Lecturer can only access students enrolled in their sections
    if (!studentId) {
      forbidden(reply);
      return;
    }
    const lecturer = await prisma.lecturer.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!lecturer) {
      forbidden(reply);
      return;
    }
    const enrollment = await prisma.courseEnrollment.findFirst({
      where: { studentId, courseSection: { lecturerId: lecturer.id } },
      select: { id: true },
    });
    if (!enrollment) {
      forbidden(reply);
    }
    return;
  }

  if (role === Role.HOD) {
    // HOD can access students in their department
    if (!studentId || !scopeId) {
      forbidden(reply);
      return;
    }
    const student = await prisma.student.findFirst({
      where: { id: studentId, programme: { departmentId: scopeId } },
      select: { id: true },
    });
    if (!student) {
      forbidden(reply);
    }
    return;
  }

  if (role === Role.DEAN) {
    if (!studentId || !scopeId) {
      forbidden(reply);
      return;
    }
    const student = await prisma.student.findFirst({
      where: { id: studentId, programme: { department: { facultyId: scopeId } } },
      select: { id: true },
    });
    if (!student) {
      forbidden(reply);
    }
    return;
  }

  forbidden(reply);
}

// ── Lecturer scope ────────────────────────────────────────────────────────────

async function checkLecturerScope(
  request: FastifyRequest,
  reply: FastifyReply,
  role: Role,
  userId: string,
  scopeId: string | null,
): Promise<void> {
  const lecturerId = getParam(request, 'lecturerId');

  if (role === Role.LECTURER) {
    // Resolve the lecturer record — never compare userId directly to lecturerId
    const lecturer = await prisma.lecturer.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!lecturer || lecturer.id !== lecturerId) {
      forbidden(reply);
    }
    return;
  }

  if (role === Role.HOD) {
    if (!lecturerId || !scopeId) {
      forbidden(reply);
      return;
    }
    const lecturer = await prisma.lecturer.findFirst({
      where: { id: lecturerId, departmentId: scopeId },
      select: { id: true },
    });
    if (!lecturer) {
      forbidden(reply);
    }
    return;
  }

  if (role === Role.DEAN) {
    if (!lecturerId || !scopeId) {
      forbidden(reply);
      return;
    }
    const lecturer = await prisma.lecturer.findFirst({
      where: { id: lecturerId, department: { facultyId: scopeId } },
      select: { id: true },
    });
    if (!lecturer) {
      forbidden(reply);
    }
    return;
  }

  forbidden(reply);
}

// =============================================================================
// assertOwnResource — simple helper for student-accessing-own-data patterns
// =============================================================================

/**
 * Throws a 403 AppError if the requesting user is not the resource owner.
 * Used for patterns like "student can only access their own attendance".
 */
export function assertOwnResource(request: FastifyRequest, resourceUserId: string): void {
  if (!request.user || request.user.userId !== resourceUserId) {
    throw new (class extends Error {
      statusCode = 403;
      code = 'FORBIDDEN';
      constructor() {
        super('Insufficient permissions.');
      }
    })();
  }
}
