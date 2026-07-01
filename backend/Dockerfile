# Stage 1: builder
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy package and lockfile
COPY package.json pnpm-lock.yaml ./
COPY prisma/ prisma/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm exec prisma generate

# Copy source code
COPY . .

# Build the API
RUN pnpm run build

# Stage 2: runner
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy package.json and prisma schema
COPY package.json pnpm-lock.yaml ./
COPY prisma/ prisma/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Generate Prisma client for production
RUN pnpm exec prisma generate

# Create prisma config for production (plain JS — no tsx needed)
RUN echo 'module.exports = { schema: "./prisma/schema.prisma", datasource: { url: process.env.DATABASE_URL } };' > prisma.config.js

# Copy compiled output from builder
COPY --from=builder /app/dist dist

EXPOSE 3000

# Run migrations on startup, then start the app
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main"]
