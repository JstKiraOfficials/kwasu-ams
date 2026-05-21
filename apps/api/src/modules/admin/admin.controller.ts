/**
 * @file admin.controller.ts
 * @module modules/admin
 *
 * Thin HTTP controller layer for the admin module.
 *
 * Each handler validates the incoming request, delegates to the service layer,
 * and returns the appropriate HTTP response. No business logic lives here.
 *
 * Handler responsibilities:
 * 1. Extract and validate data from the request (params, query, body).
 * 2. Call the appropriate service method.
 * 3. Return the response with the correct HTTP status code.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { Buffer } from 'node:buffer';
import { CreateUserSchema, ListUsersQuerySchema, UpdateUserSchema } from './admin.schema.js';
import * as adminService from './admin.service.js';
import { processBulkImport } from './bulk-import.service.js';

// =============================================================================
// POST /admin/users
// =============================================================================

/**
 * Handles `POST /admin/users`.
 *
 * Parses and validates the request body through {@link CreateUserSchema},
 * delegates account creation to {@link adminService.createUser}, and returns
 * the created user record (sensitive fields omitted) with status 201.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Body: `{ identifier, fullName, email, phone, role, scopeId? }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 */
export async function createUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = CreateUserSchema.parse(request.body);
  const user = await adminService.createUser(body, request.user!.userId, request.user!.role);
  void reply.status(201).send(user);
}

// =============================================================================
// GET /admin/users
// =============================================================================

/**
 * Handles `GET /admin/users`.
 *
 * Parses and validates query parameters through {@link ListUsersQuerySchema},
 * delegates to {@link adminService.listUsers} with the actor's role and scope
 * for enforcement, and returns a paginated `{ data, meta }` response.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Query: `{ page?, pageSize?, role?, departmentId?, isActive?, search? }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 */
export async function listUsersHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = ListUsersQuerySchema.parse(request.query);
  const result = await adminService.listUsers(
    query,
    request.user!.role,
    request.user!.scopeId ?? null,
  );
  void reply.status(200).send(result);
}

// =============================================================================
// GET /admin/users/:id
// =============================================================================

/**
 * Handles `GET /admin/users/:id`.
 *
 * Extracts the `id` URL parameter and delegates to {@link adminService.getUserById}.
 * Returns the user record (sensitive fields omitted) with status 200.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the target user.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @throws {AppError} `NOT_FOUND` (404) — target user does not exist.
 */
export async function getUserByIdHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const user = await adminService.getUserById(id);
  void reply.status(200).send(user);
}

// =============================================================================
// PATCH /admin/users/:id
// =============================================================================

/**
 * Handles `PATCH /admin/users/:id`.
 *
 * Parses and validates the request body through {@link UpdateUserSchema},
 * delegates to {@link adminService.updateUser}, and returns the updated user
 * record with status 200.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the target user.
 *                  Body: partial `UpdateUserSchema` fields.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @throws {AppError} `NOT_FOUND` (404) — target user does not exist.
 * @throws {AppError} `VALIDATION_ERROR` (400) — role/scopeId incompatibility.
 */
export async function updateUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  const body = UpdateUserSchema.parse(request.body);
  const user = await adminService.updateUser(id, body, request.user!.userId);
  void reply.status(200).send(user);
}

// =============================================================================
// DELETE /admin/users/:id
// =============================================================================

/**
 * Handles `DELETE /admin/users/:id`.
 *
 * Extracts the `id` URL parameter and delegates to {@link adminService.deleteUser}
 * for a soft-delete (sets `deletedAt` and `isActive: false`). Returns a
 * confirmation message with status 200.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the target user.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @throws {AppError} `NOT_FOUND` (404) — target user does not exist.
 */
export async function deleteUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  await adminService.deleteUser(id, request.user!.userId);
  void reply.status(200).send({ message: 'User deleted successfully.' });
}

// =============================================================================
// POST /admin/users/import
// =============================================================================

/**
 * Handles `POST /admin/users/import`.
 *
 * Reads the multipart form-data body. Expects:
 * - A CSV file field (any field name) containing the user data.
 * - An optional `dryRun` text field (`"true"` / `"false"`).
 *
 * When `dryRun` is `true`, the service validates all rows and returns a preview
 * without creating any accounts. When `false` (default), the CSV is uploaded to
 * S3 and processed immediately via {@link processBulkImport}.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Expects a multipart form-data body with a CSV file field.
 * @param reply   - Fastify reply used to send the HTTP response.
 */
