# Build layer
FROM node:24 AS build

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /workspace

COPY . .

RUN pnpm install --filter @railway-latency/frontend... --frozen-lockfile

ARG NODE_ENV="production"
ENV NODE_ENV=$NODE_ENV
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT=standalone

RUN pnpm --filter @railway-latency/frontend... run build

# Package layer
FROM node:24-alpine AS package

RUN apk --no-cache add curl

WORKDIR /railway-latency

COPY --from=build /workspace/apps/frontend/.next/standalone /railway-latency
COPY --from=build /workspace/apps/frontend/.next/static /railway-latency/apps/frontend/.next/static

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "/railway-latency/apps/frontend/server.js"]
