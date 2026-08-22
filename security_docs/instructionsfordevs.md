# Trace-It Developer Local Setup

## 1. Normal Backend Development

Most Trace-It developers do NOT need to run Elasticsearch or Kibana for ordinary backend development.

The minimum local environment for backend development includes:

- **Required runtime**: Node.js (v20+ recommended) and npm or yarn
- **Required database/services**: 
  - PostgreSQL (local instance or Supabase)
  - The backend uses Prisma ORM to connect to PostgreSQL via DATABASE_URL
- **Required environment variables** (set in backend/.env):
  - DATABASE_URL (PostgreSQL connection string)
  - SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (for Supabase integration)
  - JWT_ACCESS_SECRET and JWT_REFRESH_SECRET (for authentication)
  - RAZORPAY_WEBHOOK_SECRET (for payment webhooks)
  - Optional: KYC_HMAC_KEY, BLOCKCHAIN_HMAC_SECRET, RAZORPAY_KEY_SECRET, AES_DOCUMENT_KEY, B2_* (for specific integrations)

**How to start the backend for normal development**:
1. Copy `.env.example` to `.env` and fill in required values (DATABASE_URL, secrets)
2. Ensure PostgreSQL is running (local or Supabase)
3. Run `npm install` in the backend directory
4. Run `npx prisma generate` to generate Prisma client
5. Run `npm run dev` to start the development server

**How to verify the API is running**:
- The API should be accessible at http://localhost:3000
- Health check endpoint: GET http://localhost:3000/api/health (if implemented) or test auth endpoints

**The normal developer workflow does NOT require**:
- Elasticsearch
- Kibana
- SIEM detection rules
- Security dashboards
unless the developer is specifically working on security telemetry or SIEM functionality.

## 2. Optional: Trace-It SIEM Development Environment

**Note**: Elasticsearch and Kibana are OPTIONAL development dependencies used for security telemetry, SIEM dashboards, detection rules, and security investigation. They are not required for ordinary Trace-It backend development.

Use the SIEM environment when:
- Working on security/audit logging (writeAuditLog usage)
- Working on Winston → Elasticsearch ingestion
- Working on Kibana dashboards
- Working on detection rules
- Working on alert validation
- Investigating security telemetry

If none of these apply, developers can ignore the SIEM setup.

## 3. SIEM Prerequisites

Docker and Docker Compose are required only for the optional SIEM environment.
Verify:
```bash
docker --version
docker compose version
```

## 4. Create the Local SIEM Environment

The repository provides a Docker Compose configuration for the SIEM stack at:
`traceit-siem/docker-compose.yml`

To start the local SIEM environment:
```bash
cd traceit-siem
docker compose up -d
```

Check status:
```bash
docker compose ps
```

Elasticsearch and Kibana run in local Docker containers. Their data and state are local to the developer's machine.

### Local Credentials and Encryption Keys

The SIEM uses local credentials and persistent Kibana encryption keys.

Create a local `.env` file in the `traceit-siem` directory. Do NOT commit this file.

Generate an Elasticsearch password by running:

