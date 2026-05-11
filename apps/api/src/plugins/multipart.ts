/**
 * @file multipart.ts
 * @module plugins
 *
 * Registers `@fastify/multipart` to enable multipart/form-data file uploads.
 *
 * Used by `POST /admin/users/import` to accept CSV file uploads.
 * File size is capped at 10 MB to prevent abuse.
 */

import fp from 'fastify-plugin';
import multipart from '@fastify/multipart';
import { type FastifyInstance } from 'fastify';

/** Maximum allowed upload size in bytes (10 MB). */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Fastify plugin that registers multipart form-data support.
 *
 * After registration, route handlers can call `request.file()` to access
 * the uploaded file stream.
 *
 * @param app - The Fastify application instance to register the plugin on.
 */
export default fp(async function multipartPlugin(app: FastifyInstance): Promise<void> {
  await app.register(multipart, {
    limits: {
      fileSize: MAX_FILE_SIZE_BYTES,
    },
  });
});
