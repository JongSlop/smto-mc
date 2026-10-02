# syntax=docker/dockerfile:1

# node:22-slim, not alpine: Prisma's engines are built against glibc, and slim
# is Debian-based.

FROM node:22-slim AS build
RUN corepack enable
# Prisma's query engine needs libssl at runtime; the slim image does not ship
# it, and its own postinstall step warns about exactly this.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

# Manifests first, so this layer only invalidates when a dependency changes,
# not on every source edit.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
# Not used by the backend, but the lockfile covers every workspace package and a
# frozen install refuses to run if one of them is missing.
COPY packages/schematics/package.json packages/schematics/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY e2e/package.json e2e/package.json
RUN pnpm install --frozen-lockfile

COPY packages/contracts packages/contracts
COPY backend backend

# The backend imports @smto/mc-contracts' compiled output, not its source, so it
# has to be built first.
RUN pnpm --filter @smto/mc-contracts build
# Defensive: @prisma/client normally generates itself on install, but a
# frozen-lockfile install is exactly the kind of install that sometimes skips
# postinstall scripts. Generating the client only reads the schema, never the
# database, but prisma.config.ts still requires DATABASE_URL to be set to load
# at all, so a placeholder stands in; the real one arrives at container start.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm --filter @smto/mc-backend exec prisma generate
RUN pnpm --filter @smto/mc-backend build

# Bundles the backend with its production dependencies (including the now-built
# contracts package) into one self-contained, non-symlinked directory. Doing
# this by hand across pnpm's workspace symlink layout is exactly the kind of
# thing that looks fine locally and breaks in the image.
RUN pnpm --filter @smto/mc-backend deploy --prod --legacy /repo/out/backend

# The generated client lives in node_modules/.prisma, which is build output, not
# a declared dependency, so `deploy` above does not carry it into the fresh
# node_modules it creates. Generating again against that directory fixes it in
# the place it will actually be run from.
WORKDIR /repo/out/backend
RUN ./node_modules/.bin/prisma generate
WORKDIR /repo

FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/out/backend ./
COPY docker/backend/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 3011
ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/main.js"]
