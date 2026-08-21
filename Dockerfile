# Stage 1: Build
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy frontend package files
COPY frontend/package*.json ./
# Install dependencies
RUN npm ci

# Copy frontend source
COPY frontend/ ./
# Build the application
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Install serve to serve static files
RUN npm install -g serve

# Expose port 3000
EXPOSE 3000

# Switch to non-root user
USER nextjs

# Serve the built app on port 3000
CMD ["serve", "-s", "dist", "-l", "3000"]