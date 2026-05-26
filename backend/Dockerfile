# Stage 1: builder
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy the entire monorepo so pnpm workspace links resolve correctly
COPY . .

RUN pnpm install --frozen-lockfile

# Generate Prisma client (Prisma 7 WASM client for linux-musl-openssl-3.0.x)
RUN pnpm --filter @futuragest/api exec prisma generate

# Build the API
RUN pnpm --filter @futuragest/api run build

# Stage 2: runner
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace manifests and lockfile
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/ packages/
COPY backend/package.json backend/
COPY backend/prisma/ backend/prisma/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output from builder
COPY --from=builder /app/backend/dist backend/dist

# Copy Prisma generated client from builder
COPY --from=builder /app/backend/node_modules/.prisma backend/node_modules/.prisma
COPY --from=builder /app/backend/node_modules/@prisma backend/node_modules/@prisma

EXPOSE 3000

WORKDIR /app/backend

CMD ["node", "dist/main"]
