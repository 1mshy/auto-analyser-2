# Frontend Dockerfile for the Vite React SPA

# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies. NOTE: do NOT add --omit=dev — since the Vite
# migration the build toolchain (vite, typescript, @vitejs/plugin-react)
# lives in devDependencies, so an production-only install cannot build.
RUN npm ci

# Copy source code
# index.html is the Vite entry module and vite.config.ts holds build.outDir
# ("build") + the es2020 target — the build fails without either of them.
COPY public ./public
COPY src ./src
COPY index.html ./
COPY vite.config.ts ./
COPY tsconfig.json tsconfig.node.json ./

# Build the application (tsc --noEmit && vite build -> /app/build)
RUN npm run build

# rollup-plugin-visualizer writes build/stats.html (a dump of the module
# graph). Useful locally, not something to serve publicly from nginx.
RUN rm -f build/stats.html

# Production stage with nginx
FROM nginx:alpine

# Copy built assets from builder
COPY --from=builder /app/build /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
