# Trace-It — Dev B: WAF Implementation & Validation

## 1. Overview

This document describes the implementation and validation of the Web Application Firewall (WAF) layer for the Trace-It application.

The objective of Dev B was to introduce an edge-security layer capable of inspecting HTTP traffic before it reaches the Trace-It backend, detecting common web attacks, applying application-specific security rules, and providing a foundation for rate limiting and production deployment.

The implementation uses:

* Cloudflare Quick Tunnel for temporary public exposure
* Caddy as the reverse proxy
* OWASP Coraza WAF
* OWASP Core Rule Set (CRS)
* Docker
* Trace-It API running locally
* Existing Trace-It SIEM for downstream application telemetry

---

## 2. Implemented Architecture

The final development/test architecture is:

```text
                         INTERNET
                            │
                            ▼
                 ┌────────────────────┐
                 │ Cloudflare Quick    │
                 │      Tunnel         │
                 └─────────┬──────────┘
                           │
                           ▼
                    localhost:8081
                           │
                           ▼
                 ┌────────────────────┐
                 │ Caddy + Coraza WAF │
                 │                    │
                 │ OWASP CRS          │
                 │ Custom Rules       │
                 └─────────┬──────────┘
                           │
                           ▼
                    localhost:3000
                           │
                           ▼
                    Trace-It API
                           │
                           ▼
                    Winston / SIEM
```

The local port allocation is:

| Service          |   Port |
| ---------------- | -----: |
| Trace-It API     | `3000` |
| Jenkins          | `8080` |
| Coraza/Caddy WAF | `8081` |

Port `8080` was deliberately kept separate for Jenkins compatibility.

---

## 3. WAF Technology

### 3.1 Coraza

Coraza is an open-source Web Application Firewall written in Go and designed to support ModSecurity-compatible SecLang rules. It is compatible with the OWASP Core Rule Set.

For this implementation, Coraza was integrated with Caddy using the official Coraza-Caddy module.

The Caddy module was built using:

```bash
xcaddy build \
    --with github.com/corazawaf/coraza-caddy/v2
```

The official Coraza-Caddy documentation specifies this build approach and requires:

```caddyfile
{
    order coraza_waf first
}
```

for the WAF handler to operate correctly.

### 3.2 OWASP Core Rule Set

OWASP CRS was loaded through Coraza using:

```caddyfile
load_owasp_crs
```

with:

```caddyfile
Include @coraza.conf-recommended
Include @crs-setup.conf.example
Include @owasp_crs/*.conf
SecRuleEngine On
```

This provides generic protection against common web application attacks, including SQL injection and Cross-Site Scripting (XSS).

---

## 4. Docker Implementation

A dedicated WAF directory was created outside the Trace-It application:

```text
traceit-waf/
├── Dockerfile
├── docker-compose.yml
└── Caddyfile
```

This keeps the WAF infrastructure separate from the backend application.

### Dockerfile

A multi-stage Docker build was used.

The first stage builds Caddy with the Coraza module:

```dockerfile
FROM caddy:2-builder AS builder

RUN xcaddy build \
    --with github.com/corazawaf/coraza-caddy/v2
```

The second stage uses the standard Caddy runtime image:

```dockerfile
FROM caddy:2

COPY --from=builder /usr/bin/caddy /usr/bin/caddy
```

The initial attempt used the builder image directly as the runtime image, which caused the container to exit with status `0`. This was corrected by separating the build and runtime stages.

---

## 5. Reverse Proxy Configuration

The WAF listens on:

```text
8081
```

and forwards legitimate requests to:

```text
localhost:3000
```

Because Caddy runs inside Docker while Trace-It runs on the host machine, the proxy uses:

```text
host.docker.internal:3000
```

as the backend destination.

The configuration includes the Coraza WAF, OWASP CRS, and a custom Trace-It rule.

---

## 6. Cloudflare Tunnel

A Cloudflare Quick Tunnel was used to provide temporary public access to the local WAF.

The tunnel was configured to point to:

```text
http://localhost:8081
```

rather than directly to the Trace-It API.

Therefore:

```text
Cloudflare
    ↓
8081
    ↓
Coraza
    ↓
3000
```

This is important because traffic is inspected by the WAF before reaching the application.

The Quick Tunnel provides a temporary `trycloudflare.com` hostname and is suitable for development/testing rather than production deployment.

---

# 7. Validation

## 7.1 Legitimate Traffic

A request was sent through the WAF:

```bash
curl -i https://<quick-tunnel-url>/
```

The response was:

```text
HTTP/2 200
server: cloudflare
via: 1.1 Caddy
```

and the Trace-It API returned:

```json
{
  "message": "TraceIt API is running"
}
```

This validated:

