/**
 * @file excuses.controller.ts
 * @module modules/excuses
 *
 * Thin HTTP controller layer for the excuses module.
 *
 * Each handler extracts validated data from the request, delegates to the
 * appropriate service function, and returns the correct HTTP response.
 * No business logic lives here.
 *
 * File uploads are handled via `@fastify/multipart`. The handler reads all
 * parts from the multipart stream, separates field values from file buffers,
 * and passes them to the service.
 */

import { Buffer } from 'buffer';
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { type Role } from '@kwasu-ams/types';
import {
  SubmitExcuseSchema,
  ReviewExcuseSchema,
  AppealExcuseSchema,
  HodReviewExcuseSchema,
  ListExcusesQuerySchema,
} from './excuses.schema.js';
import {
  submitExcuse,
  listExcuses,
  getExcuseById,
  reviewExcuse,
  appealExcuse,
  hodReviewExcuse,
  getDocumentUrl,
  type UploadedFile,
} from './excuses.service.js';

// =============================================================================
// Handlers
// =============================================================================

/**
 * Handles `POST /excuses`.
 *
 * Parses the multipart form body, extracts field values and file buffers,
 * validates the fields against {@link SubmitExcuseSchema}, and delegates to
 * {@link submitExcuse}.
 *
 * @param request - Fastify request. Must be multipart/form-data.
 *                  `request.user` must be set by `authenticate`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function submitExcuseHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parts = request.parts();
  const fields: Record<string, string | string[]> = {};
  const files: UploadedFile[] = [];

  for await (const part of parts) {
    if (part.type === 'file') {
      const chunks: Uint8Array[] = [];
      for await (const chunk of part.file) {
        chunks.push(chunk as Uint8Array);
      }
      const buffer = Buffer.concat(chunks);
      files.push({
        filename: part.filename,
        mimetype: part.mimetype,
        buffer,
        size: buffer.length,
      });
    } else {
      const existing = fields[part.fieldname];
      if (existing !== undefined) {
        fields[part.fieldname] = Array.isArray(existing)
          ? [...existing, part.value as string]
          : [existing, part.value as string];
      } else {
        fields[part.fieldname] = part.value as string;
      }
    }
  }

  // Normalise absenceDates — may arrive as repeated field or comma-separated
  const rawDates = fields['absenceDates'];
  const absenceDates = Array.isArray(rawDates)
    ? rawDates
    : rawDates !== undefined
      ? [rawDates]
      : [];

  const body = SubmitExcuseSchema.parse({
    courseSectionId: fields['courseSectionId'],
    absenceDates,
    reason: fields['reason'],
    otherExplanation: fields['otherExplanation'],
  });

  const result = await submitExcuse(request.user!.userId, body, files);
  void reply.status(201).send(result);
}

/**
 * Handles `GET /excuses`.
 *
 * Returns a paginated, scope-aware list of excuse letters.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Query: `{ status?, courseSectionId?, page?, pageSize? }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function listExcusesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = ListExcusesQuerySchema.parse(request.query);
  const result = await listExcuses(
    query,
    request.user!.role as Role,
    request.user!.userId,
    request.user!.scopeId ?? null,
  );
  void reply.status(200).send(result);
}

/**
 * Handles `GET /excuses/:id`.
 *
 * Returns a single excuse letter with scope enforcement.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the excuse letter.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — excuse does not exist.
 * @throws {AppError} `FORBIDDEN` (403) — actor does not have access.
 */
export async function getExcuseByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const result = await getExcuseById(id, request.user!.role as Role, request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `PATCH /excuses/:id/review`.
 *
 * Lecturer approves or rejects an excuse letter.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id`. Body: `{ decision, comment }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function reviewExcuseHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const body = ReviewExcuseSchema.parse(request.body);
  const result = await reviewExcuse(id, body, request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `PATCH /excuses/:id/appeal`.
 *
 * Student appeals a rejected excuse letter.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id`. Body: `{ appealReason }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function appealExcuseHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const body = AppealExcuseSchema.parse(request.body);
  const result = await appealExcuse(id, body, request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `PATCH /excuses/:id/hod-review`.
 *
 * HOD makes the final decision on an appealed excuse letter.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id`. Body: `{ decision, comment }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function hodReviewExcuseHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const body = HodReviewExcuseSchema.parse(request.body);
  const result = await hodReviewExcuse(id, body, request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `GET /excuses/:id/documents/:key`.
 *
 * Returns a 15-minute pre-signed S3 URL for a document attached to an excuse.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL params: `id` (excuse UUID), `key` (S3 object key).
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function getDocumentUrlHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id, key } = request.params as { id: string; key: string };
  const result = await getDocumentUrl(id, key, request.user!.role as Role, request.user!.userId);
  void reply.status(200).send(result);
}
