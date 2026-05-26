# Stage 1: builder
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @futuragest/web run build

# Stage 2: runner
FROM nginx:alpine AS runner

COPY --from=builder /app/frontend_web/dist /usr/share/nginx/html

# SPA routing: all 404s → index.html
COPY frontend_web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