```text
Client
  ↓
Cloudflare
  ↓
Caddy
  ↓
Coraza
  ↓
Trace-It
```

### Result

**Legitimate traffic successfully passed through the WAF.**

---

## 7.2 Cloudflare Verification

The public response contained:

```text
server: cloudflare
cf-ray: <Cloudflare Ray ID>
```

and:

```text
via: 1.1 Caddy
```

This provided evidence that the request passed through both Cloudflare and the local Caddy reverse proxy.

---

## 7.3 SQL Injection Detection

A harmless SQL injection test payload was sent:

```text
?id=1' OR '1'='1
```

URL-encoded request:

```bash
curl -i "https://<quick-tunnel-url>/?id=1%27%20OR%20%271%27%3D%271"
```

The WAF returned:

```text
HTTP 403 Forbidden
```

Coraza generated the following WAF log:

```text
level: error
logger: http.handlers.waf
msg: WAF rule violation detected
hostname: lives-remain-reflects-beings.trycloudflare.com
uri: /?id=1%27%20OR%20%271%27%3D%271
client_ip: 192.168.155.1:36816
unique_id: VuZTVJLNBUPPszRL
```

### Result

**SQL injection test successfully detected and blocked by Coraza/OWASP CRS.**

The request was blocked at the WAF layer before reaching the Trace-It application.

---

## 7.4 Cross-Site Scripting Detection

A harmless XSS test payload was sent:

```text
?q=<script>alert(1)</script>
```

URL-encoded request:

```bash
curl -i "https://<quick-tunnel-url>/?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E"
```

The WAF returned:

```text
HTTP 403 Forbidden
```

### Result

**XSS test successfully detected and blocked by Coraza/OWASP CRS.**

---

# 8. Custom Trace-It WAF Rule

In addition to generic OWASP CRS protection, an application-specific Coraza rule was created.

The rule:

```caddyfile
SecRule REQUEST_URI "@streq /waf-test" \
    "id:100001,phase:1,deny,status:403,log,msg:'Trace-It custom WAF test rule triggered'"
```

was designed specifically to demonstrate Trace-It-specific WAF policy.

A legitimate request:

```text
/
```

returned:

```text
200 OK
```

while:

```bash
curl -i https://<quick-tunnel-url>/waf-test
```

returned:

```text
HTTP/2 403
```

### Result

**Custom application-specific WAF rule successfully blocked the configured request.**

This demonstrates that the WAF is capable of combining:

```text
Generic OWASP protection
        +
Trace-It-specific security policies
```

The official Coraza-Caddy examples also demonstrate custom `SecRule` directives for blocking specific request URIs.

---

# 9. Rate Limiting

Rate limiting was investigated during implementation.

The Trace-It API already exposes application-level rate-limit headers such as:

```text
Ratelimit-Limit
Ratelimit-Policy
Ratelimit-Remaining
Ratelimit-Reset
```

These belong to the application layer and therefore are **not counted as WAF-level rate limiting**.

An attempted Coraza IP-based rate-limit configuration was rejected by the current configuration because the selected `IP` collection syntax was not valid for the deployed Coraza configuration.

Therefore:

**WAF-level rate limiting is not considered implemented or validated in this phase.**

This distinction is intentional:

```text
Application Rate Limiting
        ≠
WAF / Edge Rate Limiting
```

A future implementation should use a properly supported Coraza collection-based configuration or a dedicated rate-limiting layer at the reverse proxy/edge.

---

# 10. Security Flow

The validated security flow is:

```text
                    REQUEST
                       │
                       ▼
                 Cloudflare
                       │
                       ▼
                  Caddy :8081
                       │
                       ▼
                  Coraza WAF
                       │
            ┌──────────┴──────────┐
            │                     │
        Legitimate             Malicious
            │                     │
            ▼                     ▼
       Reverse Proxy          403 BLOCK
            │
            ▼
      Trace-It :3000
            │
            ▼
       Application
            │
            ▼
        SIEM / Logs
```

The WAF therefore provides a security control **before application processing**, while the SIEM remains responsible for application telemetry, detection, alerting, and investigation.

---

# 11. Production Deployment Considerations

The current implementation is a **development/lab deployment**.

The current architecture:

```text
Cloudflare Quick Tunnel
        ↓
Developer machine
        ↓
Docker
        ↓
Coraza
        ↓
Trace-It
```

should not be treated as the final production architecture.

## 11.1 Recommended Production Architecture

A production deployment could use:

```text
                         INTERNET
                            │
                            ▼
                  DNS / Edge / CDN
                            │
                            ▼
                    Coraza WAF
                    + OWASP CRS
                            │
                            ▼
                  Load Balancer /
                  Reverse Proxy
                            │
                            ▼
                    Trace-It API
                            │
                            ▼
                 Application Services
                            │
                            ▼
                    SIEM / Logging
```