export async function importUsersHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parts = request.parts();

  let csvBuffer: Buffer | null = null;
  let dryRun = false;

  for await (const part of parts) {
    if (part.type === 'file') {
      const chunks: Buffer[] = [];
      for await (const chunk of part.file) {
        chunks.push(chunk as Buffer);
      }
      csvBuffer = Buffer.concat(chunks);
    } else if (part.type === 'field' && part.fieldname === 'dryRun') {
      dryRun = part.value === 'true';
    }
  }

  if (!csvBuffer || csvBuffer.length === 0) {
    void reply.status(400).send({
      errors: [{ code: 'VALIDATION_ERROR', message: 'CSV file is required.' }],
      statusCode: 400,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Upload to S3 first, then process
  const { importUsers } = await import('./admin.service.js');
  const { jobId } = await importUsers(csvBuffer, request.user!.userId, request.user!.role);

  // Derive the S3 key from the jobId (matches the format in importUsers)
  const s3Key = `imports/${jobId.replace('bulk-', '')}-${request.user!.userId}.csv`;

  const result = await processBulkImport(s3Key, request.user!.userId, dryRun);

  if (!result.success) {
    void reply.status(400).send({
      errors: result.errors.map((e) => ({
        code: 'VALIDATION_ERROR',
        message: e.message,
        field: `row${e.row}.${e.field}`,
      })),
      statusCode: 400,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if ('dryRun' in result && result.dryRun) {
    void reply.status(200).send(result);
    return;
  }

  void reply.status(201).send({
    ...result,
    message: `Import complete. ${(result as { created: number }).created} accounts created.`,
  });
}

// =============================================================================
// POST /admin/users/:id/reset-totp
// =============================================================================

/**
 * Handles `POST /admin/users/:id/reset-totp`.
 *
 * Clears the target user's TOTP secret, enrollment flag, and all backup codes,
 * then writes an AuditLog entry. The user must re-enroll TOTP on next login.
 * Restricted to SUPER_ADMIN via the route's `requireRoles` preHandler.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the target user.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @throws {AppError} `NOT_FOUND` (404) — target user does not exist.
 */
export async function resetTotpHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };
  await adminService.resetUserTotp(id, request.user!.userId);
  void reply.status(200).send({ message: 'TOTP reset successfully.' });
}

// =============================================================================
// Academic Sessions & Semesters
// =============================================================================

/**
 * Handles `GET /admin/academic-sessions`.
 *
 * Returns all academic sessions ordered by start date descending.
 *
 * @param _request - Fastify request (unused — no query params).
 * @param reply    - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 */
export async function listAcademicSessionsHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { listAcademicSessions } = await import('./admin.service.js');
  const result = await listAcademicSessions();
  void reply.status(200).send(result);
}

/**
 * Handles `POST /admin/academic-sessions`.
 *
 * Creates a new academic session with `isActive: false`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Body: `{ name, startDate, endDate }`.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `CONFLICT` (409) — session name already exists.
 */
export async function createAcademicSessionHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { createAcademicSession } = await import('./admin.service.js');
  const body = request.body as { name: string; startDate: string; endDate: string };
  const result = await createAcademicSession(
    { name: body.name, startDate: new Date(body.startDate), endDate: new Date(body.endDate) },
    request.user!.userId,
  );
  void reply.status(201).send(result);
}

/**
 * Handles `PATCH /admin/academic-sessions/:id/activate`.
 *
 * Activates the specified session and deactivates all others atomically.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the session to activate.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — session does not exist.
 */
export async function activateAcademicSessionHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { activateAcademicSession } = await import('./admin.service.js');
  const { id } = request.params as { id: string };
  const result = await activateAcademicSession(id, request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `POST /admin/academic-sessions/:id/semesters`.
 *
 * Creates a new semester within the specified academic session.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL param: `id` — UUID of the parent academic session.
 *                  Body: semester creation fields.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — academic session does not exist.
 * @throws {AppError} `CONFLICT` (409) — semester of same type already exists.
 */
export async function createSemesterHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { createSemester } = await import('./admin.service.js');
  const { id } = request.params as { id: string };
  const body = request.body as {
    type: import('@prisma/client').SemesterType;
    startDate: string;
    endDate: string;
    examStartDate?: string;
    eligibilityComputeDate?: string;
    eligibilityThreshold?: number;
    appealWindowDays?: number;
    maxApprovedExcuses?: number;
  };
  const result = await createSemester(
    {
      academicSessionId: id,
      type: body.type,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      ...(body.examStartDate !== undefined && { examStartDate: new Date(body.examStartDate) }),
      ...(body.eligibilityComputeDate !== undefined && {
        eligibilityComputeDate: new Date(body.eligibilityComputeDate),
      }),
      ...(body.eligibilityThreshold !== undefined && {
        eligibilityThreshold: body.eligibilityThreshold,
      }),
      ...(body.appealWindowDays !== undefined && { appealWindowDays: body.appealWindowDays }),
      ...(body.maxApprovedExcuses !== undefined && { maxApprovedExcuses: body.maxApprovedExcuses }),
    },
    request.user!.userId,
  );
  void reply.status(201).send(result);
}

/**
 * Handles `PATCH /admin/academic-sessions/:id/semesters/:semesterId/activate`.
 *
 * Activates the specified semester and deactivates all others in the same session.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL params: `id` — session UUID, `semesterId` — semester UUID.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — semester does not exist.
 */
export async function activateSemesterHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { activateSemester } = await import('./admin.service.js');
  const { semesterId } = request.params as { id: string; semesterId: string };
  const result = await activateSemester(semesterId, request.user!.userId);
  void reply.status(200).send(result);
}

/**
 * Handles `PATCH /admin/academic-sessions/:id/semesters/:semesterId/freeze`.
 *
 * Freezes the specified semester by setting `isFrozen = true`.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  URL params: `id` — session UUID, `semesterId` — semester UUID.
 * @param reply   - Fastify reply used to send the HTTP response.
 * @returns A promise that resolves once the response is sent.
 * @throws {AppError} `NOT_FOUND` (404) — semester does not exist.
 */
export async function freezeSemesterHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { freezeSemester } = await import('./admin.service.js');
  const { semesterId } = request.params as { id: string; semesterId: string };
  const result = await freezeSemester(semesterId, request.user!.userId);
  void reply.status(200).send(result);
}
