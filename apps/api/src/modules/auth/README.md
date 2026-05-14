# Auth Module

Handles all authentication flows for KWASU AMS.

## Endpoints

| Method | Path                    | Auth   | Description                             |
| ------ | ----------------------- | ------ | --------------------------------------- |
| POST   | `/auth/login`           | None   | Login with matric number or staff ID    |
| POST   | `/auth/refresh`         | None   | Rotate access + refresh token pair      |
| POST   | `/auth/forgot-password` | None   | Request password reset link via email   |
| POST   | `/auth/reset-password`  | None   | Consume single-use reset token          |
| POST   | `/auth/change-password` | Bearer | Change password (forced on first login) |
| POST   | `/auth/logout`          | Bearer | Invalidate refresh token                |

## Login Flow

```
POST /auth/login
  → validates identifier format (MATRIC_NUMBER_REGEX or STAFF_ID_REGEX)
  → verifies Argon2id password hash
  → enforces 5-attempt lockout (15-minute window)
  → returns interimToken (5 min) + mustChangePassword + totpEnrolled flags

POST /auth/verify-totp  ← Phase 11
  → validates 6-digit TOTP code (±1 step tolerance)
  → returns accessToken (30 min) + refreshToken (7 days)
```

## Security Rules

- All login failure paths return the same generic `"Invalid credentials."` message — no user enumeration.
- Rate limit: **5 requests/minute** on all `/auth/*` routes.
- Refresh tokens are single-use — old token is blocklisted in Redis on rotation.
- Password reset tokens are single-use — deleted from Redis after consumption.

## Dependencies

- `lib/jwt.ts` — token signing and verification
- `lib/argon2.ts` — Argon2id password hashing
- `lib/prisma.ts` — database access
- `lib/redis.ts` — refresh token blocklist and password reset tokens
- `lib/email-client.ts` — password reset email (Phase 25)
