/**
 * @file helmet.ts
 * @module plugins
 *
 * Registers `@fastify/helmet` with a strict Content Security Policy and
 * security headers (HSTS, X-Content-Type-Options, X-XSS-Protection).
 *
 * CSP restricts resource loading to `'self'` by default, preventing XSS and
 * data injection attacks. Inline styles are allowed for Swagger UI rendering.
 */

import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';
import { type FastifyInstance } from 'fastify';

/**
 * Fastify plugin that registers Helmet security headers.
 *
 * @param app - The Fastify application instance to register the plugin on.
 */
export default fp(async function helmetPlugin(app: FastifyInstance): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
      },
    },
    hsts: {
      maxAge: 31_536_000,
      includeSubDomains: true,
    },
    noSniff: true,
    xssFilter: true,
  });
});
