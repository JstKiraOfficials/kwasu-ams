/**
 * @file reports.routes.ts
 * @module modules/reports
 *
 * Fastify route registrations for the reports module.
 *
 * | Method | Path                                    | Roles                                    |
 * |--------|-----------------------------------------|------------------------------------------|
 * | POST   | /reports/generate                       | SUPER_ADMIN, ACADEMIC_AFFAIRS, DEAN, HOD |
 * | GET    | /reports/templates                      | SUPER_ADMIN, ACADEMIC_AFFAIRS, DEAN, HOD |
 * | POST   | /reports/templates                      | SUPER_ADMIN, ACADEMIC_AFFAIRS, DEAN, HOD |
 * | POST   | /reports/nuc-package                    | SUPER_ADMIN, ACADEMIC_AFFAIRS            |
 * | POST   | /reports/certificates                   | STUDENT                                  |
 * | GET    | /reports/class-register/:courseSectionId | LECTURER, HOD, SUPER_ADMIN               |
 * | GET    | /reports/report-card/:studentId         | STUDENT, HOD, SUPER_ADMIN                |
 */

import { type FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRoles } from '../../middleware/role-guard.js';
import { Role } from '@kwasu-ams/types';
import * as controller from './reports.controller.js';

/** Roles permitted to generate and manage custom reports. */
const REPORT_ROLES = [Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS, Role.DEAN, Role.HOD] as const;

/**
 * Registers all report routes on the provided Fastify instance.
 *
 * Called from `app.ts` via `app.register(registerReportRoutes)`.
 *
 * @param app - The Fastify application instance to register routes on.
 * @returns A promise that resolves once all routes have been registered.
 */
export async function registerReportRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /reports/generate ───────────────────────────────────────────────
  app.post(
    '/reports/generate',
    {
      preHandler: [authenticate, requireRoles(...REPORT_ROLES)],
      schema: {
        tags: ['reports'],
        summary: 'Generate a custom attendance report (PDF, Excel, or CSV)',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['filters', 'metrics', 'format'],
          properties: {
            filters: { type: 'object', additionalProperties: true },
            metrics: { type: 'object', additionalProperties: true },
            format: { type: 'string', enum: ['PDF', 'EXCEL', 'CSV'] },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    controller.generateReportHandler,
  );

  // ── GET /reports/templates ───────────────────────────────────────────────
  app.get(
    '/reports/templates',
    {
      preHandler: [authenticate, requireRoles(...REPORT_ROLES)],
      schema: {
        tags: ['reports'],
        summary: 'List saved report templates for the authenticated user',
        security: [{ bearerAuth: [] }],
        response: { 200: { type: 'array', items: { type: 'object', additionalProperties: true } } },
      },
    },
    controller.listTemplatesHandler,
  );

  // ── POST /reports/templates ──────────────────────────────────────────────
  app.post(
    '/reports/templates',
    {
      preHandler: [authenticate, requireRoles(...REPORT_ROLES)],
      schema: {
        tags: ['reports'],
        summary: 'Save a named report template',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'filters', 'metrics'],
          properties: {
            name: { type: 'string', minLength: 3 },
            filters: { type: 'object', additionalProperties: true },
            metrics: { type: 'object', additionalProperties: true },
          },
        },
        response: { 201: { type: 'object', additionalProperties: true } },
      },
    },
    controller.saveTemplateHandler,
  );

  // ── POST /reports/nuc-package ────────────────────────────────────────────
  app.post(
    '/reports/nuc-package',
    {
      preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN, Role.ACADEMIC_AFFAIRS)],
      schema: {
        tags: ['reports'],
        summary: 'Generate NUC accreditation report package',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['semesterId'],
          properties: { semesterId: { type: 'string', format: 'uuid' } },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    controller.generateNucPackageHandler,
  );

  // ── POST /reports/certificates ───────────────────────────────────────────
  app.post(
    '/reports/certificates',
    {
      preHandler: [authenticate, requireRoles(Role.STUDENT)],
      schema: {
        tags: ['reports'],
        summary: 'Generate an attendance certificate for a completed semester',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['courseSectionId', 'semesterId'],
          properties: {
            courseSectionId: { type: 'string', format: 'uuid' },
            semesterId: { type: 'string', format: 'uuid' },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    controller.generateCertificateHandler,
  );

  // ── GET /reports/class-register/:courseSectionId ─────────────────────────
  app.get(
    '/reports/class-register/:courseSectionId',
    {
      preHandler: [authenticate, requireRoles(Role.LECTURER, Role.HOD, Role.SUPER_ADMIN)],
      schema: {
        tags: ['reports'],
        summary: 'Get a pre-signed URL for a course class register PDF',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['courseSectionId'],
          properties: { courseSectionId: { type: 'string', format: 'uuid' } },
        },
        querystring: {
          type: 'object',
          required: ['semesterId'],
          properties: { semesterId: { type: 'string', format: 'uuid' } },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    controller.getClassRegisterHandler,
  );

  // ── GET /reports/report-card/:studentId ───────────────────────────────────
  app.get(
    '/reports/report-card/:studentId',
    {
      preHandler: [authenticate, requireRoles(Role.STUDENT, Role.HOD, Role.SUPER_ADMIN)],
      schema: {
        tags: ['reports'],
        summary: 'Get a pre-signed URL for a student semester report card PDF',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['studentId'],
          properties: { studentId: { type: 'string', format: 'uuid' } },
        },
        querystring: {
          type: 'object',
          required: ['semesterId'],
          properties: { semesterId: { type: 'string', format: 'uuid' } },
        },
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    controller.getReportCardHandler,
  );
}
