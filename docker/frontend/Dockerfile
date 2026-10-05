# syntax=docker/dockerfile:1

FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo

# Build-time mount point for the frontend (see frontend/svelte.config.js).
# Empty by default — production serves the app from the root of mc.smto.dev.
# Pass --build-arg BASE_PATH=/mc/link to build the old subpath variant.
ARG BASE_PATH=
ENV BASE_PATH=${BASE_PATH}

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/schematics/package.json packages/schematics/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY e2e/package.json e2e/package.json
RUN pnpm install --frozen-lockfile

COPY packages/contracts packages/contracts
COPY packages/schematics packages/schematics
COPY frontend frontend

# The frontend imports @smto/mc-contracts' and @smto/mc-schematics' compiled
# output, not their source, so they have to be built first.
RUN pnpm --filter @smto/mc-contracts build
RUN pnpm --filter @smto/mc-schematics build
RUN pnpm --filter @smto/mc-frontend build

# Bundles the frontend with its production dependencies into one
# self-contained, non-symlinked directory, same reasoning as the backend image.
RUN pnpm --filter @smto/mc-frontend deploy --prod --legacy /repo/out/frontend

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/out/frontend ./

EXPOSE 3010
CMD ["node", "build/index.js"]
