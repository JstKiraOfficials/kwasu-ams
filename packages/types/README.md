# @kwasu-ams/types

Shared TypeScript interfaces, enums, and Zod schemas for the KWASU AMS monorepo.

## Structure

```
src/
├── index.ts        ← Barrel export (re-exports everything below)
├── enums/          ← TypeScript enums (Role, AttendanceStatus, CheckInMethod, …)
├── models/         ← TypeScript interfaces mirroring Prisma models
├── schemas/        ← Zod schemas (single source of truth for runtime validation)
└── api/            ← API request/response shape types
```

## Key Rules

- Zod schemas in `src/schemas/` are the **single source of truth** for runtime validation
  on both the API server and the web/mobile clients. Never duplicate validation logic.
- All shared types live here — never define types locally in an app that belong in this package.
- This package is a runtime dependency (not devDependency) of `apps/api` and `apps/web`
  because Zod schemas are executed at runtime.

## Implementation

Types and schemas are implemented in **Phase 06**.
