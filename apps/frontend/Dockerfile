# Base layer
FROM node:24-alpine AS base

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps ./apps

RUN pnpm fetch --frozen-lockfile

# Build layer
FROM base AS build

COPY . .

ARG WS_NAME="@railway-latency/frontend"

RUN pnpm install --filter ${WS_NAME}...

RUN pnpm -r --filter ...^${WS_NAME} run build

ARG NODE_ENV="production"
ENV NODE_ENV=$NODE_ENV
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT=standalone
RUN pnpm --filter ${WS_NAME}... build

# Package layer
FROM node:24-alpine AS package

RUN apk --no-cache add curl

WORKDIR /railway-latency

COPY --from=build /workspace/apps/frontend/.next/standalone /railway-latency
COPY --from=build /workspace/apps/frontend/.next/static /railway-latency/apps/frontend/.next/static
COPY --from=build /workspace/apps/frontend/public /railway-latency/apps/frontend/public

CMD ["node", "/railway-latency/apps/frontend/server.js"]
