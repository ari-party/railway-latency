# Build layer
FROM node:24-alpine AS build

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /workspace

COPY . .

RUN pnpm install --filter @railway-latency/aggregator... --frozen-lockfile

RUN pnpm --filter @railway-latency/aggregator... run build

# Package layer
FROM imbios/bun-node:24-alpine AS package

RUN apk --no-cache add curl

WORKDIR /app

COPY --from=build /workspace/apps/aggregator/dist dist
COPY --from=build /workspace/node_modules node_modules
COPY --from=build /workspace/apps/aggregator/package.json package.json

CMD ["bun", "run", "dist/index.js"]
