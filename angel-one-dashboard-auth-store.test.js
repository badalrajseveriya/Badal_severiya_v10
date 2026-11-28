
/**
 * BADAL SEVERIYA
 * Dashboard Authentication Durable Object Store Tests
 * Version: 1.0
 *
 * Run:
 * node angel-one-dashboard-auth-store.test.js
 */

import assert from "node:assert/strict";
import { DashboardAuthStore } from "./angel-one-dashboard-auth-store.js";

const RATE_KEY = "a".repeat(64);
const TOKEN = "test-session-token-1234567890";

function createMockStorage(options = {}) {
  const data = new Map();
  const state = {
    failStorage: Boolean(options.failStorage),
    transactionCalls: 0
  };

  const storage = {
    async get(key) {
      if (state.failStorage) throw new Error("storage unavailable");
      return data.get(key);
    },

    async put(key, value) {
      if (state.failStorage) throw new Error("storage unavailable");
      data.set(key, structuredClone(value));
    },

    async delete(key) {
      if (state.failStorage) throw new Error("storage unavailable");
      return data.delete(key);
    },

    async transaction(callback) {
      if (state.failStorage) throw new Error("storage unavailable");
      state.transactionCalls++;
      return callback();
    }
  };

  return { storage, data, state };
}

function createStore(options = {}) {
  const mock = createMockStorage(options);
  const store = new DashboardAuthStore(
    { storage: mock.storage },
    {}
  );

  return { ...mock, store };
}

