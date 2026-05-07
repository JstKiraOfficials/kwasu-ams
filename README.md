# KWASU AMS

**Kwara State University Attendance Management System** — a production-grade, full-stack, mobile-first platform that eliminates proxy attendance, automates exam eligibility, and delivers real-time attendance data to every stakeholder.

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment variables and fill in values
cp .env.example .env

# 3. Start local infrastructure (PostgreSQL 16 + Redis 7)
docker compose up -d

# 4. Verify services are healthy
docker compose ps

# 5. Build all packages and apps
pnpm build
```

### Development

```bash
pnpm dev          # Start all apps in watch mode
pnpm lint         # Run ESLint across all packages
pnpm type-check   # Run tsc --noEmit across all packages
pnpm test         # Run Vitest across all packages
```

## Monorepo Structure

```
kwasu-ams/
├── apps/
│   ├── web/      → Next.js 14+ App Router (admin, lecturers, HODs, Deans)
│   ├── mobile/   → React Native + Expo (students & lecturers in-class)
│   └── api/      → Node.js + Fastify REST API
├── packages/
│   ├── types/    → Shared TypeScript interfaces, enums, and Zod schemas
│   ├── utils/    → Shared helpers (geofence, date utils, identity regex, etc.)
│   └── config/   → Shared ESLint, TypeScript, and Prettier configuration
└── turbo.json
```

## Documentation

See [`docs/README.md`](docs/README.md) for full documentation index.
