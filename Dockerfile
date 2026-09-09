# syntax=docker/dockerfile:1

# ---- frontend ----
FROM node:20-alpine AS frontend
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
# Same-origin API/WS when the Go server serves the built dashboard.
ENV VITE_API_BASE=""
ENV VITE_WS_BASE=""
RUN npm run build

# ---- go builder ----
FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags '-s -w' -o app ./cmd/server

# ---- runtime ----
FROM alpine:3.20
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && mkdir -p /app/data /app/data/files /app/web/dist /app/configs \
    && chown -R appuser:appgroup /app
WORKDIR /app
COPY --from=builder /app/app .
COPY --from=builder /app/configs ./configs
COPY --from=frontend /web/dist ./web/dist
USER appuser
EXPOSE 8080
ENV PORT=8080
ENV RATC2_DATABASE_PATH=/app/data/ratc2.db
CMD ["./app"]
