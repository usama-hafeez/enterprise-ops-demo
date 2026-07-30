# Build context is the repo root (see docker-compose.yml) - the server
# workspace depends on @enterprise-ops/core, so both are compiled here.
FROM node:22-alpine
WORKDIR /app

# Manifests first so the npm ci layer is cached until a dependency changes.
# npm ci needs every workspace's package.json to validate the lockfile.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
COPY benchmarks/package.json benchmarks/
RUN npm ci --ignore-scripts

COPY packages/core packages/core
COPY packages/server packages/server
RUN npm run build -w @enterprise-ops/core -w @enterprise-ops/server

EXPOSE 3000

# Migrate, reseed (truncate + deterministic seed - every start is a clean,
# reproducible demo state), then serve the API.
CMD ["sh", "-c", "npm run migration:run -w @enterprise-ops/server && npm run seed -w @enterprise-ops/server && npm run start -w @enterprise-ops/server"]
