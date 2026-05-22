/**
 * @file eligibility.controller.ts
 * @module modules/eligibility
 *
 * Thin HTTP controller layer for the eligibility module.
 *
 * Each handler extracts validated data from the request, delegates to the
 * appropriate service function, and returns the correct HTTP response.
 * No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { type Role } from '@kwasu-ams/types';
import {
  TriggerComputationSchema,
  GetStudentEligibilityQuerySchema,
  GetCourseEligibilityQuerySchema,
  OverrideEligibilitySchema,
  SubmitAppealSchema,
  DecideAppealSchema,
} from './eligibility.schema.js';
import {
  triggerEligibilityComputation,
  getEligibilityForStudent,
  getEligibilityForCourse,
  freezeEligibility,
  overrideEligibilityStatus,
} from './eligibility.service.js';
import { submitAppeal, decideAppeal } from './appeal.service.js';

/**
 * Handles `POST /eligibility/compute`.
 *
 * Enqueues an eligibility computation job for the given semester.
 *
 * @param request - Fastify request. Body: `{ semesterId }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function triggerComputationHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = TriggerComputationSchema.parse(request.body);
  const result = await triggerEligibilityComputation(body.semesterId, request.user!.userId);
  void reply.status(202).send(result);
}

/**
 * Handles `GET /eligibility/student/:studentId`.
 *
 * Returns all eligibility records for a student, optionally filtered by semester.
 *
 * @param request - Fastify request. URL param: `studentId`. Query: `{ semesterId? }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function getStudentEligibilityHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { studentId } = request.params as { studentId: string };
  const query = GetStudentEligibilityQuerySchema.parse(request.query);
  const result = await getEligibilityForStudent(studentId, query);
  void reply.status(200).send(result);
}

/**
 * Handles `GET /eligibility/course/:courseSectionId`.
 *
 * Returns a paginated, scope-aware list of eligibility records for a course.
 *
 * @param request - Fastify request. URL param: `courseSectionId`. Query: `{ semesterId?, page?, pageSize? }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function getCourseEligibilityHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { courseSectionId } = request.params as { courseSectionId: string };
  const query = GetCourseEligibilityQuerySchema.parse(request.query);
  const result = await getEligibilityForCourse(
    courseSectionId,
    query,
    request.user!.role as Role,
    request.user!.scopeId ?? null,
  );
  void reply.status(200).send(result);
}

/**
 * Handles `POST /eligibility/freeze/:semesterId`.
 *
 * Freezes eligibility for a semester. SUPER_ADMIN only.
 *
 * @param request - Fastify request. URL param: `semesterId`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function freezeEligibilityHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { semesterId } = request.params as { semesterId: string };
  await freezeEligibility(semesterId, request.user!.userId);
  void reply.status(200).send({ message: 'Eligibility frozen successfully.' });
}

/**
 * Handles `PATCH /eligibility/:id/override`.
 *
 * Overrides the eligibility status. DEAN/SUPER_ADMIN only.
 *
 * @param request - Fastify request. URL param: `id`. Body: `{ status, reason }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function overrideEligibilityHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const body = OverrideEligibilitySchema.parse(request.body);
  const result = await overrideEligibilityStatus(
    id,
    body,
    request.user!.userId,
    request.user!.role as Role,
  );
  void reply.status(200).send(result);
}

/**
 * Handles `POST /eligibility/:id/appeal`.
 *
 * Student submits an appeal for a BARRED eligibility record.
 *
 * @param request - Fastify request. URL param: `id`. Body: `{ reason }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function submitAppealHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const body = SubmitAppealSchema.parse(request.body);
  const result = await submitAppeal(id, body.reason, request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `PATCH /eligibility/:id/appeal/decide`.
 *
 * Decides an eligibility appeal. LECTURER/HOD/DEAN/SUPER_ADMIN only.
 *
 * @param request - Fastify request. URL param: `id`. Body: `{ decision, reason }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function decideAppealHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const body = DecideAppealSchema.parse(request.body);
  const result = await decideAppeal(
    id,
    body.decision,
    body.reason,
    request.user!.userId,
    request.user!.role as Role,
  );
  void reply.status(200).send(result);
}
