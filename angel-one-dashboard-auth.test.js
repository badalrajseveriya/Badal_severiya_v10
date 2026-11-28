/**
 * BADAL SEVERIYA
 * Dashboard Authentication Module Tests
 * Version: 1.0
 *
 * Run:
 * node angel-one-dashboard-auth.test.js
 */

import assert from "node:assert/strict";

import {
  dashboardLogin,
  validateDashboardSession,
  dashboardLogout,
  ANGEL_ONE_DASHBOARD_AUTH_CONFIG
} from "./angel-one-dashboard-auth.js";

const TEST_PASSWORD = "Test-Password-Only-For-Unit-Tests-123";

function createMockEnvironment(options = {}) {
  const sessions = new Map();
  const rateLimits = new Map();

  const state = {
    sessionCreateCalls: 0,
    sessionValidateCalls: 0,
    sessionRevokeCalls: 0,
    rateFailureCalls: 0,
    rateClearCalls: 0,
    storedSessionTokens: [],
    failDurableObject: Boolean(options.failDurableObject)
  };

  const mockStub = {
    async fetch(url, init = {}) {
      if (state.failDurableObject) {
        return new Response(
          JSON.stringify({ ok: false }),
          { status: 503 }
        );
      }

      const path = new URL(url).pathname;
      const body = init.body
        ? JSON.parse(init.body)
        : {};

      if (path === "/internal/auth/rate-check") {
        const record = rateLimits.get(body.rateKey);
        const now = Date.now();

        if (!record) {
          return jsonResponse({
            ok: true,
            allowed: true,
            retryAfterSeconds: 0
          });
        }

        if (record.lockUntil > now) {
          return jsonResponse({
            ok: true,
            allowed: false,
            retryAfterSeconds: Math.ceil(
              (record.lockUntil - now) / 1000
            )
          });
        }

        if (
          now - record.windowStart >=
          body.config.windowMs
        ) {
          rateLimits.delete(body.rateKey);

          return jsonResponse({
            ok: true,
            allowed: true,
            retryAfterSeconds: 0
          });
        }

        return jsonResponse({
          ok: true,
          allowed: record.failures <
            body.config.maxAttempts,
          retryAfterSeconds: 0
        });
      }

      if (path === "/internal/auth/rate-failure") {
        state.rateFailureCalls++;

        const now = Date.now();
        const config = body.config;
        let record = rateLimits.get(body.rateKey);

        if (
          !record ||
          now - record.windowStart >= config.windowMs
        ) {
          record = {
            failures: 0,
            windowStart: now,
            lockUntil: 0
          };
        }

        record.failures++;

        if (record.failures >= config.maxAttempts) {
          record.lockUntil = now + config.lockoutMs;
        }

        rateLimits.set(body.rateKey, record);

        return jsonResponse({
          ok: true,
          failures: record.failures,
          locked: record.lockUntil > now
        });
      }

      if (path === "/internal/auth/rate-clear") {
        state.rateClearCalls++;
        rateLimits.delete(body.rateKey);

        return jsonResponse({
          ok: true
        });
      }

      if (path === "/internal/auth/session-create") {
        state.sessionCreateCalls++;

        if (
          typeof body.token !== "string" ||
          !body.token ||
          !Number.isFinite(body.createdAt) ||
          !Number.isFinite(body.expiresAt) ||
          body.expiresAt <= body.createdAt
        ) {
          return jsonResponse({
            ok: false,
            error: "INVALID_SESSION"
          }, 400);
        }

        sessions.set(body.token, {
          createdAt: body.createdAt,
          expiresAt: body.expiresAt
        });

        state.storedSessionTokens.push(body.token);

        return jsonResponse({
          ok: true
        });
      }

      if (path === "/internal/auth/session-validate") {
        state.sessionValidateCalls++;

        const session = sessions.get(body.token);

        if (!session) {
          return jsonResponse({
            ok: true,
            valid: false
          });
        }

        if (body.now >= session.expiresAt) {
          sessions.delete(body.token);

          return jsonResponse({
            ok: true,
            valid: false
          });
        }

        return jsonResponse({
          ok: true,
          valid: true,
          expiresAt: new Date(
            session.expiresAt
          ).toISOString()
        });
      }

      if (path === "/internal/auth/session-revoke") {
        state.sessionRevokeCalls++;
        sessions.delete(body.token);

        return jsonResponse({
          ok: true
        });
      }

      return jsonResponse({
        ok: false,
        error: "UNKNOWN_INTERNAL_ROUTE"
      }, 404);
    }
  };

  const env = {
    DASHBOARD_ACCESS_PASSWORD:
      options.password ?? TEST_PASSWORD,

    SMARTAPI_SESSION: {
      idFromName(name) {
        assert.equal(name, "primary");
        return "mock-primary";
      },

      get(id) {
        assert.equal(id, "mock-primary");
        return mockStub;
      }
    }
  };

  if (options.noDurableObject) {
    delete env.SMARTAPI_SESSION;
  }

  return {
    env,
    sessions,
    rateLimits,
    state
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function createLoginRequest(password) {
  return new Request(
    "https://worker.example/api/auth/login",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.10"
      },
      body: JSON.stringify({
        password
      })
    }
  );
}

