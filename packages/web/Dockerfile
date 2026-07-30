# Build context is the repo root (see docker-compose.yml). The bake step
# needs the compiled core package and benchmarks/results.json.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
COPY benchmarks/package.json benchmarks/
RUN npm ci

COPY packages/core packages/core
COPY packages/web packages/web
COPY benchmarks/results.json benchmarks/results.json
RUN npm run build -w @enterprise-ops/core && npm run build -w @enterprise-ops/web

FROM nginx:alpine
COPY --from=build /app/packages/web/dist/enterprise-ops-web/browser /usr/share/nginx/html
