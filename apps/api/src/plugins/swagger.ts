/**
 * @file swagger.ts
 * @module plugins
 *
 * Registers `@fastify/swagger` and `@fastify/swagger-ui` for OpenAPI 3.0
 * documentation generation.
 *
 * - The OpenAPI spec is auto-generated from Fastify route schemas and served
 *   at `GET /docs/json`.
 * - The Swagger UI is served at `GET /docs` in non-production environments only.
 * - The `bearerAuth` security scheme is declared globally so all protected
 *   routes can reference it with `security: [{ bearerAuth: [] }]`.
 *
 * Servers:
 * - Local development: `http://127.0.0.1:3001`
 * - Production: `https://api.kwasu.edu.ng`
 */

import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { type FastifyInstance } from 'fastify';
import { env } from '../config/env.js';

/**
 * Fastify plugin that registers OpenAPI spec generation and Swagger UI.
 *
 * Swagger UI is only mounted when `NODE_ENV !== 'production'` to avoid
 * exposing API documentation in the live environment.
 *
 * @param app - The Fastify application instance to register the plugin on.
 */
export default fp(async function swaggerPlugin(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'KWASU AMS API',
        description: 'Kwara State University Attendance Management System REST API',
        version: '1.0.0',
      },
      servers: [
        { url: 'http://127.0.0.1:3001', description: 'Local development' },
        { url: 'https://api.kwasu.edu.ng', description: 'Production' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  // Swagger UI only in non-production environments
  if (env.NODE_ENV !== 'production') {
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
    });
  }
});
