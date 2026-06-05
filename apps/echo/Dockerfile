# Build layer
FROM rust:1-alpine AS build

RUN apk add --no-cache musl-dev

WORKDIR /src

COPY apps/echo/Cargo.toml apps/echo/Cargo.lock ./
COPY apps/echo/src ./src

RUN cargo build --release --locked

# Package layer
FROM scratch

COPY --from=build /src/target/release/echo /echo

ENTRYPOINT ["/echo"]