function createSessionRequest(token) {
  return new Request(
    "https://worker.example/api/protected",
    {
      method: "GET",
      headers: {
        "X-Dashboard-Session": token
      }
    }
  );
}

async function responseJson(response) {
  return response.json();
}

const tests = [];

function test(name, fn) {
  tests.push({
    name,
    fn
  });
}

test("Config: session expires after 20 minutes", () => {
  assert.equal(
    ANGEL_ONE_DASHBOARD_AUTH_CONFIG.sessionDurationMs,
    20 * 60 * 1000
  );
});

test("Config: persistent browser storage is disabled", () => {
  assert.equal(
    ANGEL_ONE_DASHBOARD_AUTH_CONFIG.persistentBrowserSession,
    false
  );

  assert.equal(
    ANGEL_ONE_DASHBOARD_AUTH_CONFIG.usesLocalStorage,
    false
  );

  assert.equal(
    ANGEL_ONE_DASHBOARD_AUTH_CONFIG.usesSessionStorage,
    false
  );

  assert.equal(
    ANGEL_ONE_DASHBOARD_AUTH_CONFIG.usesCookies,
    false
  );
});

test("Config: authentication requires password and Durable Object", () => {
  assert.equal(
    ANGEL_ONE_DASHBOARD_AUTH_CONFIG.passwordRequired,
    true
  );

  assert.equal(
    ANGEL_ONE_DASHBOARD_AUTH_CONFIG.requiresDurableObject,
    true
  );
});

test("Login: correct password creates a temporary session", async () => {
  const mock = createMockEnvironment();

  const response = await dashboardLogin(
    createLoginRequest(TEST_PASSWORD),
    mock.env
  );

  assert.equal(response.status, 200);

  const data = await responseJson(response);

  assert.equal(data.ok, true);
  assert.equal(data.version, "1.0");
  assert.equal(typeof data.sessionToken, "string");
  assert.ok(data.sessionToken.length > 20);
  assert.equal(data.expiresInSeconds, 1200);

  assert.equal(
    mock.state.sessionCreateCalls,
    1
  );

  assert.equal(
    mock.state.rateClearCalls,
    1
  );
});

test("Login: wrong password is rejected", async () => {
  const mock = createMockEnvironment();

  const response = await dashboardLogin(
    createLoginRequest("wrong-password"),
    mock.env
  );

  assert.equal(response.status, 401);

  const data = await responseJson(response);

  assert.equal(data.ok, false);
  assert.equal(data.error, "INVALID_LOGIN");

  assert.equal(
    mock.state.sessionCreateCalls,
    0
  );

  assert.equal(
    mock.state.rateFailureCalls,
    1
  );
});

test("Login: five failed attempts activate rate limit", async () => {
  const mock = createMockEnvironment();

  for (let i = 0; i < 5; i++) {
    const response = await dashboardLogin(
      createLoginRequest("wrong-password"),
      mock.env
    );

    assert.equal(response.status, 401);
  }

  const blockedResponse = await dashboardLogin(
    createLoginRequest(TEST_PASSWORD),
    mock.env
  );

  assert.equal(blockedResponse.status, 429);

  const data = await responseJson(blockedResponse);

  assert.equal(data.ok, false);
  assert.equal(data.error, "LOGIN_RATE_LIMITED");
  assert.ok(data.retryAfterSeconds >= 1);

  assert.equal(
    mock.state.sessionCreateCalls,
    0
  );
});

