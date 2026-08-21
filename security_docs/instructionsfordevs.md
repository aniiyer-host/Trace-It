# Trace-It SIEM – Developer Local Setup

## Prerequisites

Docker and Docker Compose must be installed.

Verify:

```bash
docker --version
docker compose version
```

---

## 1. Create SIEM Environment

```bash
mkdir -p traceit-siem
cd traceit-siem
```

Create `docker-compose.yml` with the project's shared Elasticsearch/Kibana configuration.

Start the services:

```bash
docker compose up -d
```

Check status:

```bash
docker compose ps
```

---

## 2. Verify Elasticsearch

```bash
curl http://localhost:9200
```

Check indices:

```bash
curl "http://localhost:9200/_cat/indices?v"
```

Elasticsearch should be available at:

```text
http://localhost:9200
```

---

## 3. Configure Trace-It Backend

In the backend's local `.env`:

```env
ELASTICSEARCH_NODE=http://localhost:9200
```

Do not add this to `.env.test` unless Elasticsearch integration testing is specifically required.

For `.env.example`, document the variable without committing environment-specific credentials.

---

## 4. Open Kibana

Open:

```text
http://localhost:5601
```

Create/select the Trace-It data view:

```text
traceit-logs-*
```

Timestamp field:

```text
@timestamp
```

---

## 5. Verify Logs

Once the backend is operational, generate a request and check Elasticsearch:

```bash
curl "http://localhost:9200/_cat/indices?v"
```

Then inspect recent Trace-It logs:

```bash
curl -s "http://localhost:9200/traceit-logs-*/_search?size=5&sort=@timestamp:desc" | jq
```

Verify that real backend fields and events are present.

---

## Local Environment

```text
Elasticsearch → http://localhost:9200
Kibana        → http://localhost:5601
Index pattern → traceit-logs-*
```

**Note:** This setup is for local development/testing only. Elasticsearch security is disabled in the current local configuration and must be hardened before any production deployment.