```bash
docker exec -it traceit-elasticsearch bin/elasticsearch-reset-password -u elastic -i
````

Use the password generated/set here when logging into Kibana:

```text
Username: elastic
Password: <your-local-password>
```

Generate three persistent encryption keys:

```bash
openssl rand -hex 32
```

Run the command three times and use the three generated values for:

```env
KIBANA_ENCRYPTED_SAVED_OBJECTS_KEY=<generated-key-1>
KIBANA_SECURITY_KEY=<generated-key-2>
KIBANA_REPORTING_KEY=<generated-key-3>
```

The exact environment variable names must match those referenced by
`docker-compose.yml`.

The encryption keys must remain unchanged for the lifetime of the local
Kibana data. Changing them later can make existing encrypted Kibana saved
objects inaccessible.

### First-Time Startup

For a new local SIEM environment, start Elasticsearch first:

```bash
docker compose up -d elasticsearch
```

Wait for Elasticsearch to become healthy:

```bash
docker compose ps
```

Then start Kibana:

```bash
docker compose up -d kibana
```

Check both services:

```bash
docker compose ps
```

Kibana should then be available at:

```text
http://localhost:5601
```

Log in using:

```text
Username: elastic
Password: <your-local-password>
```

After the initial setup, both services can normally be started together:

```bash
docker compose up -d
```

**Important:** `ELASTIC_PASSWORD` only initializes the `elastic` user's
password when Elasticsearch is initialized for the first time. Changing
the value later does not change the password stored in an existing
Elasticsearch data volume. Use `elasticsearch-reset-password` when
changing the password for an existing local environment.

**Do not run `docker compose down -v` unless you intentionally want to
delete the local Elasticsearch/Kibana data and start the SIEM from a
completely fresh state.**


**Important**: 
- Another developer's Elasticsearch indices, Kibana dashboards, saved objects, detection rules, alerts, or Docker volumes are NOT automatically shared.
- The repository does not contain exported Kibana objects or infrastructure-as-code for the SIEM configuration, so the SIEM state may need to be recreated by each developer.

## 5. Elasticsearch

The local development configuration uses Elasticsearch with security enabled (as seen in `traceit-siem/docker-compose.yml`):
- Authentication: username `kibana_system` (for Kibana) and `elastic` (for backend) with password `<password-here>`
- Security is enabled (`xpack.security.enabled=true`)

**Expected Elasticsearch URL**: 
http://localhost:9200

**Health check** (note: authentication required for secured instance):
```bash
curl -u elastic:<password> http://localhost:9200/_cluster/health
```

## 6. Trace-It Backend → Elasticsearch

The backend uses the environment variable `ELASTICSEARCH_URL` to connect to Elasticsearch.

- **Where the variable belongs**: In the backend's `.env` file (only when using SIEM)
- **For local development**: Set `ELASTICSEARCH_URL=http://localhost:9200`
- **Do not add to `.env.test`** unless Elasticsearch integration testing is intentionally required
- **`.env.example`** should contain variable names/placeholders only (no credentials)
- **Credentials must never be committed** to version control

The backend can run normally when the optional SIEM environment is not being used because the Winston logger conditionally sends logs to Elasticsearch only when `ELASTICSEARCH_URL` is set.

## 7. Kibana

**Expected local address**: 
http://localhost:5601

Kibana is only required for SIEM work.

**Current data view** (to be created in Kibana):
- Name: Trace-It Logs
- Index pattern: `traceit-logs*`
- Timestamp field: `@timestamp`

Do not instruct ordinary developers to create the data view unless they are working on SIEM functionality.

## 8. Verify Telemetry (for SIEM developers)

To verify that telemetry reaches Elasticsearch:
1. Generate a normal API request (e.g., `GET http://localhost:3000/api/health` or auth endpoint)
2. Check Elasticsearch for traceit-logs index:
```bash
curl -u elastic:TraceIt@2026 "http://localhost:9200/traceit-logs-*/_search?size=5&sort=@timestamp:desc"
```

Request telemetry may contain fields such as:
- `@timestamp` (timestamp)
- `host.hostname` (hostname)
- `url.path` (request path)
- `url.scheme` and `url.domain`
- `http.request.method`
- `http.response.status_code`
- `source.ip` and `destination.ip`
- `user.id` (if authenticated)
- `trace.id` or `request.id` (if X-Request-ID is propagated)

## 9. Security Event Verification

Developers working on security telemetry can verify events such as `LOGIN_FAILED`:

Event flow:
Trace-It API
    ↓
writeAuditLog()
    ↓
Winston
    ↓
winston-elasticsearch
    ↓
Elasticsearch
    ↓
Kibana Discover

Example: To verify a `LOGIN_FAILED` event:
1. Generate a failed login request (invalid credentials to POST /api/auth/login)
2. Search in Elasticsearch:
```bash
curl -u elastic:TraceIt@2026 "http://localhost:9200/traceit-logs-*/_search?q=eventType:LOGIN_FAILED&sort=@timestamp:desc"
```

## 10. SIEM Detection Rules

Detection rules are part of the optional security environment.

**Validated rules**:

Trace-It - Brute Force Login Detection
- Query: `fields.eventType: "LOGIN_FAILED"`
- Threshold: 5
- Group by: `fields.ip.keyword`
- Window: 5 minutes
- Severity: High
- Risk score: 70