function request(path, body, method = "POST") {
  return new Request(`https://auth-store.test${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined
  });
}

async function json(response) {
  return response.json();
}

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("Store: rejects non-POST methods", async () => {
  const { store } = createStore();
  const response = await store.fetch(request("/internal/auth/rate-check", {}, "GET"));
  assert.equal(response.status, 405);
  assert.equal((await json(response)).error, "METHOD_NOT_ALLOWED");
});

test("Store: malformed JSON rejected", async () => {
  const { store } = createStore();
  const badRequest = new Request("https://auth-store.test/internal/auth/rate-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{bad json"
  });
  const response = await store.fetch(badRequest);
  assert.equal(response.status, 400);
  assert.equal((await json(response)).error, "INVALID_JSON");
});

test("Rate limit: initial check allows five attempts", async () => {
  const { store } = createStore();
  const response = await store.fetch(request("/internal/auth/rate-check", {
    rateKey: RATE_KEY
  }));
  const result = await json(response);
  assert.equal(response.status, 200);
  assert.equal(result.allowed, true);
  assert.equal(result.remainingAttempts, 5);
});

test("Rate limit: increments failures and locks after fifth", async () => {
  const { store } = createStore();

  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await store.fetch(request("/internal/auth/rate-failure", {
      rateKey: RATE_KEY
    }));
    const result = await json(response);
    assert.equal(response.status, 200);
    assert.equal(result.failures, attempt);
  }

  const check = await store.fetch(request("/internal/auth/rate-check", {
    rateKey: RATE_KEY
  }));
  const result = await json(check);
  assert.equal(result.allowed, false);
  assert.equal(result.remainingAttempts, 0);
  assert.ok(result.retryAfterSeconds > 0);
});

test("Rate limit: clear resets failed attempts", async () => {
  const { store } = createStore();

  await store.fetch(request("/internal/auth/rate-failure", { rateKey: RATE_KEY }));
  await store.fetch(request("/internal/auth/rate-failure", { rateKey: RATE_KEY }));

  const cleared = await store.fetch(request("/internal/auth/rate-clear", {
    rateKey: RATE_KEY
  }));
  assert.equal((await json(cleared)).ok, true);

  const check = await store.fetch(request("/internal/auth/rate-check", {
    rateKey: RATE_KEY
  }));
  const result = await json(check);
  assert.equal(result.allowed, true);
  assert.equal(result.remainingAttempts, 5);
});

test("Rate limit: invalid rate key rejected", async () => {
  const { store } = createStore();
  const response = await store.fetch(request("/internal/auth/rate-check", {
    rateKey: "not-a-valid-hash"
  }));
  assert.equal(response.status, 400);
  assert.equal((await json(response)).error, "INVALID_RATE_KEY");
});

test("Session: valid token created and validated", async () => {
  const { store } = createStore();

  const created = await store.fetch(request("/internal/auth/session-create", {
    token: TOKEN,
    createdAt: -1,
    expiresAt: -1
  }));
  const createdData = await json(created);

  assert.equal(created.status, 200);
  assert.equal(createdData.ok, true);
  assert.ok(createdData.expiresAt);

  const validation = await store.fetch(request("/internal/auth/session-validate", {
    token: TOKEN
  }));
  const validationData = await json(validation);
  assert.equal(validationData.valid, true);
  assert.ok(validationData.expiresAt);
});

test("Session: invalid token rejected on creation", async () => {
  const { store } = createStore();
  const response = await store.fetch(request("/internal/auth/session-create", {
    token: "short"
  }));
  assert.equal(response.status, 400);
  assert.equal((await json(response)).error, "INVALID_SESSION_TOKEN");
});

test("Session: expired session is invalid and removed", async () => {
  const { store, data } = createStore();

  await store.fetch(request("/internal/auth/session-create", {
    token: TOKEN
  }));

  data.set(`auth-session:${TOKEN}`, {
    createdAt: Date.now() - 10000,
    expiresAt: Date.now() - 1000,
    version: "1.1"
  });

  const response = await store.fetch(request("/internal/auth/session-validate", {
    token: TOKEN
  }));
  const result = await json(response);

  assert.equal(result.valid, false);
  assert.equal(data.has(`auth-session:${TOKEN}`), false);
});

test("Session: revocation invalidates token", async () => {
  const { store } = createStore();

  await store.fetch(request("/internal/auth/session-create", {
    token: TOKEN
  }));

  const revoked = await store.fetch(request("/internal/auth/session-revoke", {
    token: TOKEN
  }));
  assert.equal((await json(revoked)).revoked, true);

  const validation = await store.fetch(request("/internal/auth/session-validate", {
    token: TOKEN
  }));
  assert.equal((await json(validation)).valid, false);
});

test("Session: malformed token validation safely returns invalid", async () => {
  const { store } = createStore();
  const response = await store.fetch(request("/internal/auth/session-validate", {
    token: "bad"
  }));
  const result = await json(response);
  assert.equal(response.status, 200);
  assert.equal(result.valid, false);
});

test("Store: storage failure fails closed with HTTP 500", async () => {
  const { store } = createStore({ failStorage: true });
  const response = await store.fetch(request("/internal/auth/session-validate", {
    token: TOKEN
  }));
  assert.equal(response.status, 500);
  assert.equal((await json(response)).error, "AUTH_STORE_INTERNAL_ERROR");
});

test("Security: response headers prevent caching", async () => {
  const { store } = createStore();
  const response = await store.fetch(request("/internal/auth/rate-check", {
    rateKey: RATE_KEY
  }));
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Pragma"), "no-cache");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
});

test("Store: unknown internal route returns 404", async () => {
  const { store } = createStore();
  const response = await store.fetch(request("/internal/auth/unknown", {}));
  assert.equal(response.status, 404);
  assert.equal((await json(response)).error, "AUTH_STORE_ROUTE_NOT_FOUND");
});

async function run() {
  let passed = 0;
  let failed = 0;

  console.log("\nBADAL SEVERIYA DASHBOARD AUTH STORE TESTS\n");

  for (const item of tests) {
    try {
      await item.fn();
      passed++;
      console.log(`PASS: ${item.name}`);
    } catch (error) {
      failed++;
      console.error(`FAIL: ${item.name}`);
      console.error(error);
    }
  }

  console.log("\n------------------------------");
  console.log(`TOTAL: ${tests.length}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log("------------------------------\n");

  if (failed > 0) {
    process.exitCode = 1;
  } else {
    console.log("AUTH STORE: ALL TESTS PASSED");
  }
}

run();
