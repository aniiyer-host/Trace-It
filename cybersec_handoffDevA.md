# Cybersecurity Handoff: Trace-It Backend

## Overview
The Trace-It backend (Node.js/Express) has completed its core development and security instrumentation (Dev A Phase 5). The application is now emitting structured, high-context logs and specific security events. 

We are handing off the **Security Operations (SecOps)** configuration to you. Your goal is to ingest these logs, build the monitoring dashboards, and configure the SIEM alerting rules.

*(Note: CI/CD, Dockerization, Load Testing, and Production Server Deployment are handled separately by Dev B. Your focus is strictly on the SIEM/Logging pipeline.)*

---

## 1. What is Already Implemented in the Codebase

The backend has been heavily instrumented to make your job easier. You do not need to write Node.js code; the app is already broadcasting everything you need:

- **Structured JSON Logging:** We implemented `winston` logging. Every API request generates a JSON log containing: `{ requestId, method, path, statusCode, durationMs, userId, ip }`.
- **Winston Elasticsearch Transport:** The backend is configured to ship logs directly to an Elasticsearch node. It simply needs the `ELASTICSEARCH_NODE` environment variable set to your cluster's URL.
- **Traceability:** An `X-Request-ID` header is injected into every request, ensuring full log correlation across the request lifecycle.
- **Explicit Security Events:** The application actively emits specific audit log events when sensitive actions occur, including:
  - `LOGIN_FAILED` and `LOGIN_SUCCESS`
  - `AML_FLAG_RAISED` (Anti-Money Laundering)
  - `UNAUTHORIZED_DOC_ACCESS`
  - `WEBHOOK_TAMPER_ATTEMPT`

---

## 2. Your Tasks (SIEM & Infrastructure)

Please execute the following tasks to bring the security pipeline to production readiness:

### A. Elasticsearch & Kibana Setup
- Provision and secure an Elasticsearch cluster (self-hosted or managed).
- Provide the connection URL so we can set `ELASTICSEARCH_NODE` in the production environment variables.
- Ensure proper index lifecycle management (ILM) and log retention policies to comply with FCRA and 80G government auditing requirements.

### B. Dashboard Configuration (Kibana/Grafana)
Build monitoring dashboards for the SOC team. Key panels should include:
- Live request rates and latency.
- Error rates (tracking HTTP 4xx and 5xx spikes).
- Failed authentication counts and IP mapping.
- Donation flow volume.
- Real-time stream of the custom security events listed above.

### C. SIEM Alerting Rules
Configure automated alerting inside Elasticsearch (or your SIEM of choice) to notify the admin/compliance team when specific thresholds are breached:
1. **Brute Force Detection:** Trigger a `BRUTE_FORCE_ATTEMPT` alert and send an email if there are 5+ `LOGIN_FAILED` events from the same IP address within a 5-minute window.
2. **AML Thresholds:** Trigger an immediate compliance review alert if an `AML_FLAG_RAISED` event is ingested (triggered when a donation exceeds ₹100,000).
3. **Legal Gateway Auditing:** Flag any database access involving the `government_requests` table.
4. **Document Security:** Trigger a high-priority alert for `UNAUTHORIZED_DOC_ACCESS` (accessing a sensitive document without a matching government request or owner privilege).

---

Please let the Dev A team know once the Elasticsearch instance is ready to receive traffic so we can test the transport connection!
