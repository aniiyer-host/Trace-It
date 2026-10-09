# Trace-It — Local MinIO Setup & Integration

This document covers the local object-storage setup for Trace-It using Docker and MinIO AIStor, along with the relevant configuration for the Disbursement Module integration.

---

## 1. Local Object Storage Setup

This setup runs locally using Docker and does not require an AWS account or external cloud storage account. AIStor is used as the S3-compatible object-storage service.

### Prerequisites

Ensure Docker is installed and running in WSL Ubuntu.

```bash
# Check Docker version
docker --version

# Verify Docker daemon status
docker ps

# Check Docker Compose version (optional)
docker compose version
```

---

### Step 1: Create a Local Directory for Persistent Data

Create a directory on the host machine to store object-storage data persistently across container restarts.

```bash
mkdir -p ~/traceit-minio/data
```

Keep this directory intact. It contains the files stored by the container.

### Step 2: Obtain the AIStor License

Obtain a valid license through the official MinIO AIStor process.

Save the license file at:

```text
~/traceit-minio/minio.license
```

Verify that the file exists:

```bash
ls -l ~/traceit-minio/minio.license
```

Do not commit the license file to Git or expose it publicly.

### Step 3: Start AIStor via Docker

Use the official AIStor image:

```text
quay.io/minio/aistor/minio:latest
```

Run the following command:

```bash
docker run -d \
  --name traceit-minio \
  -p 9000:9000 \
  -p 9001:9001 \
  -v ~/traceit-minio/data:/data \
  -v ~/traceit-minio/minio.license:/minio.license:ro \
  -e "MINIO_ROOT_USER=traceit" \
  -e "MINIO_ROOT_PASSWORD=traceit123" \
  quay.io/minio/aistor/minio:latest \
  server /data --console-address ":9001" --license /minio.license
```

**Note:** This command creates a new container. If a container named `traceit-minio` already exists, stop and remove that container before recreating it. Do not delete the persistent data directory.

#### Port Mapping

* **9000** — S3-compatible API endpoint.
* **9001** — Web Console UI.

#### Persistent Storage

The host directory `~/traceit-minio/data` is mounted at `/data` inside the container. Files remain on the host when the container is stopped or recreated.

---

### Step 4: Verify Container Status

```bash
# Check container status
docker ps -a --filter name=traceit-minio

# Check recent logs
docker logs --tail 100 traceit-minio

# Follow live logs
docker logs -f traceit-minio
```

A successful startup should show the AIStor API and WebUI endpoints in the logs.

Press `Ctrl+C` to stop following logs. This does not stop the container.

---

### Step 5: Access the Web Console and Create a Bucket

1. Open http://localhost:9001.
2. Sign in using the configured credentials:

   * **Username:** `traceit`
   * **Password:** `traceit123`
3. Navigate to **Buckets** and select **Create Bucket**.
4. Set the bucket name to `test-bucket`.
5. Keep the bucket **private**.

Private storage helps protect proof files. Authorized users should access files through temporary signed URLs or another properly authenticated mechanism.

If the bucket already exists, verify it rather than creating a duplicate.

---

## 2. Configure Trace-It Backend Environment Variables

Add the following variables to the backend `.env` file:

```env
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY_ID=traceit
MINIO_SECRET_ACCESS_KEY=traceit123
MINIO_REGION=us-east-1
```

Keep any existing bucket-name variable unchanged if it is already configured. If the backend expects a bucket name, ensure it matches the bucket created in the console:

```env
MINIO_BUCKET_NAME=test-bucket
```

Only add `MINIO_BUCKET_NAME` if your backend uses that variable name. The exact variable name depends on your existing implementation.

### Environment Configuration Notes

* `MINIO_ENDPOINT` points to the local S3-compatible API.
* `MINIO_ACCESS_KEY_ID` identifies the configured storage user.
* `MINIO_SECRET_ACCESS_KEY` authenticates requests.
* `MINIO_REGION` should match the region configuration expected by the backend and storage client.

If the backend runs directly in WSL on the same machine, `localhost:9000` should work. If it runs in another Docker container, `localhost` refers to that container itself; use an appropriate shared Docker network and service/container hostname instead.

Do not commit `.env`, real credentials, or license files to the repository. The example credentials are for local development only.

---

## 3. Verify the S3 API and Backend Integration

After starting AIStor, confirm that the container is running and inspect its logs.

```bash
docker ps --filter name=traceit-minio
docker logs --tail 50 traceit-minio
```

Then test the Disbursement Module's upload workflow:

1. Start the Trace-It backend with the updated environment variables.
2. Trigger an upload through the relevant frontend workflow or backend endpoint.
3. Confirm that the upload succeeds.
4. Open the `test-bucket` in the Web Console and verify that the expected object exists.
5. Verify that authorized access to proof files works through the application's intended signed-URL or authenticated-download mechanism.

A successful container startup alone does not prove that the application upload integration works; perform an actual upload test.

---

## 4. Useful Docker Commands

```bash
# Stop AIStor
docker stop traceit-minio

# Start AIStor
docker start traceit-minio

# Restart AIStor
docker restart traceit-minio

# View logs
docker logs --tail 100 traceit-minio

# Follow logs
docker logs -f traceit-minio
```

To recreate the container after changing its configuration, remove the container only after confirming that persistent data is stored in `~/traceit-minio/data`. Then rerun the Docker command from Step 3.

**Never run `docker rm -v` or delete the data directory as part of routine troubleshooting.**

---

## 5. Disbursement Module Integration Notes

The object-storage service is intended to support file uploads associated with the Trace-It Disbursement Module.

The expected integration flow is:

1. The frontend submits a file through the application's authorized upload workflow.
2. The backend validates the request and handles the upload.
3. The backend stores the object in the configured private bucket.
4. The application stores or returns the appropriate object reference.
5. Authorized users retrieve the file through the application's secure access mechanism.

The actual behavior depends on the existing backend service and frontend implementation. Verify the complete workflow with an end-to-end upload and retrieval test.

---

## 6. Troubleshooting

| Problem                       | What to check                                                            |
| ----------------------------- | ------------------------------------------------------------------------ |
| Container fails to start      | Inspect `docker logs traceit-minio`.                                     |
| Console cannot be opened      | Check that the container is running and port `9001` is available.        |
| API connection fails          | Check port `9000` and `MINIO_ENDPOINT`.                                  |
| Access denied                 | Verify the credentials, license status, and bucket permissions.          |
| Bucket is missing             | Confirm the mounted data directory and create the bucket if appropriate. |
| Upload fails from the backend | Check the endpoint, region, credentials, bucket name, and backend logs.  |
| License-related error         | Verify the license file and the server's license configuration.          |

---

## 7. Current Configuration Summary

* **Container:** `traceit-minio`
* **Image:** `quay.io/minio/aistor/minio:latest`
* **API:** `http://localhost:9000`
* **Console:** `http://localhost:9001`
* **Data directory:** `~/traceit-minio/data`
* **License file:** `~/traceit-minio/minio.license`
* **Root username:** `traceit`
* **Development bucket:** `test-bucket`
* **Backend endpoint:** `http://localhost:9000`

The current setup has reported a successful AIStor startup. The remaining verification is to confirm bucket contents and complete a real Trace-It upload and retrieval test.
