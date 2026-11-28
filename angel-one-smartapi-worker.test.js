
import assert from "node:assert/strict";

import {
  checkRequestOrigin,
  buildCorsHeaders,
  originSecurityError,
  ANGEL_ONE_ORIGIN_SECURITY_CONFIG
} from "./angel-one-worker-security.js";

const ALLOWED = "https://badalrajseveriya.github.io";

let passed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

function makeRequest(origin) {
  const headers = {};

  if (origin !== undefined) {
    headers.Origin = origin;
  }

  return new Request("https://angel-worker.test/api/health", {
    headers
  });
}

function makeEnv(appOrigin = ALLOWED) {
  return { APP_ORIGIN: appOrigin };
}

await test("Accepts the exact configured HTTPS dashboard Origin", async () => {
  const result = checkRequestOrigin(makeRequest(ALLOWED), makeEnv());
  assert.equal(result.ok, true);
  assert.equal(result.origin, ALLOWED);
});

await test("Rejects an unlisted Origin", async () => {
  const result = checkRequestOrigin(
    makeRequest("https://evil.example"),
    makeEnv()
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.error, "ORIGIN_NOT_ALLOWED");
});

await test("Rejects a missing Origin when required", async () => {
  const result = checkRequestOrigin(
    makeRequest(undefined),
    makeEnv(),
    { requireOrigin: true }
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "ORIGIN_HEADER_REQUIRED");
});

await test("Allows missing Origin only when not required", async () => {
  const result = checkRequestOrigin(makeRequest(undefined), makeEnv());
  assert.equal(result.ok, true);
  assert.deepEqual(result.corsHeaders, {});
});

await test("Rejects missing APP_ORIGIN configuration", async () => {
  const result = checkRequestOrigin(makeRequest(ALLOWED), {});
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.error, "APP_ORIGIN_NOT_CONFIGURED");
});

await test("Rejects wildcard Origin configuration", async () => {
  const result = checkRequestOrigin(makeRequest(ALLOWED), makeEnv("*"));
  assert.equal(result.ok, false);
  assert.equal(result.error, "INVALID_APP_ORIGIN_CONFIGURATION");
});

await test("Rejects HTTP dashboard Origin configuration", async () => {
  const result = checkRequestOrigin(
    makeRequest("http://badalrajseveriya.github.io"),
    makeEnv("http://badalrajseveriya.github.io")
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "INVALID_APP_ORIGIN_CONFIGURATION");
});

await test("Rejects Origin configuration containing a path", async () => {
  const result = checkRequestOrigin(
    makeRequest(ALLOWED),
    makeEnv(ALLOWED + "/Badal_severiya_v10")
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "INVALID_APP_ORIGIN_CONFIGURATION");
});

await test("Rejects malformed Origin configuration", async () => {
  const result = checkRequestOrigin(
    makeRequest(ALLOWED),
    makeEnv("not-a-valid-origin")
  );
  assert.equal(result.ok, false);
});

await test("Rejects empty entries in Origin allowlist", async () => {
  const result = checkRequestOrigin(
    makeRequest(ALLOWED),
    makeEnv(ALLOWED + ",")
  );
  assert.equal(result.ok, false);
});

await test("Supports multiple exact HTTPS Origins", async () => {
  const second = "https://example.github.io";
  const result = checkRequestOrigin(
    makeRequest(second),
    makeEnv(ALLOWED + "," + second)
  );
  assert.equal(result.ok, true);
  assert.equal(result.origin, second);
});

await test("Builds exact CORS headers for an accepted Origin", async () => {
  const policy = checkRequestOrigin(makeRequest(ALLOWED), makeEnv());
  const headers = buildCorsHeaders(policy);

  assert.equal(headers["Access-Control-Allow-Origin"], ALLOWED);
  assert.equal(headers.Vary, "Origin");
  assert.notEqual(headers["Access-Control-Allow-Origin"], "*");
});

await test("Builds safe preflight headers", async () => {
  const policy = checkRequestOrigin(makeRequest(ALLOWED), makeEnv());
  const headers = buildCorsHeaders(policy, { preflight: true });

  assert.equal(headers["Access-Control-Allow-Origin"], ALLOWED);
  assert.equal(headers["Access-Control-Allow-Methods"], "GET, POST, OPTIONS");
  assert.equal(headers["Access-Control-Allow-Headers"], "Content-Type, Authorization");
  assert.equal(headers["Access-Control-Max-Age"], "86400");
});

await test("Rejected Origin cannot produce CORS allow headers", async () => {
  const policy = checkRequestOrigin(
    makeRequest("https://evil.example"),
    makeEnv()
  );
  const headers = buildCorsHeaders(policy, { preflight: true });

  assert.deepEqual(headers, {});
});

await test("Origin security error response contains no wildcard CORS", async () => {
  const policy = checkRequestOrigin(
    makeRequest("https://evil.example"),
    makeEnv()
  );
  const response = originSecurityError(policy);
  const data = await response.json();

  assert.equal(response.status, 403);
  assert.equal(data.error, "ORIGIN_NOT_ALLOWED");
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    null
  );
});

await test("Security configuration explicitly disables wildcard", async () => {
  assert.equal(ANGEL_ONE_ORIGIN_SECURITY_CONFIG.allowsWildcard, false);
  assert.equal(ANGEL_ONE_ORIGIN_SECURITY_CONFIG.requiresHttps, true);
  assert.equal(
    ANGEL_ONE_ORIGIN_SECURITY_CONFIG.requiresOriginForWebSocket,
    true
  );
});

console.log("");
console.log(`ANGEL ONE ORIGIN SECURITY: ${passed}/16 TESTS PASSED`);
assert.equal(passed, 16);
console.log("ANGEL ONE ORIGIN SECURITY TESTS: ALL PASSED");