The WAF could run as:

* a dedicated Docker container
* a Kubernetes workload
* a Caddy reverse-proxy layer
* an NGINX-based deployment
* an HAProxy integration
* another supported Coraza integration

The Coraza project currently provides integrations including Caddy, NGINX, and HAProxy-related components, while the project also maintains deployment tooling such as Helm charts.

## 11.2 Production Requirements

Before moving the WAF to production, the following should be addressed:

### Stable ingress

Replace the Cloudflare Quick Tunnel with a permanent production ingress/domain and a stable tunnel or load-balancing architecture.

### TLS

TLS termination should be handled at the appropriate production ingress layer.

### WAF tuning

OWASP CRS should be tuned against the application's legitimate traffic to reduce false positives.

CRS deployment guidance and tuning recommendations should be followed rather than deploying a laboratory configuration unchanged. The Coraza project explicitly directs users to the OWASP CRS documentation for deployment best practices and false-positive handling.

### Logging

WAF events should be sent to centralized logging/SIEM infrastructure.

Useful fields include:

```text
timestamp
client IP
request ID
WAF rule ID
hostname
URI
HTTP method
action
status code
unique event ID
```

### Monitoring

Production monitoring should track:

* blocked requests
* challenged requests
* false positives
* WAF rule frequency
* high-volume clients
* repeated attack patterns
* WAF availability
* backend availability

### High Availability

A production WAF should not depend on a developer laptop or a single container.

Multiple WAF instances or a highly available ingress architecture should be considered.

### Configuration Management

WAF rules should be version-controlled and reviewed before deployment.

Custom rules should have:

* unique IDs
* descriptions
* documented purpose
* test cases
* rollback procedures

---

# 12. Limitations of Current Implementation

The current implementation has several intentional limitations:

1. Cloudflare Quick Tunnel is temporary and intended for development/testing.
2. The Trace-It backend remains on a developer machine.
3. WAF TLS is not independently configured because Cloudflare provides the public HTTPS endpoint.
4. WAF-level rate limiting was not successfully implemented in this phase.
5. No production HA architecture has been deployed.
6. WAF logs have not yet been integrated directly into the Trace-It SIEM.
7. CRS tuning for production false positives has not yet been performed.

These limitations do not affect the successful validation of the core WAF functionality.

---

# 13. Validation Summary

| Test                        | Expected Result       | Actual Result                  | Status        |
| --------------------------- | --------------------- | ------------------------------ | ------------- |
| Local WAF → Trace-It        | `200 OK`              | `200 OK`                       | PASS          |
| Cloudflare → WAF → Trace-It | `200 OK`              | `200 OK`                       | PASS          |
| Cloudflare headers          | Cloudflare metadata   | `server: cloudflare`, `cf-ray` | PASS          |
| Caddy proxy                 | Request forwarded     | `Via: 1.1 Caddy`               | PASS          |
| SQL Injection               | Block                 | `403`                          | PASS          |
| XSS                         | Block                 | `403`                          | PASS          |
| Custom WAF rule             | Block `/waf-test`     | `403`                          | PASS          |
| WAF violation logging       | Log event             | Coraza WAF violation logged    | PASS          |
| WAF rate limiting           | `429`                 | Not implemented                | NOT VALIDATED |
| Production deployment       | Stable HA environment | Development setup              | FUTURE        |

---

# 14. Final Architecture Status

The completed Dev B development implementation is:

```text
                         INTERNET
                            │
                            ▼
                 ┌────────────────────┐
                 │ Cloudflare Quick   │
                 │      Tunnel        │
                 └─────────┬──────────┘
                           │
                           ▼
                     Caddy :8081
                           │
                           ▼
                 ┌────────────────────┐
                 │    Coraza WAF      │
                 │                    │
                 │    OWASP CRS       │
                 │         +          │
                 │ Custom Rules       │
                 └─────────┬──────────┘
                           │
                    legitimate traffic
                           │
                           ▼
                    Trace-It :3000
                           │
                           ▼
                 Winston / SIEM
                           │
                           ▼
                Elasticsearch / Kibana
```

### Dev B Core Result

The Trace-It API is successfully protected by a reverse-proxy WAF layer using **OWASP Coraza + Caddy + OWASP CRS**.

The implementation successfully demonstrated:

* legitimate traffic passing through the WAF
* SQL injection detection
* XSS detection
* custom application-specific WAF rules
* HTTP 403 blocking
* WAF security-event logging
* Cloudflare edge exposure
* separation between edge protection and application-level SIEM monitoring

This establishes the foundation for a production-oriented WAF deployment in a future phase.
