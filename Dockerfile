# Backend Dockerfile for Rust application

# Build stage
# NOTE: Some transitive deps (darling 0.23, serde_with 3.18, time 0.3.47,
# time-macros 0.2.27) require rustc >= 1.88, so 1.87 no longer builds.
# Using the bookworm flavor to match the runtime image's glibc.
FROM rust:1.95-bookworm AS builder

# Install CA certificates and update SSL  
RUN apt-get update && apt-get install -y ca-certificates && update-ca-certificates

WORKDIR /app

# Copy manifests
COPY Cargo.toml Cargo.lock ./

# Create dummy main to cache dependencies
# Use --bin to only build main binary (skip dev tools like rate_limit_tester)
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    cargo build --release --locked --bin auto_analyser_2 && \
    rm -rf src

# Copy source code
COPY src ./src
COPY examples ./examples

# Build for release (touch to force rebuild)
RUN touch src/main.rs && cargo build --release --locked --bin auto_analyser_2

# Runtime stage
FROM debian:bookworm-slim

# Install required runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/target/release/auto_analyser_2 .

# Create .env file placeholder (will be overridden by docker compose)
ENV MONGODB_URI=mongodb://mongodb:27017
ENV DATABASE_NAME=stock_analyzer
ENV SERVER_HOST=0.0.0.0
ENV SERVER_PORT=3333
ENV ANALYSIS_INTERVAL_SECS=3600
ENV CACHE_TTL_SECS=300

EXPOSE 3333

CMD ["./auto_analyser_2"]
