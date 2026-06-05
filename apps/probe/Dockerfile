FROM node:24-alpine AS schema

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages

RUN mkdir -p apps/probe/schema
RUN pnpm install --filter @railway-latency/types
RUN pnpm --filter @railway-latency/types gen:schema

# Build layer
FROM rust:1-alpine AS build

RUN apk add --no-cache musl-dev gcc

WORKDIR /src

COPY apps/probe/Cargo.toml apps/probe/Cargo.lock apps/probe/build.rs ./
COPY apps/probe/src ./src
COPY --from=schema /workspace/apps/probe/schema ./schema

RUN cargo build --release --locked

# Package layer
FROM scratch

COPY --from=build /src/target/release/probe /probe

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["/probe"]
