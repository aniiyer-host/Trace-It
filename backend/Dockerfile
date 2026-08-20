FROM node:24-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Dummy DATABASE_URL so prisma generate can resolve config at build time
# (real value is supplied at runtime via docker-compose / env)
ARG DATABASE_URL=postgresql://user:password@localhost:5432/placeholder
ENV DATABASE_URL=$DATABASE_URL

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Production stage
FROM node:24-alpine AS runner

WORKDIR /app

# Copy built assets from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# Dummy value again for the second `prisma generate` call in this stage
ARG DATABASE_URL=postgresql://user:password@localhost:5432/placeholder
ENV DATABASE_URL=$DATABASE_URL

# Generate Prisma client in production
RUN npx prisma generate

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start application
CMD ["npm", "start"]