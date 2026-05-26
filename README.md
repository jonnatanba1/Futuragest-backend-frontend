# FuturaGest

Workforce and assignment management system for waste collection operations.

## Monorepo structure

```
futuragest/
├── backend/          NestJS API (TypeScript, hexagonal architecture)
├── frontend_web/     React + Vite + TypeScript (web shell)
├── frontend_flutter/ Flutter mobile app (separate repo — placeholder only)
├── packages/
│   ├── contracts/    Shared types (Role enum + future OpenAPI-generated types)
│   ├── tsconfig/     Shared TypeScript configurations
│   └── eslint-config/ Shared ESLint configuration
└── .github/workflows/ CI pipeline (GitHub Actions)
```

## Prerequisites

- Node.js 20+
- pnpm 9 (`npm install -g pnpm@9`)

## Getting started

```bash
# Install all dependencies
pnpm install

# Run all tests
pnpm test

# Type-check all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Build all packages
pnpm build
```

## Individual packages

```bash
# Run only backend tests
pnpm turbo run test --filter=@futuragest/api

# Run only frontend tests
pnpm turbo run test --filter=@futuragest/web

# Build only contracts
pnpm turbo run build --filter=@futuragest/contracts
```

## Development

```bash
# Backend dev server (hot reload)
cd backend && pnpm start:dev

# Frontend dev server
cd frontend_web && pnpm dev
```

## CI

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and PR to `main`:
1. `pnpm install --frozen-lockfile`
2. `turbo lint`
3. `turbo typecheck`
4. `turbo test`
5. `turbo build`

It includes `postgres:16` and `minio` service containers for integration tests (active from PR2 onward).
