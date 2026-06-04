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

ARG WS_NAME="@railway-latency/echo"

RUN pnpm install --filter ${WS_NAME}...

RUN pnpm --filter ${WS_NAME}... build

RUN pnpm --filter ${WS_NAME} deploy --prod /output

# Package layer
FROM node:24-alpine AS package

WORKDIR /railway-latency

COPY --from=build /output /railway-latency

CMD ["node", "--max-old-space-size=32", "/railway-latency/dist/index.js"]
