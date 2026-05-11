# KWASU AMS — API Middleware

## Guard Chain

Every authenticated route runs these three middleware in order:

```
authenticate → role-guard → scope-guard
```

**Never skip or reorder this chain.**

### `authenticate.ts`

Verifies the JWT access token and attaches `request.user`. Returns `401` for any failure.
All 401 responses use the generic message `"Authentication required."` — never reveals
whether the user exists or why the token failed (except `TOKEN_EXPIRED` vs `UNAUTHORIZED`).

### `role-guard.ts`

Factory: `requireRoles(...roles: Role[])` — returns a preHandler that checks `request.user.role`.
Returns `403 FORBIDDEN` with `"Insufficient permissions."` if the role is not allowed.

### `scope-guard.ts`

Factory: `requireScope(resourceType)` — enforces data scope at the **database query level**.
`SUPER_ADMIN`, `ACADEMIC_AFFAIRS`, and `VICE_CHANCELLOR` bypass all scope checks.

### `error-handler.ts`

Global Fastify error handler. Handles:

- `ZodError` → `400` with field-level errors
- `AppError` → the error's `statusCode` and `code`
- Fastify validation errors → `400`
- Unknown errors → `500 INTERNAL_ERROR`

## Usage in Routes

```typescript
fastify.get(
  '/departments/:departmentId',
  {
    preHandler: [
      authenticate,
      requireRoles(Role.HOD, Role.DEAN, Role.SUPER_ADMIN),
      requireScope('department'),
    ],
  },
  handler,
);
```

## Public Endpoints (no auth)

- `POST /auth/login`
- `POST /auth/verify-totp`
- `POST /auth/refresh`
- `POST /auth/forgot-password`
- `POST /auth/recover-totp`
- `GET /health`
