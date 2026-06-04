# Build layer
FROM golang:1.22-alpine AS build

WORKDIR /src

COPY apps/echo/go.mod ./
COPY apps/echo/main.go ./

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /echo .

# Package layer
FROM scratch

COPY --from=build /echo /echo

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["/echo"]
