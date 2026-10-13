# Pin the base image by digest for reproducible builds: resolve the current
# digest with `docker buildx imagetools inspect node:24-bookworm-slim` and pass
# it as NODE_IMAGE=node:24-bookworm-slim@sha256:<digest> (or set the default
# below). Left as the tag here so no unverified digest is committed.
ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base

ARG PNPM_VERSION=11.19.0
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
RUN npm install --global "pnpm@${PNPM_VERSION}" \
  && test "$(pnpm --version)" = "${PNPM_VERSION}"

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build

COPY . ./
# Public, non-secret build-time setting: Next.js inlines NEXT_PUBLIC_* values
# into the static pages and client bundle, so it must be present here, not at
# runtime. Empty (the default) builds without Google Analytics.
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID=
ENV NEXT_PUBLIC_GA_MEASUREMENT_ID=${NEXT_PUBLIC_GA_MEASUREMENT_ID}
# scripts/ ships in the runtime image (release-step migrations, preflights,
# the container healthcheck); its tests do not.
RUN pnpm build \
  && pnpm prune --prod \
  && find scripts -type f -name '*.test.*' -delete \
  && mkdir -p public

FROM base AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Identifies the build itself. This cannot drift from the image it is baked into.
ARG BUILD_COMMIT=unknown
ENV BUILD_COMMIT=${BUILD_COMMIT}

RUN groupadd --system --gid 1001 linkar \
  && useradd --system --uid 1001 --gid linkar --create-home linkar

COPY --from=build --chown=linkar:linkar /app/package.json ./
COPY --from=build --chown=linkar:linkar /app/node_modules ./node_modules
COPY --from=build --chown=linkar:linkar /app/.next ./.next
COPY --from=build --chown=linkar:linkar /app/public ./public
# The worker is bundled to plain JS at build time (pnpm build:worker), so the
# runtime image needs neither the TypeScript sources nor a TS loader.
COPY --from=build --chown=linkar:linkar /app/dist ./dist
COPY --from=build --chown=linkar:linkar /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build --chown=linkar:linkar /app/prisma/migrations ./prisma/migrations
# Lets the release run `pnpm db:migrate:deploy` (and the preflights) inside
# this exact image - see "Database migrations" in ops/DOKPLOY_DEPLOYMENT.md.
COPY --from=build --chown=linkar:linkar /app/scripts ./scripts
COPY --from=build --chown=linkar:linkar /app/next.config.ts ./
# `next start` loads next.config.ts, which imports the security header policy.
# Every file it imports must be copied here (src/lib/security/headers.test.ts
# checks this list).
COPY --from=build --chown=linkar:linkar /app/src/lib/security/headers.ts ./src/lib/security/headers.ts
COPY --from=build --chown=linkar:linkar /app/src/lib/analytics-path.ts ./src/lib/analytics-path.ts
COPY --from=build --chown=linkar:linkar /app/tsconfig.json ./

USER linkar

EXPOSE 3000

# Works for both the web (`next start`) and worker (`node dist/worker.js`)
# containers built from this image; see scripts/container-healthcheck.mjs.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD ["node", "scripts/container-healthcheck.mjs"]

CMD ["./node_modules/.bin/next", "start"]
