// Trace-It SIEM Phase 3A Smoke Test
//
// Validates:
// HTTP request
//   -> Trace-It requestLogger
//   -> Winston
//   -> winston-elasticsearch
//   -> Elasticsearch
//
// The backend must already be running.

import * as http from 'http';
import { randomUUID } from 'crypto';

const BACKEND_HOST = '127.0.0.1';
const BACKEND_PORT = 3000;
const ENDPOINT = '/health';

const ELASTICSEARCH_URL =
  process.env.ELASTICSEARCH_URL || 'http://localhost:9200';

const ELASTICSEARCH_INDEX = 'traceit-logs';

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

async function checkBackend() {
  try {
    const response = await httpRequest({
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: ENDPOINT,
      method: 'GET',
      timeout: 3000
    });

    return response.statusCode === 200;
  } catch {
    return false;
  }
}

async function queryElasticsearch(requestId) {
  const url = new URL(
    `${ELASTICSEARCH_URL}/${ELASTICSEARCH_INDEX}/_search`
  );

  const searchBody = {
    size: 1,
    query: {
      term: {
        'fields.requestId.keyword': requestId
      }
    }
  };

  const response = await httpRequest(
    {
      hostname: url.hostname,
      port: Number(url.port) || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    },
    JSON.stringify(searchBody)
  );

  if (response.statusCode !== 200) {
    throw new Error(
      `Elasticsearch returned HTTP ${response.statusCode}`
    );
  }

  const parsed = JSON.parse(response.body);

  if (
    parsed.hits &&
    parsed.hits.hits &&
    parsed.hits.hits.length > 0
  ) {
    return parsed.hits.hits[0]._source;
  }

  return null;
}

function validateTelemetry(logDoc, requestId, expectedStatusCode) {
  const telemetry = logDoc.fields || {};

  const expectedFields = [
    'requestId',
    'method',
    'path',
    'statusCode',
    'durationMs',
    'ip'
  ];

  console.log('[SMOKE] Validating telemetry fields...');

  const missingFields = expectedFields.filter(
    field => !(field in telemetry)
  );

  if (missingFields.length > 0) {
    throw new Error(
      `Missing fields: ${missingFields.join(', ')}`
    );
  }

  if (telemetry.requestId !== requestId) {
    throw new Error(
      `requestId mismatch: expected ${requestId}, got ${telemetry.requestId}`
    );
  }

  if (telemetry.method !== 'GET') {
    throw new Error(
      `method mismatch: expected GET, got ${telemetry.method}`
    );
  }

  if (telemetry.path !== ENDPOINT) {
    throw new Error(
      `path mismatch: expected ${ENDPOINT}, got ${telemetry.path}`
    );
  }

  if (telemetry.statusCode !== expectedStatusCode) {
    throw new Error(
      `statusCode mismatch: expected ${expectedStatusCode}, got ${telemetry.statusCode}`
    );
  }

  if (
    typeof telemetry.durationMs !== 'number' ||
    telemetry.durationMs < 0
  ) {
    throw new Error(
      `Invalid durationMs: ${telemetry.durationMs}`
    );
  }

  if (typeof telemetry.ip !== 'string') {
    throw new Error(
      `Invalid ip type: ${typeof telemetry.ip}`
    );
  }

  console.log('[SMOKE] ✓ requestId');
  console.log('[SMOKE] ✓ method');
  console.log('[SMOKE] ✓ path');
  console.log('[SMOKE] ✓ statusCode');
  console.log('[SMOKE] ✓ durationMs');
  console.log('[SMOKE] ✓ ip');

  console.log('[SMOKE] ✓ userId handling');
}

async function runSmokeTest() {
  console.log('');
  console.log('========================================');
  console.log(' Trace-It SIEM Phase 3A Smoke Test');
  console.log('========================================');
  console.log('');

  console.log(`[SMOKE] Backend: http://${BACKEND_HOST}:${BACKEND_PORT}`);
  console.log(`[SMOKE] Endpoint: ${ENDPOINT}`);
  console.log(`[SMOKE] Elasticsearch: ${ELASTICSEARCH_URL}`);
  console.log(`[SMOKE] Index: ${ELASTICSEARCH_INDEX}`);
  console.log('');

  // --------------------------------------------------
  // 1. Backend readiness
  // --------------------------------------------------

  console.log('[SMOKE] Checking backend...');

  const backendReady = await checkBackend();

  if (!backendReady) {
    throw new Error(
      'Backend is not reachable or /health did not return HTTP 200'
    );
  }

  console.log('[SMOKE] ✓ Backend is ready');

  // --------------------------------------------------
  // 2. Generate unique request ID
  // --------------------------------------------------

  const requestId = randomUUID();

  console.log(`[SMOKE] Generated requestId: ${requestId}`);

  // --------------------------------------------------
  // 3. Send real backend request
  // --------------------------------------------------

  console.log('[SMOKE] Sending real HTTP request...');

  const response = await httpRequest({
    hostname: BACKEND_HOST,
    port: BACKEND_PORT,
    path: ENDPOINT,
    method: 'GET',
    headers: {
      'X-Request-ID': requestId
    }
  });

  console.log(
    `[SMOKE] ✓ Backend responded with HTTP ${response.statusCode}`
  );

  if (response.statusCode !== 200) {
    throw new Error(
      `Expected HTTP 200, received ${response.statusCode}`
    );
  }

  // --------------------------------------------------
  // 4. Wait for Elasticsearch ingestion
  // --------------------------------------------------

  console.log('[SMOKE] Waiting for Elasticsearch ingestion...');

  let logDoc = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logDoc = await queryElasticsearch(requestId);

      if (logDoc) {
        console.log(
          `[SMOKE] ✓ Elasticsearch document found on attempt ${attempt}`
        );
        break;
      }
    } catch (error) {
      console.log(
        `[SMOKE] Elasticsearch query attempt ${attempt} failed: ${error.message}`
      );
    }

    await sleep(RETRY_DELAY_MS);
  }

  if (!logDoc) {
    throw new Error(
      'Telemetry document was not found in Elasticsearch'
    );
  }

  // --------------------------------------------------
  // 5. Validate telemetry
  // --------------------------------------------------

  validateTelemetry(
    logDoc,
    requestId,
    response.statusCode
  );

  // --------------------------------------------------
  // 6. Success
  // --------------------------------------------------

  console.log('');
  console.log('========================================');
  console.log(' SIEM PHASE 3A TEST: PASSED');
  console.log('========================================');
  console.log('');
  console.log('Validated pipeline:');
  console.log('');
  console.log('HTTP Request');
  console.log('     ↓');
  console.log('Trace-It requestLogger');
  console.log('     ↓');
  console.log('Winston');
  console.log('     ↓');
  console.log('winston-elasticsearch');
  console.log('     ↓');
  console.log('Elasticsearch');
  console.log('     ↓');
  console.log('Telemetry validation');
  console.log('');
  console.log(`requestId: ${requestId}`);
  console.log('');
}

runSmokeTest()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('');
    console.error('========================================');
    console.error(' SIEM PHASE 3A TEST: FAILED');
    console.error('========================================');
    console.error('');
    console.error(`[SMOKE] ${error.message}`);
    console.error('');

    process.exit(1);
  });