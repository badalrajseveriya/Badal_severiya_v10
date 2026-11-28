
import assert from "node:assert/strict";

import secureWorker from "./angel-one-smartapi-worker-secure.js";

const ALLOWED_ORIGIN = "https://badalrajseveriya.github.io";

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

function makeRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});

  if (options.origin !== undefined) {
    headers.set("Origin", options.origin);
  }

  return new Request(`https://angel-worker.test${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body
  });
}

function makeEnv(overrides = {}) {
  return {
    APP_ORIGIN: ALLOWED_ORIGIN,
    WORKER_ACCESS_TOKEN: "test-worker-token",

    SMARTAPI_SESSION: {
      idFromName() {
        return "test-session";
      },

      get() {
        return {
          async fetch() {
            return new Response(
              JSON.stringify({
                ok: true,
                status: "MOCK_SESSION_RESPONSE"
              }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/json"
                }
              }
            );
          }
        };
      }
    },

    ...overrides
  };
}

// 1
await test("Accepts exact configured dashboard Origin", async () => {
  const response = await secureWorker.fetch(
    makeRequest("/api/health", {
      origin: ALLOWED_ORIGIN
    }),
    makeEnv()
  );

  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    ALLOWED_ORIGIN
  );
});

// 2
await test("Rejects an unlisted browser Origin before Worker execution", async () => {
  const response = await secureWorker.fetch(
    makeRequest("/api/health", {
      origin: "https://evil.example"
    }),
    makeEnv()
  );

  const data = await response.json();

  assert.equal(response.status, 403);
  assert.equal(data.error, "ORIGIN_NOT_ALLOWED");
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    null
  );
});

// 3
await test("Fails closed when APP_ORIGIN is missing", async () => {
  const response = await secureWorker.fetch(
    makeRequest("/api/health", {
      origin: ALLOWED_ORIGIN
    }),
    makeEnv({
      APP_ORIGIN: ""
    })
  );

  const data = await response.json();

  assert.equal(response.status, 503);
  assert.equal(data.error, "APP_ORIGIN_NOT_CONFIGURED");
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    null
  );
});

// 4
await test("Rejects WebSocket request without Origin", async () => {
  const response = await secureWorker.fetch(
    makeRequest(
      "/api/stream?ticket=00000000-0000-4000-8000-000000000000",
      {
        headers: {
          Upgrade: "websocket"
        }
      }
    ),
    makeEnv()
  );

  const data = await response.json();

  assert.equal(response.status, 403);
  assert.equal(data.error, "ORIGIN_HEADER_REQUIRED");
});

// 5
await test("Rejects WebSocket request from an unlisted Origin", async () => {
  const response = await secureWorker.fetch(
    makeRequest(
      "/api/stream?ticket=00000000-0000-4000-8000-000000000000",
      {
        origin: "https://evil.example",
        headers: {
          Upgrade: "websocket"
        }
      }
    ),
    makeEnv()
  );

  const data = await response.json();

  assert.equal(response.status, 403);
  assert.equal(data.error, "ORIGIN_NOT_ALLOWED");
});

// 6
await test("Valid dashboard Origin reaches public stream ticket validation", async () => {
  const response = await secureWorker.fetch(
    makeRequest("/api/stream?ticket=bad-ticket", {
      origin: ALLOWED_ORIGIN,
      headers: {
        Upgrade: "websocket"
      }
    }),
    makeEnv()
  );

  const data = await response.json();

  assert.equal(response.status, 401);
  assert.equal(data.error, "INVALID_STREAM_TICKET");
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    ALLOWED_ORIGIN
  );
});

// 7
await test("Valid Origin receives safe preflight response", async () => {
  const response = await secureWorker.fetch(
    makeRequest("/api/login", {
      method: "OPTIONS",
      origin: ALLOWED_ORIGIN,
      headers: {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, content-type"
      }
    }),
    makeEnv()
  );

  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    ALLOWED_ORIGIN
  );
  assert.equal(
    response.headers.get("Access-Control-Allow-Methods"),
    "GET, POST, OPTIONS"
  );
  assert.equal(
    response.headers.get("Access-Control-Allow-Headers"),
    "Content-Type, Authorization"
  );
});

// 8
await test("Rejects unsupported preflight method", async () => {
  const response = await secureWorker.fetch(
    makeRequest("/api/login", {
      method: "OPTIONS",
      origin: ALLOWED_ORIGIN,
      headers: {
        "Access-Control-Request-Method": "DELETE"
      }
    }),
    makeEnv()
  );

  const data = await response.json();

  assert.equal(response.status, 403);
  assert.equal(data.error, "CORS_METHOD_NOT_ALLOWED");
});

// 9
await test("Rejects unsupported preflight headers", async () => {
  const response = await secureWorker.fetch(
    makeRequest("/api/login", {
      method: "OPTIONS",
      origin: ALLOWED_ORIGIN,
      headers: {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "x-unknown-secret"
      }
    }),
    makeEnv()
  );

  const data = await response.json();

  assert.equal(response.status, 403);
  assert.equal(data.error, "CORS_HEADER_NOT_ALLOWED");
});

// 10
await test("Removes original wildcard CORS when Origin is absent", async () => {
  const response = await secureWorker.fetch(
    makeRequest("/api/health"),
    makeEnv()
  );

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    null
  );
  assert.notEqual(
    response.headers.get("Access-Control-Allow-Origin"),
    "*"
  );
});

// 11
await test("Protected routes still require Worker access token", async () => {
  const response = await secureWorker.fetch(
    makeRequest("/api/status", {
      origin: ALLOWED_ORIGIN
    }),
    makeEnv()
  );

  const data = await response.json();

  assert.equal(response.status, 401);
  assert.equal(data.error, "UNAUTHORIZED");
  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    ALLOWED_ORIGIN
  );
});

// 12
await test("Unsupported HTTP methods are rejected at security boundary", async () => {
  const response = await secureWorker.fetch(
    makeRequest("/api/health", {
      method: "DELETE",
      origin: ALLOWED_ORIGIN
    }),
    makeEnv()
  );

  const data = await response.json();

  assert.equal(response.status, 405);
  assert.equal(data.error, "METHOD_NOT_ALLOWED");
});

console.log("");
console.log(`ANGEL ONE SECURE WORKER WRAPPER: ${passed}/12 TESTS PASSED`);
assert.equal(passed, 12);
console.log("ANGEL ONE SECURE WORKER WRAPPER TESTS: ALL PASSED");
