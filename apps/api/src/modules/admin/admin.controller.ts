/**
 * @file admin.controller.ts
 * @module modules/admin
 *
 * Thin HTTP controller layer for the admin module.
 *
 * Each handler validates the incoming request, delegates to the service layer,
 * and returns the appropriate HTTP response. No business logic lives here.
 */

import { type FastifyReply, type FastifyRequest } from 'fastify';
import { CreateUserSchema } from './admin.schema.js';
import * as adminService from './admin.service.js';

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

/**
 * Handles `POST /admin/users/import`.
 *
 * Reads the multipart CSV file from the request, buffers it in memory, and
 * delegates to {@link adminService.importUsers} which uploads it to S3 and
 * queues a BullMQ processing job. Returns 202 Accepted with the job ID.
 *
 * @param request - Fastify request with `request.user` set by `authenticate`.
 *                  Expects a multipart form-data body with a CSV file field.
 * @param reply   - Fastify reply used to send the HTTP response.
 */
export async function importUsersHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const data = await request.file();

  if (!data) {
    void reply.status(400).send({
      errors: [{ code: 'VALIDATION_ERROR', message: 'CSV file is required.' }],
      statusCode: 400,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Buffer the entire file before uploading — prevents streaming issues with S3
  const chunks: Buffer[] = [];
  for await (const chunk of data.file) {
    chunks.push(chunk as Buffer);
  }
  const csvBuffer = Buffer.concat(chunks);

  const result = await adminService.importUsers(
    csvBuffer,
    request.user!.userId,
    request.user!.role,
  );

  void reply.status(202).send({
    jobId: result.jobId,
    message: 'Import job queued. You will be notified when complete.',
  });
}
