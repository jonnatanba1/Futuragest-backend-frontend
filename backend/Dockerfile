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
RUN pnpm dlx prisma generate

# Copy compiled output from builder
COPY --from=builder /app/dist dist

EXPOSE 3000

CMD ["node", "dist/main"]
