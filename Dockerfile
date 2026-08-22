FROM golang:1.21-alpine AS builder

# Set working directory
WORKDIR /app

# Copy go modules and sum
COPY go.mod go.sum ./

# Download dependencies (cached layer)
RUN go mod download

# Copy all source code
COPY . .

# Build the Go binary
# -tags netgo: pure Go (no CGO), avoids CGO/sqlite3 issues
# -ldflags: strip binary
RUN go build -tags netgo -ldflags '-s -w' -o app ./cmd/server

# Final stage: minimal runtime image
FROM alpine:3.19

# Create app user (non-root)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/app .

# Expose ports
EXPOSE 8080 8081

# Set user
USER appuser

# Start the server
CMD ["./app"]