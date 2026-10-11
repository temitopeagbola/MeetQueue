# syntax=docker/dockerfile:1.7
# Build context: repository root (the API depends on packages/core).

FROM node:22-bookworm-slim AS base
# openssl: required by Prisma's schema engine (migrations).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --filter @meetqueue/api...
COPY packages/core packages/core
COPY apps/api apps/api
RUN pnpm --filter @meetqueue/api build \
  && pnpm --filter @meetqueue/api deploy --prod --legacy /out

FROM base AS runtime
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply pending migrations (idempotent), then start. Set RUN_SEED=true to (re)seed the demo host.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && if [ \"$RUN_SEED\" = \"true\" ]; then node dist/seed.js; fi && exec node dist/server.js"]
