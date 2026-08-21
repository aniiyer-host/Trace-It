# Trace-It Backend – SIEM & Security Operations Implementation Plan

## 1. Objective

This document defines the implementation plan for the cybersecurity and Security Operations (SecOps) work associated with the Trace-It backend.

The backend application has already been instrumented by Dev A with structured logging, security events, request tracing, and Elasticsearch transport support. The objective of this work is to build and validate the security monitoring pipeline around those capabilities.

### Scope

This work covers:

* Elasticsearch and Kibana setup
* Backend log ingestion
* Security monitoring dashboards
* SIEM detection and alerting
* Security event validation
* Log retention and lifecycle management
* Documentation of the monitoring architecture

### Out of Scope

The following are handled separately:

* Backend application development
* CI/CD
* Dockerization
* Load testing
* Production server deployment
* WAF implementation

---

# Phase 1 – Elasticsearch & Kibana Setup

## Objective

Establish a secure Elasticsearch and Kibana environment capable of receiving and visualizing Trace-It backend logs.

## Tasks

### Elasticsearch

* [ ] Select deployment approach: local/self-hosted/managed
* [ ] Provision Elasticsearch
* [ ] Configure authentication and access control
* [ ] Configure network access restrictions
* [ ] Verify Elasticsearch health
* [ ] Create appropriate index/data-stream structure
* [ ] Configure index lifecycle management (ILM)
* [ ] Define an appropriate log retention policy
* [ ] Review compliance requirements related to audit-log retention

### Kibana

* [ ] Provision Kibana
* [ ] Connect Kibana to Elasticsearch
* [ ] Configure authentication
* [ ] Verify Elasticsearch connectivity
* [ ] Create the required data view/index pattern
* [ ] Confirm that logs can be searched and visualized

### Backend Configuration

Obtain the Elasticsearch endpoint and configure:

```env
ELASTICSEARCH_NODE=<elasticsearch-endpoint>
```

Do not commit credentials or sensitive connection information to source control.

## Validation

The following should be verified:

* [ ] Elasticsearch is healthy
* [ ] Kibana can communicate with Elasticsearch
* [ ] Backend can communicate with Elasticsearch
* [ ] Authentication/access controls work as expected
* [ ] A test backend request produces a log entry
* [ ] The log entry is searchable in Kibana

## Deliverable

A working:

```text
Trace-It Backend
        ↓
     Winston
        ↓
 Elasticsearch
        ↓
      Kibana
```

pipeline.

---

# Phase 2 – Backend Log Ingestion & Validation

## Objective

Verify that the security telemetry already implemented by Dev A is correctly reaching Elasticsearch and retaining the expected fields.

## Existing Backend Telemetry

The backend generates structured JSON logs containing fields such as:

```text
requestId
method
path
statusCode
durationMs
userId
ip
```

The application also emits security events including:

```text
LOGIN_FAILED
LOGIN_SUCCESS
AML_FLAG_RAISED
UNAUTHORIZED_DOC_ACCESS
WEBHOOK_TAMPER_ATTEMPT
```

## Tasks

* [ ] Generate normal API requests
* [ ] Verify request logs are ingested
* [ ] Generate successful authentication events
* [ ] Generate failed authentication events
* [ ] Trigger an AML event in the test environment
* [ ] Trigger an unauthorized document access event
* [ ] Trigger a webhook tamper event where applicable
* [ ] Verify event fields in Elasticsearch
* [ ] Verify timestamps
* [ ] Verify IP addresses
* [ ] Verify request IDs
* [ ] Verify user identifiers where applicable
* [ ] Confirm sensitive information is not unnecessarily logged
* [ ] Confirm multiple logs belonging to the same request can be correlated using `requestId`

## Validation Tests

### Test 1 – Normal Request

Expected:

```text
HTTP request
    ↓
Winston log
    ↓
Elasticsearch document
```

### Test 2 – Failed Authentication

Expected:

```text
LOGIN_FAILED
    ↓
Elasticsearch
    ↓
Visible/searchable in Kibana
```

### Test 3 – Security Event

Repeat the process for:

```text
AML_FLAG_RAISED
UNAUTHORIZED_DOC_ACCESS
WEBHOOK_TAMPER_ATTEMPT
```

## Deliverable

A validated mapping between:

```text
Backend Event → Elasticsearch Document → Kibana Search
```

---

