/**
 * @file reports.controller.ts
 * @module modules/reports
 *
 * Thin HTTP controller layer for the reports module.
 * No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import {
  GenerateReportSchema,
  SaveTemplateSchema,
  NucPackageSchema,
  CertificateSchema,
} from './reports.schema.js';
import {
  generateCustomReport,
  saveReportTemplate,
  listReportTemplates,
} from './reports.service.js';
import { generateNucPackage } from './nuc-package.service.js';
import { generateAttendanceCertificate } from './certificate.service.js';

/**
 * Handles `POST /reports/generate`.
 *
 * Generates a custom report in the specified format and returns a download URL.
 *
 * @param request - Fastify request. Body: `{ filters, metrics, format }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function generateReportHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = GenerateReportSchema.parse(request.body);
  const result = await generateCustomReport(
    body.filters,
    body.metrics,
    body.format,
    request.user!.userId,
  );
  void reply.status(200).send(result);
}

/**
 * Handles `GET /reports/templates`.
 *
 * Returns all saved report templates for the authenticated user.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function listTemplatesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const result = await listReportTemplates(request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `POST /reports/templates`.
 *
 * Saves a named report template for the authenticated user.
 *
 * @param request - Fastify request. Body: `{ name, filters, metrics }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function saveTemplateHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = SaveTemplateSchema.parse(request.body);
  await saveReportTemplate(body.name, body.filters, body.metrics, request.user!.userId);
  void reply.status(201).send({ message: 'Template saved.' });
}

/**
 * Handles `POST /reports/nuc-package`.
 *
 * Generates a NUC accreditation report package for the given semester.
 *
 * @param request - Fastify request. Body: `{ semesterId }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function generateNucPackageHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = NucPackageSchema.parse(request.body);
  const result = await generateNucPackage(body.semesterId, request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `POST /reports/certificates`.
 *
 * Generates an attendance certificate for the authenticated student.
 *
 * @param request - Fastify request. Body: `{ courseSectionId, semesterId }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function generateCertificateHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = CertificateSchema.parse(request.body);

  // Resolve student ID from authenticated user
  const { prisma } = await import('../../lib/prisma.js');
  const student = await prisma.student.findUnique({
    where: { userId: request.user!.userId },
    select: { id: true },
  });
  if (!student) {
    void reply.status(404).send({ errors: [{ code: 'NOT_FOUND', message: 'Student not found.' }] });
    return;
  }

  const result = await generateAttendanceCertificate(
    student.id,
    body.courseSectionId,
    body.semesterId,
  );
  void reply.status(200).send(result);
}
