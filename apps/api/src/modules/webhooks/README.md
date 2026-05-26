# Webhooks Module

Outbound webhook subscription system for KWASU AMS. External systems (e.g. Result Management System, Moodle LMS) can subscribe to AMS events and receive real-time signed HTTP callbacks.

## Endpoints

| Method | Path          | Guards                                   | Description                   |
| ------ | ------------- | ---------------------------------------- | ----------------------------- |
| GET    | /webhooks     | authenticate → requireRoles(SUPER_ADMIN) | List all active subscriptions |
| POST   | /webhooks     | authenticate → requireRoles(SUPER_ADMIN) | Create a subscription         |
| DELETE | /webhooks/:id | authenticate → requireRoles(SUPER_ADMIN) | Soft-delete a subscription    |

## Payload Signing

Every outbound POST includes:

- `X-KWASU-Signature: sha256={hex}` — HMAC-SHA256 of the JSON body using the subscriber's secret.
- `X-KWASU-Event: {event}` — the event name that triggered the delivery.

## Retry Policy

Failed deliveries (non-2xx or 5-second timeout) are retried up to 3 times with a fixed 5-second delay between attempts.

## Secret Storage

Subscriber secrets are stored AES-256-CBC encrypted using the `TOTP_ENCRYPTION_KEY` env var (same pattern as TOTP secret storage in `lib/totp.ts`). The plaintext secret is returned exactly once at creation time.

## Events

| Event                           | Triggered by                                        |
| ------------------------------- | --------------------------------------------------- |
| `attendance.session.opened`     | `openSession()`                                     |
| `attendance.session.closed`     | `closeSession()`                                    |
| `attendance.checkin.recorded`   | `checkInGps()`, `checkInQr()`, `checkInCode()`      |
| `student.eligibility.barred`    | Eligibility computation → BARRED                    |
| `student.eligibility.confirmed` | Eligibility computation → ELIGIBLE                  |
| `excuse.approved`               | `reviewExcuse()` / `hodReviewExcuse()` on approval  |
| `excuse.rejected`               | `reviewExcuse()` / `hodReviewExcuse()` on rejection |
