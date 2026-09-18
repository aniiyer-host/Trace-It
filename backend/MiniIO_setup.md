# Trace-It — Local MinIO Setup & Integration

This document covers the complete setup for running MinIO locally using Docker, as well as the changelog for the Disbursement Module integration in Trace-It.

---

## 1. Local MinIO Setup

This setup is completely local and does not require AWS or any external cloud storage account.

### Prerequisites

Ensure Docker is installed and running on your system.

```bash
# Check Docker version
docker --version

# Verify Docker daemon status
docker ps
```

---

### Step 1: Create a Local Directory for Data Persistence

Create a directory on your host machine to store MinIO files persistently across container restarts:

```bash
mkdir -p ~/traceit-minio/data
```

---

### Step 2: Start MinIO via Docker

Run the container using your updated credentials (`traceit` / `traceit123`):

```bash
docker run -d \
  --name traceit-minio \
  -p 9000:9000 \
  -p 9001:9001 \
  -v ~/traceit-minio/data:/data \
  -e "MINIO_ROOT_USER=traceit" \
  -e "MINIO_ROOT_PASSWORD=traceit123" \
  quay.io/minio/minio server /data --console-address ":9001"
```

#### Port Mapping

- **9000** → MinIO S3 API Endpoint
- **9001** → MinIO Web Console UI

---

### Step 3: Verify Container Status

```bash
# Verify the container is running
docker ps

# Check logs
docker logs traceit-minio

# Follow live logs
docker logs -f traceit-minio
```

---

### Step 4: Access Web Console & Create Bucket

1. Open your browser to `http://localhost:9001`.
2. Login with credentials:
   - **Username:** `traceit`
   - **Password:** `traceit123`
3. Navigate to **Buckets** → **Create Bucket**.
4. Set Bucket Name: `test-bucket`.
5. Keep the bucket **Private** (proof files are accessed securely via temporary signed URLs).

---

### Step 5: Configure Backend Environment Variables

Add the following variables to your backend `.env` file:

```env
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY_ID=traceit
MINIO_SECRET_ACCESS_KEY=traceit123
MINIO_REGION=us-east-1
```
