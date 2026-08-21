# Trace-It SIEM – Current Implementation Update

## Current Objective

Set up and validate the local Security Operations / SIEM infrastructure for the Trace-It backend, based on the cybersecurity handoff from Dev A.

The current focus is establishing:

```text
Trace-It Backend
      ↓
   Winston
      ↓
winston-elasticsearch
      ↓
 Elasticsearch
      ↓
    Kibana
```

The backend application itself is not currently being modified as part of the SIEM setup.

---

# Implementation Status

| Component                         | Status         | Notes                                          |
| --------------------------------- | -------------- | ---------------------------------------------- |
| Elasticsearch                     | ✅ Complete     | Running locally through Docker                 |
| Kibana                            | ✅ Complete     | Running locally and accessible                 |
| `ELASTICSEARCH_NODE`              | ✅ Configured   | Points to local Elasticsearch                  |
| `winston-elasticsearch`           | ✅ Available    | Existing dependency restored in `node_modules` |
| Winston → Elasticsearch transport | ✅ Validated    | Successfully sent a test event                 |
| `traceit-logs-*` index            | ✅ Validated    | Elasticsearch created the date-based index     |
| Elasticsearch document            | ✅ Validated    | Test event successfully retrieved              |
| Kibana Data View                  | ✅ Complete     | `traceit-logs-*` configured with `@timestamp`  |
| Kibana Discover                   | ✅ Complete     | Test event successfully visible                |
| Security dashboard                | 🔄 In Progress | Initial dashboard work started                 |
| Real backend telemetry            | ⏳ Pending      | Waiting for backend to be operational          |
| Security monitoring panels        | ⏳ Pending      | Requires real backend fields/events            |
| SIEM detection rules              | ⏳ Pending      | Requires validated real security telemetry     |
| Alerting                          | ⏳ Pending      | To be configured after detections              |
| Production hardening              | ⏳ Pending      | Current setup is local development only        |

---

# Elasticsearch & Kibana Environment

The current local environment uses:

* Elasticsearch `8.19.2`
* Kibana `8.19.2`
* Docker Compose
* Elasticsearch HTTP endpoint: `http://localhost:9200`
* Kibana: `http://localhost:5601`

The local Elasticsearch configuration currently has security disabled for development convenience.

**This configuration must not be treated as production-ready.**

---

# Log Ingestion Validation

A temporary JavaScript smoke test was used to isolate the logging pipeline from the backend's current TypeScript/dependency issues.

The test generated a unique event:

```text
TRACEIT_SIEM_TEST_<timestamp>
```

The event successfully reached Elasticsearch.

The resulting index was:

```text
traceit-logs-2026.08.19
```

The Elasticsearch document was successfully retrieved and contained:

```text
@timestamp
message
severity
fields.source
fields.purpose
fields.timestamp
```

This confirms that the following pipeline is operational:

```text
Winston
   ↓
winston-elasticsearch
   ↓
Elasticsearch :9200
   ↓
traceit-logs-*
```

---

# Current Limitation

The smoke test validates the Elasticsearch transport, but it does **not yet validate the complete production backend logging schema**.

The current Kibana data view therefore only contains fields observed from the smoke test.

Dev A's handoff indicates that real backend request logs should additionally contain fields such as:

```text
requestId
method
path
statusCode
durationMs
userId
ip
```

and security events including:

```text
LOGIN_FAILED
LOGIN_SUCCESS
AML_FLAG_RAISED
UNAUTHORIZED_DOC_ACCESS
WEBHOOK_TAMPER_ATTEMPT
```

These will be validated once the backend is operational.

---

# Next Steps

## Immediate

1. Wait for Dev B's Phase 5 backend implementation to be completed.
2. Work with Dev A to resolve the existing backend dependency/startup issues.
3. Generate real Trace-It API traffic.
4. Verify real backend logs in Elasticsearch.
5. Validate the actual Elasticsearch field mappings in Kibana.

## Security Monitoring

After real telemetry is available:

1. Complete the Trace-It Security Operations dashboard.
2. Add authentication monitoring.
3. Add HTTP error monitoring.
4. Add security-event monitoring.
5. Implement brute-force detection.
6. Implement AML event detection.
7. Implement unauthorized document access detection.
8. Implement government-request monitoring where sufficient telemetry exists.
9. Configure alert notifications.
10. Perform end-to-end detection testing.

---

# Important Principle

The SIEM documentation and dashboards should only claim controls that have been **implemented and validated**.

The following distinctions should be maintained:

* Implemented
* Implemented but validation pending
* Partially implemented
* Planned
* Known limitation

No security capability should be marked as operational solely because it exists in documentation or source code.