test("Login: empty password is rejected", async () => {
  const mock = createMockEnvironment();

  const response = await dashboardLogin(
    createLoginRequest(""),
    mock.env
  );

  assert.equal(response.status, 400);

  const data = await responseJson(response);

  assert.equal(data.error, "INVALID_LOGIN");
});

test("Login: oversized password is rejected", async () => {
  const mock = createMockEnvironment();

  const response = await dashboardLogin(
    createLoginRequest("A".repeat(257)),
    mock.env
  );

  assert.equal(response.status, 400);

  const data = await responseJson(response);

  assert.equal(data.error, "INVALID_LOGIN");
});

test("Login: malformed JSON is rejected", async () => {
  const mock = createMockEnvironment();

  const request = new Request(
    "https://worker.example/api/auth/login",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.10"
      },
      body: "{ invalid json"
    }
  );

  const response = await dashboardLogin(
    request,
    mock.env
  );

  assert.equal(response.status, 400);
});

test("Login: missing password configuration fails closed", async () => {
  const mock = createMockEnvironment({
    password: ""
  });

  const response = await dashboardLogin(
    createLoginRequest(TEST_PASSWORD),
    mock.env
  );

  assert.equal(response.status, 503);

  const data = await responseJson(response);

  assert.equal(
    data.error,
    "DASHBOARD_PASSWORD_NOT_CONFIGURED"
  );
});

test("Login: unavailable Durable Object fails closed", async () => {
  const mock = createMockEnvironment({
    failDurableObject: true
  });

  const response = await dashboardLogin(
    createLoginRequest(TEST_PASSWORD),
    mock.env
  );

  assert.equal(response.status, 503);

  const data = await responseJson(response);

  assert.equal(
    data.error,
    "AUTH_RATE_LIMITER_UNAVAILABLE"
  );

  assert.equal(
    mock.state.sessionCreateCalls,
    0
  );
});

test("Login: missing Durable Object binding fails closed", async () => {
  const mock = createMockEnvironment({
    noDurableObject: true
  });

  const response = await dashboardLogin(
    createLoginRequest(TEST_PASSWORD),
    mock.env
  );

  assert.equal(response.status, 503);

  const data = await responseJson(response);

  assert.equal(
    data.error,
    "AUTH_RATE_LIMITER_UNAVAILABLE"
  );
});

test("Login: unsupported method is rejected", async () => {
  const mock = createMockEnvironment();

  const request = new Request(
    "https://worker.example/api/auth/login",
    {
      method: "GET"
    }
  );

  const response = await dashboardLogin(
    request,
    mock.env
  );

  assert.equal(response.status, 405);
});

test("Session: valid token is accepted", async () => {
  const mock = createMockEnvironment();

  const loginResponse = await dashboardLogin(
    createLoginRequest(TEST_PASSWORD),
    mock.env
  );

  const loginData = await responseJson(loginResponse);

  const validation = await validateDashboardSession(
    createSessionRequest(loginData.sessionToken),
    mock.env
  );

  assert.equal(validation.ok, true);
  assert.ok(validation.expiresAt);
});

test("Session: missing token is rejected", async () => {
  const mock = createMockEnvironment();

  const request = createSessionRequest("");

  const validation = await validateDashboardSession(
    request,
    mock.env
  );

  assert.equal(validation.ok, false);
  assert.equal(validation.status, 401);
  assert.equal(
    validation.error,
    "DASHBOARD_SESSION_REQUIRED"
  );
});

test("Session: unknown token is rejected", async () => {
  const mock = createMockEnvironment();

  const validation = await validateDashboardSession(
    createSessionRequest("unknown-token"),
    mock.env
  );

  assert.equal(validation.ok, false);
  assert.equal(validation.status, 401);
  assert.equal(
    validation.error,
    "DASHBOARD_SESSION_INVALID"
  );
});

