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

# nginx.conf is an envsubst TEMPLATE: the official image processes
# /etc/nginx/templates/*.template at startup. NGINX_ENVSUBST_FILTER restricts
# substitution to API_ORIGIN so nginx's own $uri/$host are left intact.
# Override the backend origin at deploy time: -e API_ORIGIN=https://api.futuragest.co
ENV API_ORIGIN=http://localhost:3001
ENV NGINX_ENVSUBST_FILTER=API_ORIGIN
COPY frontend_web/nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
