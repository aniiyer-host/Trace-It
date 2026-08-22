# SecOps Implementation Documentation - Trace-It Project

## Objective
Implement end-to-end security monitoring and event correlation for the Trace-It application using Elasticsearch, Kibana, and Winston logging to detect and alert on security-relevant events such as brute force login attempts and unauthorized access patterns.

## End-to-End Validation Architecture
Trace-It API → Winston Logger (with winston-elasticsearch transport) → Elasticsearch (index: traceit-logs) → Kibana (data view: Trace-It Logs) → Detection Engine (Threshold rules) → Security Alerts → Investigation via Kibana Discover

## Test Scenarios Validation

| Test Scenario | Status | Notes |
|---|---|---|
| Normal API request | VALIDATED | Standard requests generate traceit-logs entries with @timestamp and request metadata |
| Successful login | VALIDATED | Generates LOGIN_SUCCESS event with actorType: USER, entityType: auth, email in metadata |
| Failed login | VALIDATED | Generates LOGIN_FAILED event with actorType: USER, entityType: auth, email and reason in metadata |
| Brute-force simulation | VALIDATED | 5+ LOGIN_FAILED events from same IP within 5 minutes triggered Detection Engine alert |
| AML event | VALIDATED | AML_FLAG_RAISED event generated when donation > 100,000 INR (webhook processor) |
| Unauthorized document access | VALIDATED | UNAUTHORIZED_DOC_ACCESS event generated via siem-event-test.ts |
| Webhook tampering | VALIDATED | WEBHOOK_TAMPER_ATTEMPT events generated for missing/invalid Razorpay signatures |
| Government request access | NOT IMPLEMENTED | No telemetry found for govRequestId usage in audit logs |
| X-Request-ID correlation | VALIDATED | Custom X-Request-ID headers propagated to audit logs and searchable in Elasticsearch |

## Detection Validation
Two Kibana Threshold detection rules were successfully implemented and tested:

### Rule 1: Trace-It - Brute Force Login Detection
- **Query**: `fields.eventType: "LOGIN_FAILED"`
- **Threshold**: 5
- **Group by**: `fields.ip.keyword`
- **Time window**: 5 minutes
- **Severity**: High
- **Risk score**: 70
- **Schedule**: Every 5 minutes
- **Validation**: Successfully tested by generating repeated failed login attempts from same IP. Kibana generated alert with High severity and risk score 70.

### Rule 2: Trace-It - Unauthorized Access Detection
- **Query**: `fields.statusCode: 401 OR fields.statusCode: 403`
- **Threshold**: 5
- **Group by**: `fields.ip.keyword`
- **Time window**: 5 minutes
- **Severity**: Medium
- **Risk score**: 50
- **Schedule**: Every 5 minutes
- **Validation**: Successfully tested and Kibana generated alert.

## Alert Validation
Each confirmed detection was validated through this chain:
Event generated → Event indexed in Elasticsearch → Kibana detection rule executed → Alert created → Original event available for investigation

| Detection | Event Generated | Elasticsearch | Rule Detection | Alert | Investigation |
|---|---|---|---|---|---|
| Brute Force Login | LOGIN_FAILED (5x from ::1) | Documents found with eventType:LOGIN_FAILED, ip::1 | Rule triggered after 5th event | Alert created in Kibana | Original events visible in Discover |
| Unauthorized Access | Multiple 401/403 responses | Documents with statusCode:401/403 | Rule triggered after 5th event | Alert created in Kibana | Original events visible in Discover |

## Investigation Workflow
1. Security analyst receives alert notification in Kibana
2. Analyst navigates to Detect > Alerts > Trace-It - [Rule Name]
3. Clicks "View events" to see underlying Elasticsearch documents
4. Analyst examines event details: @timestamp, fields.ip, fields.eventType, fields.metadata
5. For login events: checks fields.metadata.email and fields.metadata.reason
6. Correlates with other events using X-Request-ID if needed
7. Takes appropriate action based on investigation findings

## X-Request-ID Correlation
Validated through manual testing:
- Request generated with header: `X-Request-ID: siem-correlation-test-001`
- Resulting audit log contained requestId: siem-correlation-test-001
- Event searchable in Kibana Discover using requestId field
- Proves request-level correlation is implemented for security events

Note: Not all security events automatically propagate X-Request-ID - only those processed through writeAuditLog() with requestId parameter.

## False Positive Review
### Brute Force Detection
- **Potential false positive**: Legitimate user repeatedly enters incorrect credentials (e.g., forgotten password)
- **Threshold assumption**: 5 failed attempts from same IP within 5 minutes
- **Tuning guidance**: Adjust threshold based on production traffic patterns and user behavior

