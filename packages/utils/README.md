# @kwasu-ams/utils

Shared helper functions for the KWASU AMS monorepo.

## Structure

```
src/
├── index.ts                    ← Barrel export
├── constants/
│   ├── identity.ts             ← MATRIC_NUMBER_REGEX, STAFF_ID_REGEX (single source of truth)
│   ├── attendance.ts           ← Attendance threshold constants
│   ├── geofence.ts             ← Nigeria bounding box, default radius
│   └── alphanumeric-charset.ts ← Unambiguous character set for codes
├── geofence.ts                 ← Haversine formula geofence validator
├── spoofing.ts                 ← GPS spoofing detection
├── qr-token.ts                 ← QR token JWT signing and verification
├── alphanumeric-code.ts        ← Alphanumeric code generator
├── attendance.ts               ← Attendance percentage and eligibility calculations
├── date.ts                     ← Date utility helpers
└── result.ts                   ← Result<T, E> type for fallible operations
```

## Key Rules

- `constants/identity.ts` is the **single source of truth** for `MATRIC_NUMBER_REGEX`
  and `STAFF_ID_REGEX`. Import them from `@kwasu-ams/utils` — never redefine them.
- All utility functions use the `Result<T, E>` pattern for operations that can fail
  without throwing (defined in `result.ts`).

## Implementation

Utility implementations are added in **Phase 07**.
