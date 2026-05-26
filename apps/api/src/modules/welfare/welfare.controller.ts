/**
 * @file welfare.controller.ts
 * @module modules/welfare
 *
 * Thin HTTP controller layer for the welfare module.
 * No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import {
  checkStudentWelfare,
  triggerWelfareReferral,
  listWelfareReferrals,
} from './welfare.service.js';

/**
 * Handles `GET /welfare`.
 *
 * Returns welfare referral records from the AuditLog.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function listWelfareReferralsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const result = await listWelfareReferrals(request.user!.role, request.user!.scopeId ?? null);
  void reply.status(200).send(result);
}

/**
 * Handles `POST /welfare/check/:studentId`.
 *
 * Checks whether a student needs a welfare referral and triggers it if so.
 *
 * @param request - Fastify request. URL param: `studentId`. Query: `{ semesterId? }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function checkWelfareHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { studentId } = request.params as { studentId: string };
  const query = request.query as { semesterId?: string };

  // Resolve active semester if not provided
  let semesterId = query.semesterId;
  if (!semesterId) {
    const { prisma } = await import('../../lib/prisma.js');
    const semester = await prisma.semester.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    semesterId = semester?.id;
  }

  if (!semesterId) {
    void reply.status(200).send({ needsReferral: false, coursesBelow70: [] });
    return;
  }

  const result = await checkStudentWelfare(studentId, semesterId);

  // Trigger referral if needed
  if (result.needsReferral) {
    void triggerWelfareReferral(studentId, semesterId, request.user!.userId);
  }

  void reply.status(200).send(result);
}