### Unauthorized Access Detection
- **Potential false positive**: Legitimate client receives 401/403 due to expired tokens, permission changes, or session issues
- **Threshold assumption**: 5 unauthorized responses from same IP within 5 minutes
- **Tuning guidance**: Monitor rule performance and adjust threshold/grouping as needed

## Detection Assumptions
1. Detection rules execute every 5 minutes (near real-time but not instantaneous)
2. Threshold values are initial detection values requiring production tuning
3. Rules group by source IP.keyword for basic anomaly detection
4. Local development traffic may appear as ::1 (localhost IPv6)
5. Detection quality directly correlates with telemetry quality and completeness

## Known Limitations
- Detection rules execute every 5 minutes (introduces delay)
- Threshold rules are intentionally simple baseline detectors
- Current rules group only by source IP (may miss distributed attacks)
- Local Docker environment shows ::1 for localhost traffic
- No external notification actions currently configured (alerts only in Kibana)
- Detection effectiveness depends on consistent, high-quality telemetry
- Some security scenarios lack dedicated telemetry (e.g., government requests)
- Kibana/Elasticsearch state is local to developer's Docker unless exported
- Detection rules/dashboards require recreation in other environments unless exported as code

## Telemetry Gaps
- **Government request access**: govRequestId field defined in AuditLogParams but no usage found in codebase
- **Successful blockchain transactions**: While BLOCKCHAIN_RECORD_SUCCESS exists, no specific detection rule created
- **Admin privilege escalation**: No specific events for role changes or admin actions
- **Data exfiltration**: No telemetry for bulk data access patterns

## Security Architecture
```
Trace-It API
    │
    ├── Request telemetry (via requestIdMiddleware)
    │
    └── Security events
             │
             ▼
        writeAuditLog()
             │
             ▼
          Winston Logger
             │
             ▼
   winston-elasticsearch transport
             │
             ▼
       Elasticsearch (traceit-logs index)
             │
             ▼
          Kibana
       ┌─────┴─────┐
       │           │
   Discover    Detection Engine
                   │
                   ▼
                 Alert
                   │
                   ▼
             Investigation
```

## Threat Model Implications
**Improved detection/visibility for:**
- **Credential brute force**: Detected via repeated LOGIN_FAILED events
- **Unauthorized access attempts**: Detected via 401/403 response clustering
- **Security-event visibility**: All authentication and authorization events now searchable
- **Investigation/correlation**: X-Request-ID enables request tracing across services
- **Webhook tampering**: Invalid signature attempts generate audit events

**Detection limitations:**
- Does NOT prevent attacks (detective control only)
- Limited to events routed through writeAuditLog()
- Dependence on rule tuning for production effectiveness
- Baseline thresholds may generate noise without tuning

## Operational Handoff Procedure
1. Start Elasticsearch: `docker-compose -f traceit-siem/docker-compose.yml up -d elasticsearch`
2. Start Kibana: `docker-compose -f traceit-siem/docker-compose.yml up -d kibana`
3. Verify Elasticsearch health: `curl -u elastic:TraceIt@2026 http://localhost:9200/_cluster/health`
4. Start Trace-It API: `npm run dev` (from backend directory) with ELASTICSEARCH_* env vars set
5. Verify connectivity: Check Elasticsearch logs for successful connections from Trace-It
6. Create Kibana data view: 
   - Name: Trace-It Logs
   - Index pattern: traceit-logs*
   - Timestamp field: @timestamp
7. Generate test event: Hit auth endpoint with invalid credentials
8. Verify event in Discover: Search for `eventType:LOGIN_FAILED`
9. Configure detection rules as specified above (Stack Management > Rules)
10. Generate test traffic: Produce 5+ failed logins from same IP
11. Wait for rule execution: Maximum 5 minutes + rule interval
12. Verify alert: Check Detect > Alerts for rule-triggered notifications
13. Investigate: Use "View events" on alert to examine underlying documents

## Final Status
- Security telemetry ingestion: COMPLETE ( Winston → Elasticsearch)
- Elasticsearch integration: COMPLETE (traceit-logs index receiving documents)
- Kibana integration: COMPLETE (data view, Discover search functional)
- Detection Engine: COMPLETE (2 threshold rules configured and tested)
- Brute-force detection: COMPLETE / VALIDATED (rule tested and alerted)
- Unauthorized-access detection: COMPLETE / VALIDATED (rule tested and alerted)
- X-Request-ID request correlation: COMPLETE / VALIDATED (header propagated and searchable)
- Remaining application-specific test scenarios:
  - Normal API request: VALIDATED
  - Successful login: VALIDATED
  - Failed login: VALIDATED
  - Brute-force simulation: VALIDATED
  - AML event: VALIDATED
  - Unauthorized document access: VALIDATED
  - Webhook tampering: VALIDATED
  - Government request access: NOT IMPLEMENTED
- Documentation/handoff: COMPLETE (this document)