Trace-It - Unauthorized Access Detection
- Query: `fields.statusCode: 401 OR fields.statusCode: 403`
- Threshold: 5
- Group by: `fields.ip.keyword`
- Window: 5 minutes
- Severity: Medium
- Risk score: 50

These are Kibana Detection Engine configurations and are NOT required for normal backend development.

**Note**: Rules execute periodically (every 5 minutes for these rules), so alerts are not necessarily instantaneous.

## 11. SIEM Validation

The validated security flow:
Trace-It API
    ↓
Security Event
    ↓
Winston
    ↓
Elasticsearch
    ↓
Kibana Detection Rule
    ↓
Alert
    ↓
Investigation

Brute-force and unauthorized-access detections have been successfully validated in the local SIEM environment.

## 12. X-Request-ID Correlation

Request-level X-Request-ID correlation has been validated.

Example:
- Request with header: `X-Request-ID: example-request-id-123`
- The request telemetry can be located in Elasticsearch/Kibana using the request ID field

**Do not claim** that every security event carries the request ID unless the repository proves this. Only events processed through `writeAuditLog()` with the `requestId` parameter will contain it.

## 13. Troubleshooting

**Elasticsearch unavailable**
- Symptoms: backend cannot connect to Elasticsearch, connection refused, logs not indexed
- Checks:
  ```bash
  cd traceit-siem
  docker compose ps   # Verify Elasticsearch container is healthy
  docker compose logs elasticsearch
  ```
- Health check: `curl -u elastic:TraceIt@2026 http://localhost:9200/_cluster/health`

**Kibana unavailable**
- Checks:
  ```bash
  cd traceit-siem
  docker compose ps   # Verify Kibana container is healthy
  docker compose logs kibana
  ```

**Elasticsearch mapping does not contain a newly added security field**
- Explanation: Elasticsearch dynamic mappings may only contain fields after the first document containing that field has been indexed.
- Recommended approach:
  1. Generate a real event that includes the new field
  2. Verify the event in Elasticsearch
  3. Inspect the mapping: `curl -u elastic:TraceIt@2026 http://localhost:9200/traceit-logs-*/_mapping`
  4. Refresh Kibana/Discover to see the new field
- Do NOT manually modify mappings unless the project explicitly requires it.

**Rule does not immediately generate an alert**
- Explanation: Detection Engine rules run according to their configured schedule.
- For the current rules, the schedule is: Every 5 minutes
- The detection window (e.g., 5 minutes) and execution schedule are separate concepts.

## 14. Local SIEM Data Is Not Shared

**Warning**: Elasticsearch indices, Docker volumes, Kibana saved objects, dashboards, alerts, and detection rules stored in a developer's local Docker environment are local to that environment unless explicitly exported or shared.

Cloning the Trace-It repository does NOT automatically provide another developer with the existing local SIEM data.

## 15. Production Warning

**Strong warning**: The local Docker SIEM configuration is for development/testing only. Do not expose local Elasticsearch or Kibana directly to the public internet. Production deployments require appropriate authentication, authorization, encryption, network restrictions, secret management, retention policies, backups, and monitoring.

Do not state that security is disabled unless the actual current configuration confirms it (it is enabled in the local Docker Compose).

## 16. Quick Decision Guide

| I am working on...               | Need SIEM? |
|----------------------------------|------------|
| Normal frontend/backend development | No         |
| API feature development          | Usually no |
| Database/application logic       | No         |
| Security/audit logging           | Yes        |
| Winston → Elasticsearch          | Yes        |
| Kibana dashboards                | Yes        |
| Detection rules                  | Yes        |
| Security alerts                  | Yes        |
| SIEM investigation               | Yes        |

## 17. Final Local Architecture

**NORMAL DEVELOPMENT**
```
Developer
   ↓
Trace-It API
   ↓
Application dependencies (PostgreSQL, etc.)
```

**OPTIONAL SECURITY DEVELOPMENT**
```
Developer
   ↓
Trace-It API
   ↓
Winston
   ↓
Elasticsearch
   ↓
Kibana
   ↓
Detection Engine
   ↓
Security Alerts
```