# Phase 3 – Security Monitoring Dashboard

## Objective

Create a centralized dashboard providing visibility into application health and security activity.

## Dashboard

Create a primary dashboard:

**Trace-It Security Operations Dashboard**

### Application Monitoring

* [ ] Requests per minute
* [ ] HTTP 4xx rate
* [ ] HTTP 5xx rate
* [ ] Average request latency
* [ ] Request volume over time

### Authentication Monitoring

* [ ] Successful login count
* [ ] Failed login count
* [ ] Failed authentication by IP
* [ ] Failed authentication over time
* [ ] Frequently failing IP addresses

### Security Events

Create panels for:

* [ ] `LOGIN_FAILED`
* [ ] `LOGIN_SUCCESS`
* [ ] `AML_FLAG_RAISED`
* [ ] `UNAUTHORIZED_DOC_ACCESS`
* [ ] `WEBHOOK_TAMPER_ATTEMPT`

### Traceability

Provide searchable visibility into:

* [ ] Request ID
* [ ] User ID
* [ ] IP address
* [ ] Endpoint/path
* [ ] HTTP method
* [ ] Status code
* [ ] Timestamp
* [ ] Security event type

## Validation

* [ ] Dashboard displays live/recent backend activity
* [ ] Security events appear in the correct panels
* [ ] Failed authentication can be traced to an IP
* [ ] Individual requests can be investigated using request ID
* [ ] Dashboard data matches the underlying Elasticsearch records

## Deliverable

A functional security monitoring dashboard suitable for demonstrating the Trace-It security monitoring capability.

---

# Phase 4 – SIEM Detection & Alerting

## Objective

Convert backend security telemetry into actionable security detections.

The goal is not only to collect logs, but to identify suspicious activity automatically.

---

## Detection 1 – Brute Force Authentication

### Rule

Trigger when:

```text
5 or more LOGIN_FAILED events
from the same IP
within 5 minutes
```

### Alert

Generate:

```text
BRUTE_FORCE_ATTEMPT
```

### Actions

* [ ] Configure detection rule
* [ ] Configure alert severity
* [ ] Configure notification mechanism
* [ ] Include source IP
* [ ] Include event count
* [ ] Include relevant timestamps
* [ ] Include request/user information where appropriate

### Validation

Intentionally generate five or more failed login attempts from the same test IP.

Expected:

```text
LOGIN_FAILED × 5+
        ↓
Detection Rule
        ↓
BRUTE_FORCE_ATTEMPT
        ↓
Alert
```

---

# Detection 2 – AML Monitoring

## Rule

Detect:

```text
AML_FLAG_RAISED
```

### Alert

Generate an immediate compliance/security alert.

### Tasks

* [ ] Create detection rule
* [ ] Assign appropriate severity
* [ ] Configure notification
* [ ] Include event metadata
* [ ] Validate alert generation

### Validation

Trigger the AML condition in a controlled test environment.

Expected:

```text
AML_FLAG_RAISED
        ↓
SIEM Detection
        ↓
Compliance Alert
```

---

# Detection 3 – Government Request Access

## Rule

Detect database activity involving:

```text
government_requests
```

### Tasks

* [ ] Determine how this activity is represented in the backend logs
* [ ] Create detection rule based on available telemetry
* [ ] Configure appropriate severity
* [ ] Record actor/request information
* [ ] Validate the detection

### Important

Do not create a detection rule based on assumptions about database logging.

First verify that the required event is actually emitted by the backend or available through the selected logging infrastructure.

If the necessary telemetry does not currently exist, document it as a telemetry gap rather than inventing an implementation.

---

# Detection 4 – Unauthorized Document Access

## Rule

Detect:

```text
UNAUTHORIZED_DOC_ACCESS
```

### Severity

High/Critical depending on the final security assessment.

### Tasks

* [ ] Create detection rule
* [ ] Configure notification
* [ ] Include user/request information
* [ ] Include document/resource information where appropriate
* [ ] Validate detection

### Validation

Generate a controlled unauthorized document access attempt.

Expected:

```text
UNAUTHORIZED_DOC_ACCESS
        ↓
SIEM Detection
        ↓
High-Priority Alert
```

---

# Phase 5 – Security Validation & Operationalization

## Objective

Validate the complete security monitoring pipeline and document the final SecOps architecture.

## End-to-End Validation

Test the complete flow:

