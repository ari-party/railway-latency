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

WORKDIR /app

COPY --from=build /workspace/apps/probe/dist /app/dist
COPY --from=build /workspace/node_modules /app/node_modules
COPY --from=build /workspace/apps/probe/package.json /app/package.json

CMD ["bun", "run", "/app/dist/index.js"]
