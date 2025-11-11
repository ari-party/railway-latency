# Build layer
FROM node:24 AS build

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY ./apps/frontend /build
WORKDIR /build

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm fetch --frozen-lockfile
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

ARG NODE_ENV="production"
ENV NODE_ENV=$NODE_ENV
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT=standalone

RUN pnpm run build

# Package layer
FROM node:24-alpine AS package

RUN apk --no-cache add curl

WORKDIR /server

COPY --from=build /build/.next/standalone .
COPY --from=build /build/.next/static .next/static

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
