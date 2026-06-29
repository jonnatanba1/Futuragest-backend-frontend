# Stage 1: builder
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

# Build-time fallback only. The real backend origin is injected at RUNTIME via
# /config.js (rendered by nginx from API_ORIGIN — see nginx.conf), which takes
# precedence in src/config.ts. This baked value is just a safety net for the
# unlikely case /config.js fails to load; no rebuild is needed to repoint.
ENV VITE_API_BASE_URL=https://backfuturagest.jjsoftech.com

RUN pnpm run build

# Stage 2: runner
FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html

# nginx.conf is an envsubst TEMPLATE: the official image processes
# /etc/nginx/templates/*.template at startup. NGINX_ENVSUBST_FILTER restricts
# substitution to API_ORIGIN so nginx's own $uri/$host are left intact.
# Override the backend origin at deploy time (Dokploy env):
#   API_ORIGIN=https://backfuturagest.jjsoftech.com
ENV API_ORIGIN=http://localhost:3000
ENV NGINX_ENVSUBST_FILTER=API_ORIGIN
COPY nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
