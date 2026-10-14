FROM node:24-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client
RUN DATABASE_URL=postgresql://user:password@localhost:5432/placeholder npx prisma generate

# Build TypeScript
RUN npm run build

# Keep development and build tools out of the runtime image.
RUN npm prune --omit=dev

# Production stage
FROM node:24-alpine AS runner

WORKDIR /app

# Copy built assets and production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

USER node

# Start application
CMD ["npm", "start"]
