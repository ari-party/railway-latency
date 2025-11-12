# Build layer
FROM node:24-alpine AS build

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /workspace

COPY . .

RUN pnpm install --filter @railway-latency/probe... --frozen-lockfile

RUN pnpm --filter @railway-latency/probe... run build

# Package layer
FROM imbios/bun-node:24-alpine AS package

RUN apk --no-cache add curl

WORKDIR /railway-latency

COPY --from=build /workspace/node_modules /railway-latency/node_modules
COPY --from=build /workspace/apps/probe/node_modules /railway-latency/apps/probe/node_modules
COPY --from=build /workspace/apps/probe/package.json /railway-latency/apps/probe/package.json
COPY --from=build /workspace/apps/probe/dist /railway-latency/apps/probe/dist

CMD ["bun", "run", "/railway-latency/apps/probe/dist/index.js"]
