FROM node:24-bookworm-slim AS base

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
RUN pnpm build \
  && pnpm prune --prod \
  && find src -type f -name '*.test.*' -delete \
  && mkdir -p public

FROM base AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 replyconnect \
  && useradd --system --uid 1001 --gid replyconnect --create-home replyconnect

COPY --from=build --chown=replyconnect:replyconnect /app/package.json ./
COPY --from=build --chown=replyconnect:replyconnect /app/node_modules ./node_modules
COPY --from=build --chown=replyconnect:replyconnect /app/.next ./.next
COPY --from=build --chown=replyconnect:replyconnect /app/public ./public
# The worker is bundled to plain JS at build time (pnpm build:worker), so the
# runtime image needs neither the TypeScript sources nor a TS loader.
COPY --from=build --chown=replyconnect:replyconnect /app/dist ./dist
COPY --from=build --chown=replyconnect:replyconnect /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build --chown=replyconnect:replyconnect /app/prisma/migrations ./prisma/migrations
COPY --from=build --chown=replyconnect:replyconnect /app/next.config.ts ./
COPY --from=build --chown=replyconnect:replyconnect /app/tsconfig.json ./

USER replyconnect

EXPOSE 3000

CMD ["./node_modules/.bin/next", "start"]