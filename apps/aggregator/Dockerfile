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

WORKDIR /railway-latency

COPY --from=build /workspace/node_modules /railway-latency/node_modules
COPY --from=build /workspace/apps/aggregator/node_modules /railway-latency/apps/aggregator/node_modules
COPY --from=build /workspace/apps/aggregator/package.json /railway-latency/apps/aggregator/package.json
COPY --from=build /workspace/apps/aggregator/dist /railway-latency/apps/aggregator/dist

CMD ["bun", "run", "/railway-latency/apps/aggregator/dist/index.js"]
