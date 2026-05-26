/**
 * @file analytics.controller.ts
 * @module modules/analytics
 *
 * Thin HTTP controller layer for the analytics module.
 * No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { type Role } from '@kwasu-ams/types';
import { getDashboardData, getCourseAnalytics, getStudentAnalytics } from './analytics.service.js';
import { getLiveHeatmap } from './heatmap.service.js';
import { CourseAnalyticsQuerySchema, StudentAnalyticsQuerySchema } from './analytics.schema.js';

/**
 * Handles `GET /dashboard`.
 *
 * Returns role-scoped dashboard data for the authenticated user.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function getDashboardHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const result = await getDashboardData(
    request.user!.userId,
    request.user!.role as Role,
    request.user!.scopeId ?? null,
  );
  void reply.status(200).send(result);
}

/**
 * Handles `GET /analytics/course/:courseSectionId`.
 *
 * Returns session rates, trend, distribution histogram, and averages for a course.
 *
 * @param request - Fastify request. URL param: `courseSectionId`. Query: `{ semesterId? }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function getCourseAnalyticsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { courseSectionId } = request.params as { courseSectionId: string };
  const query = CourseAnalyticsQuerySchema.parse(request.query);

  // Resolve active semester if not provided
  const semesterId = query.semesterId ?? (await resolveActiveSemesterId());
  if (!semesterId) {
    void reply.status(200).send({ message: 'No active semester' });
    return;
  }

  const result = await getCourseAnalytics(courseSectionId, semesterId);
  void reply.status(200).send(result);
}

/**
 * Handles `GET /analytics/student/:studentId`.
 *
 * Returns per-course analytics for a student including dynamic messages and benchmarks.
 *
 * @param request - Fastify request. URL param: `studentId`. Query: `{ semesterId? }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function getStudentAnalyticsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { studentId } = request.params as { studentId: string };
  const query = StudentAnalyticsQuerySchema.parse(request.query);

  const semesterId = query.semesterId ?? (await resolveActiveSemesterId());
  if (!semesterId) {
    void reply.status(200).send({ courses: [] });
    return;
  }

  const result = await getStudentAnalytics(studentId, semesterId);
  void reply.status(200).send(result);
}

/**
 * Handles `GET /analytics/heatmap/live`.
 *
 * Returns live venue check-in completion data with colour codes.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function getLiveHeatmapHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const result = await getLiveHeatmap();
  void reply.status(200).send(result);
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Resolves the active semester ID from the database.
 *
 * @returns The active semester UUID, or `null` if none exists.
 */
async function resolveActiveSemesterId(): Promise<string | null> {
  const { prisma } = await import('../../lib/prisma.js');
  const semester = await prisma.semester.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  return semester?.id ?? null;
}
