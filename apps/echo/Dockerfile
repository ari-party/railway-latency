# Build layer
FROM golang:1.22-alpine AS build

WORKDIR /src

COPY apps/echo/go.mod apps/echo/go.sum ./
RUN go mod download

COPY apps/echo/main.go ./

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /echo .

# Package layer
FROM scratch

COPY --from=build /echo /echo

ENV PORT=8080

ENV GOGC=off
ENV GOMEMLIMIT=64MiB

EXPOSE 8080

ENTRYPOINT ["/echo"]
