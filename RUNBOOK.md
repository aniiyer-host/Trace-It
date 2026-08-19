# TraceIt Runbook

## Overview
This runbook provides operational procedures for the TraceIt donation tracking platform, including startup, shutdown, scaling, troubleshooting, and incident response procedures.

## System Architecture
- **Frontend**: React 18 + TypeScript + Vite (served via Nginx in production)
- **Backend**: Node.js/Express with Prisma ORM (connects to PostgreSQL)
- **Database**: PostgreSQL (hosted on Supabase in production, local Docker in development)
- **Cache**: Redis (for session storage and rate limiting)
- **Object Storage**: Backblaze B2 (for document storage)
- **Secrets Management**: HashiCorp Vault (for API keys and sensitive configuration)
- **Monitoring**: Elasticsearch + Kibana (for logging and SIEM)
- **Reverse Proxy**: Caddy (with automatic HTTPS via Let's Encrypt)

## Environment Variables

### Required Variables (.env file in backend root)
```
# Database Connections
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

# JWT Secrets
JWT_ACCESS_SECRET="your-access-token-secret-here"
JWT_REFRESH_SECRET="your-refresh-token-secret-here"

# API Keys
SENDGRID_API_KEY="your-sendgrid-api-key"
RAZORPAY_KEY_ID="your-razorpay-key-id"
RAZORPAY_KEY_SECRET="your-razorpay-key-secret"

# Blockchain
BLOCKCHAIN_HMAC_SECRET="your-blockchain-hmac-secret"
SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"

# Storage
B2_ACCOUNT_ID="your-backblaze-account-id"
B2_APPLICATION_KEY="your-backblaze-application-key"
B2_BUCKET_NAME="your-traceit-bucket-name"

# Vault
VAULT_ADDR="https://your-vault-address:8200"
VAULT_TOKEN="your-vault-token"

# Other
NODE_ENV="production"
PORT="3001"
```

### Frontend Variables (.env file in frontend root)
```
VITE_API_URL="https://api.traceit.org"
VITE_SOLANA_NETWORK="mainnet-beta"
```

## Service Dependencies
1. PostgreSQL (database)
2. Redis (cache/rate limiting)
3. Backblaze B2 (object storage)
4. HashiCorp Vault (secrets)
5. SMTP Service (email - SendGrid)
6. Solana RPC (blockchain - for future integration)

## Startup Procedures

### Local Development
1. **Prerequisites**: Docker, Docker Compose, Node.js 18+
2. Clone repository
3. Copy `.env.example` to `.env` in both `backend/` and `frontend/` directories
4. Fill in required environment variables
5. Start services:
   ```bash
   docker-compose up -d
   ```
6. Initialize database:
   ```bash
   cd backend
   npx prisma generate
   npx prisma migrate deploy
   npx tsx tests/seed.ts
   ```
7. Access application: http://localhost:5173

### Production Deployment
1. Ensure all environment variables are set in HashiCorp Vault
2. Pull latest Docker images:
   ```bash
   docker-compose pull
   ```
3. Start services:
   ```bash
   docker-compose up -d
   ```
4. Run database migrations:
   ```bash
   cd backend
   npx prisma migrate deploy
   ```
5. Verify health checks:
   - Backend: http://localhost:3001/health
   - Frontend: http://localhost (should load application)

## Shutdown Procedures

### Graceful Shutdown
1. Stop Docker services:
   ```bash
   docker-compose down
   ```
2. This will:
   - Stop all containers
   - Preserve volumes (data persists)
   - Remove network definitions

### Emergency Shutdown
1. Force stop containers:
   ```bash
   docker-compose down --remove-orphans
   ```
2. If needed, prune unused resources:
   ```bash
   docker system prune -af --volumes
   ```

## Scaling Procedures

### Horizontal Scaling (Backend)
1. The backend is stateless and can be scaled horizontally
2. Update docker-compose.yml to increase replica count:
   ```yaml
   backend:
     deploy:
       replicas: 3
   ```
3. Ensure sticky sessions are disabled (JWT-based auth doesn't require sticky sessions)
4. Update load balancer/reverse proxy configuration

### Vertical Scaling
1. Increase resource allocation in docker-compose.yml:
   ```yaml
   backend:
     deploy:
       resources:
         limits:
           cpus: "2.0"
           memory: 2G
         reservations:
           cpus: "1.0"
           memory: 1G
   ```

## Database Procedures

### Migrations
1. Create new migration:
   ```bash
   cd backend
   npx prisma migrate dev --name migration-name
   ```
2. Apply migrations to production:
   ```bash
   npx prisma migrate deploy
   ```

### Backup & Restore
1. **Backup** (using pg_dump):
   ```bash
   pg_dump -h [host] -U postgres -d traceit > backup_$(date +%Y%m%d).sql
   ```
2. **Restore**:
   ```bash
   psql -h [host] -U postgres -d traceit < backup_[date].sql
   ```

### Connection Pool Monitoring
1. Check PostgreSQL connections:
   ```sql
   SELECT count(*) FROM pg_stat_activity;
   ```
2. Monitor for idle connections that may indicate connection leaks

## Monitoring & Logging

### Health Checks
- **Backend**: `GET /api/health` (returns 200 if service is healthy)
- **Frontend**: `GET /health` (returns "healthy" if nginx is serving)
- **Database**: `docker-compose exec postgres pg_isready`
- **Redis**: `docker-compose exec redis redis-cli ping`

### Log Access
1. **Application Logs**:
   ```bash
   docker-compose logs -f backend
   docker-compose logs -f frontend
   ```
2. **Database Logs**:
   ```bash
   docker-compose logs -f postgres
   ```
3. **Elasticsearch/Kibana** (if configured):
   - Access Kibana at http://localhost:5601
   - Index pattern: `traceit-*`
   - Common fields: `service`, `level`, `message`, `traceId`

### Metrics Collection
- **Prometheus** (if enabled):
  - Backend metrics: http://localhost:3001/metrics
  - Redis metrics: Available via redis-exporter
  - PostgreSQL metrics: Available via postgres-exporter

## Incident Response

### Common Issues & Resolution

#### 1. Database Connection Failures
**Symptoms**: 500 errors, timeout messages in logs
**Steps**:
1. Check PostgreSQL health: `docker-compose exec postgres pg_isready`
2. Verify connection strings in .env
3. Check if Supabase project is paused (for hosted DB)
4. Restart database service: `docker-compose restart postgres`
5. Check connection count: `SELECT count(*) FROM pg_stat_activity;`

#### 2. Redis Connection Issues
**Symptoms**: Rate limiting failures, session storage errors
**Steps**:
1. Check Redis health: `docker-compose exec redis redis-cli ping`
2. Verify Redis is responding: `docker-compose exec redis redis-cli info`
3. Restart Redis: `docker-compose restart redis`
4. Check memory usage: `docker-compose exec redis redis-cli info memory`

#### 3. Storage Service Failures
**Symptoms**: Document upload/download failures
**Steps**:
1. Verify Backblaze B2 credentials
2. Check bucket exists and is accessible
3. Test API connectivity with B2 CLI/SDK
4. Check storage service logs: `docker-compose logs -f backend | grep storage`

#### 4. Authentication Failures
**Symptoms**: Users cannot login, invalid token errors
**Steps**:
1. Verify JWT secrets are consistent across services
2. Check token expiration settings
3. Verify cookie security flags (if using cookies)
4. Check auth service logs: `docker-compose logs -f backend | grep auth`

#### 5. Webhook Processing Issues
**Symptoms**: Donations not updating status after payment
**Steps**:
1. Check webhook endpoint logs
2. Verify Razorpay signature validation
3. Check if webhook endpoint is publicly accessible
4. Verify idempotency protection is working correctly
5. Check blockchain service if enabled

### Escalation Procedures
1. **Level 1 (DevOps)**: Basic service restarts, log checks, configuration verification
2. **Level 2 (Backend Engineer)**: Database issues, API bugs, integration failures
3. **Level 3 (Architecture)**: System-wide performance issues, security incidents, major outages

## Security Procedures

### Secret Rotation
1. **JWT Secrets**:
   - Update JWT_ACCESS_SECRET and JWT_REFRESH_SECRET in Vault
   - Rolling restart of backend services
   - Existing tokens will expire naturally
2. **API Keys** (Razorpay, SendGrid, etc.):
   - Update in Vault
   - Rolling restart of affected services
3. **Database Passwords**:
   - Requires database user password update
   - Update connection strings in Vault
   - Rolling restart of backend

### Incident Response
1. **Suspected Breach**:
   - Isolate affected services
   - Collect logs and audit trails
   - Rotate all secrets immediately
   - Notify security team
   - Engage forensic analysis if needed

2. **Data Leak**:
   - Identify source of leak
   - Implement temporary fixes
   - Rotate exposed credentials
   - Notify affected parties per compliance requirements
   - File required regulatory reports

## Compliance Procedures

### Data Retention
1. **Donation Records**: Retained for 7 years (tax compliance)
2. **Audit Logs**: Retained for 7 years (regulatory compliance)
3. **Personal Data**: Deleted upon user request (GDPR/CCPA)
4. **Document Storage**: Retained per document type and legal requirements

### Audit Logging
1. All API requests are logged with:
   - Request ID
   - User ID (if authenticated)
   - IP address
   - Timestamp
   - Action performed
   - Outcome (success/failure)
2. Audit logs are stored in:
   - PostgreSQL audit_logs table
   - Elasticsearch for search and analysis
   - Archived to cold storage monthly

## Disaster Recovery

### Backup Strategy
1. **Database**: Daily automated backups to object storage
2. **Object Storage**: Versioning enabled in Backblaze B2
3. **Configuration**: Infrastructure as Code (docker-compose, Vault policies)
4. **Secrets**: Managed in HashiCorp Vault with audit logging

### Recovery Time Objectives (RTO)
- **Tier 1 Services** (API, Web): < 30 minutes
- **Tier 2 Services** (Analytics, Reporting): < 4 hours
- **Tier 3 Services** (Backups, Archives): < 24 hours

### Recovery Point Objectives (RPO)
- **Database**: < 1 hour (transaction log shipping)
- **Object Storage**: < 15 minutes (versioning)
- **Configuration**: Real-time (Git-based)

### DR Test Procedures
1. Quarterly failover drills
2. Annual full-scale disaster recovery test
3. Monthly backup restore verification
4. Bi-annual security incident response tabletop

## Performance Tuning

### Database Optimization
1. **Connection Pooling**:
   - Use PgBouncer (already configured via Supabase)
   - Monitor pool utilization
   - Adjust min/max connections based on load
2. **Query Optimization**:
   - Use EXPLAIN ANALYZE for slow queries
   - Add indexes on frequently queried columns
   - Consider partitioning large tables (donations, audit_logs)
3. **Vacuum Maintenance**:
   - Enable autovacuum
   - Monitor bloat with pgstattuple

### Application Optimization
1. **Caching**:
   - Redis for session storage and rate limiting
   - Consider HTTP caching for public endpoints
   - Cache frequently accessed reference data
2. **Asset Optimization**:
   - Frontend: Code splitting, lazy loading
   - Images: Optimized and served via CDN
   - CSS/JS: Minified and bundled
3. **Load Balancing**:
   - Sticky sessions not required (JWT auth)
   - Health checks for automatic failover
   - Rate limiting at ingress level

## Troubleshooting Commands

### Docker & Containers
```bash
# List running containers
docker-compose ps

# View logs for a service
docker-compose logs -f [service-name]

# Execute command in container
docker-compose exec [service-name] [command]

# Check container resource usage
docker-compose top
docker-compose stats

# Rebuild and restart service
docker-compose up -d --build [service-name]
```

### Database
```bash
# Execute SQL query
docker-compose exec postgres psql -U postgres -d traceit -c "[SQL query]"

# Check database size
docker-compose exec postgres psql -U postgres -d traceit -c "SELECT pg_database_size('traceit');"

# Check table sizes
docker-compose exec postgres psql -U postgres -d traceit -c "SELECT pg_size_pretty(pg_total_relation_size('tablename')) FROM pg_tables WHERE schemaname = 'public';"

# Check for locks
docker-compose exec postgres psql -U postgres -d traceit -c "SELECT * FROM pg_locks WHERE NOT granted;"
```

### Network
```bash
# Check container network
docker-compose exec [service-name] ip addr show

# Test connectivity to service
docker-compose exec [service-name] curl -s [endpoint]:[port]/health

# Check DNS resolution
docker-compose exec [service-name] getent hosts [hostname]
```

### Application Specific
```bash
# Check backend health
curl -s http://localhost:3001/health

# Check frontend health
curl -s http://localhost/health

# Check API documentation (if enabled)
curl -s http://localhost:3001/api/docs

# Check Prisma studio (if enabled)
# Access via npx prisma studio in backend directory
```

## Contact Information

### Primary Contacts
- **Platform Engineering**: [email/phone]
- **Backend Team**: [email/phone]
- **Frontend Team**: [email/phone]
- **DevOps/SRE**: [email/phone]
- **Security Team**: [email/phone]

### External Services
- **Supabase (PostgreSQL)**: [support link/phone]
- **Backblaze B2**: [support link/phone]
- **HashiCorp Vault**: [support link/phone]
- **SendGrid**: [support link/phone]
- **Razorpay**: [support link/phone]
- **Cloudflare**: [support link/phone]

## Change Management

### Deployment Process
1. Code changes submitted via pull request
2. CI pipeline runs tests and security scans
3. Code reviewed and approved by at least two engineers
4. Changes merged to main branch
5. CD pipeline automatically deploys to staging
6. Smoke tests run against staging
7. Manual approval required for production deployment
8. Blue/green or rolling deployment strategy used
9. Post-deployment validation checks performed

### Rollback Procedure
1. Identify problematic deployment
2. Trigger rollback in CI/CD system
3. Previous Docker image version redeployed
4. Database migrations are forward-only; data rollbacks require backup restore
5. Verify system health after rollback
6. Conduct post-mortem analysis

## Appendix

### Glossary
- **CI/CD**: Continuous Integration/Continuous Deployment
- **DR**: Disaster Recovery
- **RTO**: Recovery Time Objective
- **RPO**: Recovery Point Objective
- **SLA**: Service Level Agreement
- **SLO**: Service Level Objective
- **SIEM**: Security Information and Event Management
- **WAF**: Web Application Firewall
- **IDOR**: Insecure Direct Object Reference
- **OWASP**: Open Web Application Security Project

### Useful Links
- **Source Code**: [repository URL]
- **Documentation**: [documentation URL]
- **Monitoring**: [monitoring dashboard URL]
- **Logs**: [log aggregation URL]
- **Status Page**: [status page URL]

### Revision History
| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-08-19 | Initial creation | DevB Team |