test("Session: expired token is rejected", async () => {
  const mock = createMockEnvironment();

  const loginResponse = await dashboardLogin(
    createLoginRequest(TEST_PASSWORD),
    mock.env
  );

  const loginData = await responseJson(loginResponse);

  const session = mock.sessions.get(
    loginData.sessionToken
  );

  session.expiresAt = Date.now() - 1000;

  const validation = await validateDashboardSession(
    createSessionRequest(loginData.sessionToken),
    mock.env
  );

  assert.equal(validation.ok, false);
  assert.equal(validation.status, 401);
  assert.equal(
    validation.error,
    "DASHBOARD_SESSION_INVALID"
  );

  assert.equal(
    mock.sessions.has(loginData.sessionToken),
    false
  );
});

test("Session: validation fails closed when Durable Object unavailable", async () => {
  const mock = createMockEnvironment({
    failDurableObject: true
  });

  const validation = await validateDashboardSession(
    createSessionRequest("some-token"),
    mock.env
  );

  assert.equal(validation.ok, false);
  assert.equal(validation.status, 503);
  assert.equal(
    validation.error,
    "SESSION_VALIDATION_UNAVAILABLE"
  );
});

test("Logout: revokes session token", async () => {
  const mock = createMockEnvironment();

  const loginResponse = await dashboardLogin(
    createLoginRequest(TEST_PASSWORD),
    mock.env
  );

  const loginData = await responseJson(loginResponse);

  const logoutRequest = new Request(
    "https://worker.example/api/auth/logout",
    {
      method: "POST",
      headers: {
        "X-Dashboard-Session":
          loginData.sessionToken
      }
    }
  );

  const logoutResponse = await dashboardLogout(
    logoutRequest,
    mock.env
  );

  assert.equal(logoutResponse.status, 200);

  const logoutData = await responseJson(
    logoutResponse
  );

  assert.equal(logoutData.ok, true);
  assert.equal(logoutData.status, "LOGGED_OUT");

  assert.equal(
    mock.state.sessionRevokeCalls,
    1
  );

  const validation = await validateDashboardSession(
    createSessionRequest(loginData.sessionToken),
    mock.env
  );

  assert.equal(validation.ok, false);
  assert.equal(validation.status, 401);
});

test("Logout: missing token is safely handled", async () => {
  const mock = createMockEnvironment();

  const request = new Request(
    "https://worker.example/api/auth/logout",
    {
      method: "POST"
    }
  );

  const response = await dashboardLogout(
    request,
    mock.env
  );

  assert.equal(response.status, 200);

  const data = await responseJson(response);

  assert.equal(data.ok, true);
  assert.equal(data.status, "LOGGED_OUT");
});

test("Logout: unsupported method is rejected", async () => {
  const mock = createMockEnvironment();

  const request = new Request(
    "https://worker.example/api/auth/logout",
    {
      method: "GET"
    }
  );

  const response = await dashboardLogout(
    request,
    mock.env
  );

  assert.equal(response.status, 405);
});

test("Security: responses contain no-store cache directives", async () => {
  const mock = createMockEnvironment();

  const response = await dashboardLogin(
    createLoginRequest(TEST_PASSWORD),
    mock.env
  );

  assert.equal(
    response.headers.get("Cache-Control"),
    "no-store"
  );

  assert.equal(
    response.headers.get("Pragma"),
    "no-cache"
  );
});

test("Security: session token is random and not the password", async () => {
  const mock = createMockEnvironment();

  const response = await dashboardLogin(
    createLoginRequest(TEST_PASSWORD),
    mock.env
  );

  const data = await responseJson(response);

  assert.notEqual(
    data.sessionToken,
    TEST_PASSWORD
  );

  assert.ok(
    mock.state.storedSessionTokens.includes(
      data.sessionToken
    )
  );
});

test("Security: session token is not returned on failed login", async () => {
  const mock = createMockEnvironment();

  const response = await dashboardLogin(
    createLoginRequest("wrong-password"),
    mock.env
  );

  const data = await responseJson(response);

  assert.equal(data.ok, false);
  assert.equal(
    Object.hasOwn(data, "sessionToken"),
    false
  );
});

async function run() {
  let passed = 0;
  let failed = 0;

  console.log(
    "\nBADAL SEVERIYA DASHBOARD AUTH TESTS\n"
  );

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
    console.log(
      "DASHBOARD AUTH MODULE: ALL TESTS PASSED"
    );
  }
}

run();