```text
Trace-It API
      ↓
Security Event
      ↓
Winston
      ↓
Elasticsearch
      ↓
SIEM Detection
      ↓
Alert
      ↓
Security Investigation
```

## Test Scenarios

* [ ] Normal API request
* [ ] Successful login
* [ ] Failed login
* [ ] Brute-force simulation
* [ ] AML event
* [ ] Unauthorized document access
* [ ] Webhook tampering
* [ ] Government request access, where telemetry supports it
* [ ] Request correlation using `X-Request-ID`

## Alert Validation

For every detection:

* [ ] Event is generated
* [ ] Event reaches Elasticsearch
* [ ] SIEM rule detects it
* [ ] Alert is generated
* [ ] Alert contains sufficient context
* [ ] Alert severity is appropriate
* [ ] Alert can be investigated using the original logs

## False Positive Review

* [ ] Review detection thresholds
* [ ] Identify potential false positives
* [ ] Adjust rules where necessary
* [ ] Document detection assumptions
* [ ] Document known limitations

---

# Phase 6 – Documentation & Security Handoff

## Objective

Document the completed SecOps implementation so that the security architecture remains reproducible and auditable.

## Documentation

* [ ] Document Elasticsearch architecture
* [ ] Document Kibana configuration
* [ ] Document log ingestion pipeline
* [ ] Document dashboard structure
* [ ] Document detection rules
* [ ] Document alerting mechanisms
* [ ] Document retention/ILM configuration
* [ ] Document security testing performed
* [ ] Document known limitations
* [ ] Document unresolved telemetry gaps
* [ ] Update security architecture documentation
* [ ] Update threat model where new monitoring controls affect mitigations

## Evidence

Maintain evidence for:

* [ ] Elasticsearch receiving logs
* [ ] Kibana dashboards
* [ ] Detection rules
* [ ] Generated alerts
* [ ] Test events
* [ ] Request correlation
* [ ] Security event investigation

Screenshots and test results should be retained where appropriate for project demonstration and evaluation.

---

# Final Architecture

The completed SecOps architecture should provide:

```text
                    ┌─────────────────────┐
                    │   Trace-It Backend  │
                    └──────────┬──────────┘
                               │
                       Structured Logs
                               │
                               ▼
                    ┌─────────────────────┐
                    │       Winston       │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    Elasticsearch    │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
                    ▼                     ▼
             ┌─────────────┐      ┌─────────────┐
             │   Kibana    │      │ SIEM Rules  │
             │ Dashboards  │      │ & Detection │
             └─────────────┘      └──────┬──────┘
                                         │
                                         ▼
                                  ┌─────────────┐
                                  │   Alerts    │
                                  └─────────────┘
```

---

# Success Criteria

The SecOps implementation will be considered complete when:

* [ ] Backend logs are successfully ingested into Elasticsearch
* [ ] Logs can be searched and correlated using `requestId`
* [ ] Kibana provides application and security visibility
* [ ] Security events are visible in real time/recently
* [ ] Brute-force detection is operational and tested
* [ ] AML detection is operational and tested
* [ ] Unauthorized document access detection is operational and tested
* [ ] Government-request monitoring is implemented if sufficient telemetry exists
* [ ] Alerts contain enough context for investigation
* [ ] Log retention and lifecycle policies are documented
* [ ] Known limitations and telemetry gaps are documented
* [ ] End-to-end security monitoring has been demonstrated

---

# Current Status

| Phase | Component                  | Status      |
| ----- | -------------------------- | ----------- |
| 1     | Elasticsearch & Kibana     | Not Started |
| 2     | Log Ingestion & Validation | Not Started |
| 3     | Security Dashboard         | Not Started |
| 4     | SIEM Detection & Alerting  | Not Started |
| 5     | Security Validation        | Not Started |
| 6     | Documentation & Handoff    | Not Started |

Update this table as implementation progresses.

---

# Important Security Principles

1. **Do not claim a control is implemented until it has been verified.**
2. **Do not create detections for telemetry that the backend does not actually generate.**
3. **Do not store secrets or credentials in source control.**
4. **Do not unnecessarily expose sensitive user or donor information in dashboards or alerts.**
5. **Separate implementation from validation evidence.**
6. **Document security gaps instead of hiding them.**
7. **Use the SIEM to provide actionable detection, not merely centralized log storage.**
