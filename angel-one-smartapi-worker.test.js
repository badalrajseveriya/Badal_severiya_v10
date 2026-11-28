
import assert from "node:assert/strict";

import worker, {
  AngelOneSmartApiSession
} from "./angel-one-smartapi-worker.js";

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

function request(path, options = {}) {
  return new Request(`https://angel-worker.test${path}`, {
    method: options.method || "GET",
    headers: options.headers || {},
    body: options.body === undefined
      ? undefined
      : typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body)
  });
}

function authHeaders() {
  return {
    Authorization: "Bearer test-worker-access-token",
    "Content-Type": "application/json"
  };
}

function makeStorage() {
  const values = new Map();
  let alarm = null;

  return {
    values,

    async get(key) {
      return values.get(key);
    },

    async put(key, value) {
      values.set(key, value);
    },

    async delete(key) {
      return values.delete(key);
    },

    async setAlarm(timestamp) {
      alarm = timestamp;
    },

    async getAlarm() {
      return alarm;
    },

    async deleteAlarm() {
      alarm = null;
    }
  };
}

function makeContext() {
  const storage = makeStorage();
  const sockets = [];

  return {
    storage,
    sockets,

    acceptWebSocket(socket) {
      sockets.push(socket);
    },

    getWebSockets() {
      return sockets;
    }
  };
}

function makeEnv(overrides = {}) {
  return {
    WORKER_ACCESS_TOKEN: "test-worker-access-token",
    APP_ORIGIN: "https://badal-severiya.test",

    ANGEL_API_KEY: "test-api-key",
    ANGEL_CLIENT_CODE: "TESTCLIENT",
    ANGEL_PIN: "1234",
    ANGEL_MAC_ADDRESS: "00:11:22:33:44:55",
    ANGEL_CLIENT_LOCAL_IP: "192.168.1.10",
    ANGEL_CLIENT_PUBLIC_IP: "203.0.113.10",

    SMARTAPI_SESSION: {
      idFromName: () => "test-session-id",
      get: () => ({
        fetch: async () => new Response(
          JSON.stringify({ ok: true }),
          { status: 200 }
        )
      })
    },

    ...overrides
  };
}

function sessionData() {
  return {
    jwtToken: "mock-jwt-token",
    refreshToken: "mock-refresh-token",
    feedToken: "mock-feed-token",
    clientCode: "TESTCLIENT",
    apiKey: "test-api-key"
  };
}

class FakeSocket {
  constructor() {
    this.readyState = 1;
    this.binaryType = "arraybuffer";
    this.sent = [];
    this.closed = false;
    this.listeners = new Map();
  }

  accept() {}

  send(data) {
    if (this.readyState !== 1) {
      throw new Error("Socket is not open.");
    }

    this.sent.push(data);
  }

  close(code = 1000, reason = "") {
    this.closed = true;
    this.readyState = 3;
    this.closeCode = code;
    this.closeReason = reason;
  }

  addEventListener(name, callback) {
    if (!this.listeners.has(name)) {
      this.listeners.set(name, []);
    }

    this.listeners.get(name).push(callback);
  }

  emit(name, event = {}) {
    for (const callback of this.listeners.get(name) || []) {
      callback(event);
    }
  }
}

function makePair() {
  const client = new FakeSocket();
  const server = new FakeSocket();

  globalThis.WebSocketPair = class {
    constructor() {
      return {
        0: client,
        1: server
      };
    }
  };

  return { client, server };
}

// 1
await test("Health endpoint reports Worker 12.4", async () => {
  const response = await worker.fetch(
    request("/api/health"),
    makeEnv()
  );

  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.version, "12.4");
  assert.equal(data.mode, "MARKET_DATA_ONLY");
  assert.equal(data.tradingOrdersEnabled, false);
});

// 2
await test("Health endpoint does not expose secrets", async () => {
  const response = await worker.fetch(
    request("/api/health"),
    makeEnv()
  );

  const body = await response.text();

  assert.equal(body.includes("test-api-key"), false);
  assert.equal(body.includes("1234"), false);
  assert.equal(body.includes("test-worker-access-token"), false);
});

// 3
await test("Health response has configured CORS origin", async () => {
  const response = await worker.fetch(
    request("/api/health"),
    makeEnv()
  );

  assert.equal(
    response.headers.get("Access-Control-Allow-Origin"),
    "https://badal-severiya.test"
  );

  assert.equal(
    response.headers.get("Cache-Control"),
    "no-store"
  );
});

// 4
await test("OPTIONS returns CORS preflight", async () => {
  const response = await worker.fetch(
    request("/api/login", { method: "OPTIONS" }),
    makeEnv()
  );

  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get("Access-Control-Allow-Methods"),
    "GET, POST, OPTIONS"
  );
});

// 5
await test("Protected route rejects missing access token", async () => {
  const response = await worker.fetch(
    request("/api/status"),
    makeEnv()
  );

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "UNAUTHORIZED");
});

// 6
await test("Protected route rejects wrong access token", async () => {
  const response = await worker.fetch(
    request("/api/status", {
      headers: {
        Authorization: "Bearer wrong-token"
      }
    }),
    makeEnv()
  );

  assert.equal(response.status, 401);
});

// 7
await test("Missing Worker access secret rejects protected route", async () => {
  const response = await worker.fetch(
    request("/api/status", {
      headers: authHeaders()
    }),
    makeEnv({
      WORKER_ACCESS_TOKEN: ""
    })
  );

  assert.equal(response.status, 401);
});

// 8
await test("Login rejects invalid TOTP", async () => {
  const response = await worker.fetch(
    request("/api/login", {
      method: "POST",
      headers: authHeaders(),
      body: { totp: "12345" }
    }),
    makeEnv()
  );

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "INVALID_TOTP");
});

// 9
await test("Login rejects malformed JSON", async () => {
  const response = await worker.fetch(
    request("/api/login", {
      method: "POST",
      headers: authHeaders(),
      body: "{invalid-json"
    }),
    makeEnv()
  );

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "INVALID_TOTP");
});

// 10
await test("Login rejects missing Angel One secrets", async () => {
  const response = await worker.fetch(
    request("/api/login", {
      method: "POST",
      headers: authHeaders(),
      body: { totp: "123456" }
    }),
    makeEnv({
      ANGEL_API_KEY: ""
    })
  );

  assert.equal(response.status, 503);
  assert.equal(
    (await response.json()).error,
    "MISSING_CLOUDFLARE_SECRETS"
  );
});

// 11
await test("Login does not accept GET", async () => {
  const response = await worker.fetch(
    request("/api/login", {
      headers: authHeaders()
    }),
    makeEnv()
  );

  assert.equal(response.status, 404);
});

// 12
await test("Provider login failure does not expose tokens", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response(
    JSON.stringify({
      status: false,
      message: "Invalid TOTP",
      errorcode: "AB1001"
    }),
    { status: 200 }
  );

  try {
    const response = await worker.fetch(
      request("/api/login", {
        method: "POST",
        headers: authHeaders(),
        body: { totp: "123456" }
      }),
      makeEnv()
    );

    const data = await response.json();

    assert.equal(response.status, 502);
    assert.equal(data.error, "ANGEL_ONE_LOGIN_FAILED");
    assert.equal(data.jwtToken, undefined);
    assert.equal(data.feedToken, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// 13
await test("Successful login stores credentials server-side only", async () => {
  const originalFetch = globalThis.fetch;
  let loginRequest;
  let storedSession;

  const env = makeEnv({
    SMARTAPI_SESSION: {
      idFromName: () => "test-session-id",
      get: () => ({
        fetch: async (url, options) => {
          storedSession = JSON.parse(options.body);
          return new Response(
            JSON.stringify({ ok: true }),
            { status: 200 }
          );
        }
      })
    }
  });

  globalThis.fetch = async (url, options) => {
    loginRequest = {
      url,
      options,
      body: JSON.parse(options.body)
    };

    return new Response(
      JSON.stringify({
        status: true,
        data: {
          jwtToken: "jwt-secret",
          refreshToken: "refresh-secret",
          feedToken: "feed-secret"
        }
      }),
      { status: 200 }
    );
  };

  try {
    const response = await worker.fetch(
      request("/api/login", {
        method: "POST",
        headers: authHeaders(),
        body: { totp: "123456" }
      }),
      env
    );

    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.status, "AUTHENTICATED");
    assert.equal(data.credentialsReturnedToBrowser, false);

    assert.equal(loginRequest.body.clientcode, "TESTCLIENT");
    assert.equal(loginRequest.body.password, "1234");
    assert.equal(loginRequest.body.totp, "123456");

    assert.equal(
      loginRequest.options.headers["X-PrivateKey"],
      "test-api-key"
    );

    assert.equal(
      loginRequest.options.headers["X-ClientLocalIP"],
      "192.168.1.10"
    );

    assert.equal(
      loginRequest.options.headers["X-ClientPublicIP"],
      "203.0.113.10"
    );

    assert.equal(storedSession.jwtToken, "jwt-secret");
    assert.equal(storedSession.refreshToken, "refresh-secret");
    assert.equal(storedSession.feedToken, "feed-secret");

    assert.equal(data.jwtToken, undefined);
    assert.equal(data.refreshToken, undefined);
    assert.equal(data.feedToken, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// 14
await test("Durable Object rejects incomplete session", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});

  const response = await session.fetch(
    request("/internal/session", {
      method: "POST",
      body: { jwtToken: "jwt" }
    })
  );

  assert.equal(response.status, 400);
  assert.equal(
    (await response.json()).error,
    "INVALID_SESSION_DATA"
  );
});

// 15
await test("Durable Object stores complete session", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});

  const response = await session.fetch(
    request("/internal/session", {
      method: "POST",
      body: sessionData()
    })
  );

  const saved = await ctx.storage.get("smartapi_session");

  assert.equal(response.status, 200);
  assert.equal(saved.jwtToken, "mock-jwt-token");
  assert.equal(saved.feedToken, "mock-feed-token");
});

// 16
await test("Connect refuses unauthenticated session", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});

  const response = await session.fetch(
    request("/internal/connect", { method: "POST" })
  );

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "NOT_AUTHENTICATED");
});

// 17
await test("Status reports unauthenticated and disconnected", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});

  const response = await session.fetch(
    request("/internal/status")
  );

  const data = await response.json();

  assert.equal(data.status, "DISCONNECTED");
  assert.equal(data.authenticated, false);
  assert.equal(data.tradingOrdersEnabled, false);
});

// 18
await test("Stream ticket requires authenticated session", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});

  const response = await session.fetch(
    request("/internal/ticket", { method: "POST" })
  );

  assert.equal(response.status, 401);
  assert.equal(
    (await response.json()).error,
    "NOT_AUTHENTICATED"
  );
});

// 19
await test("Stream ticket is one-time and expires", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});

  await ctx.storage.put("smartapi_session", sessionData());

  const ticketResponse = await session.fetch(
    request("/internal/ticket", { method: "POST" })
  );

  const ticketData = await ticketResponse.json();

  assert.equal(ticketResponse.status, 200);
  assert.equal(ticketData.expiresInSeconds, 60);

  const key = `ticket:${ticketData.ticket}`;
  assert.ok(await ctx.storage.get(key));

  const pair = makePair();
  const NativeResponse = globalThis.Response;

  class WorkerCompatibleResponse extends NativeResponse {
    constructor(body, init = {}) {
      if (init.status === 101) {
        super(null, { status: 200 });
        this.workerWebSocketStatus = 101;
        this.webSocket = init.webSocket;
      } else {
        super(body, init);
        this.workerWebSocketStatus = null;
      }
    }

    get status() {
      return this.workerWebSocketStatus ?? super.status;
    }
  }

  try {
    globalThis.Response = WorkerCompatibleResponse;

    const streamResponse = await session.fetch(
      request(`/internal/stream?ticket=${ticketData.ticket}`, {
        headers: { Upgrade: "websocket" }
      })
    );

    assert.equal(streamResponse.status, 101);
    assert.equal(streamResponse.webSocket, pair.client);
    assert.equal(await ctx.storage.get(key), undefined);
    assert.equal(ctx.sockets.length, 1);

    const secondResponse = await session.fetch(
      request(`/internal/stream?ticket=${ticketData.ticket}`, {
        headers: { Upgrade: "websocket" }
      })
    );

    assert.equal(secondResponse.status, 401);
  } finally {
    globalThis.Response = NativeResponse;
  }
});

// 20
await test("Internal stream rejects non-WebSocket request", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});

  const response = await session.fetch(
    request("/internal/stream?ticket=invalid")
  );

  assert.equal(response.status, 426);
});

// 21
await test("Public stream rejects request without WebSocket upgrade", async () => {
  const response = await worker.fetch(
    request("/api/stream?ticket=00000000-0000-4000-8000-000000000000"),
    makeEnv()
  );

  assert.equal(response.status, 426);
  assert.equal(
    (await response.json()).error,
    "WEBSOCKET_UPGRADE_REQUIRED"
  );
});

// 22
await test("Public stream rejects malformed ticket", async () => {
  const response = await worker.fetch(
    request("/api/stream?ticket=bad", {
      headers: { Upgrade: "websocket" }
    }),
    makeEnv()
  );

  assert.equal(response.status, 401);
  assert.equal(
    (await response.json()).error,
    "INVALID_STREAM_TICKET"
  );
});

// 23
await test("Public stream forwards valid ticket without Bearer header", async () => {
  let forwardedUrl = "";
  let forwardedHeaders = null;

  const env = makeEnv({
    SMARTAPI_SESSION: {
      idFromName: () => "test-id",
      get: () => ({
        fetch: async (url, options) => {
          forwardedUrl = url;
          forwardedHeaders = options.headers;

          return new Response("mock-stream", { status: 200 });
        }
      })
    }
  });

  const ticket = "00000000-0000-4000-8000-000000000000";

  const response = await worker.fetch(
    request(`/api/stream?ticket=${ticket}`, {
      headers: { Upgrade: "websocket" }
    }),
    env
  );

  assert.equal(response.status, 200);
  assert.match(forwardedUrl, /internal\/stream/);
  assert.match(forwardedUrl, new RegExp(ticket));
  assert.equal(forwardedHeaders.Upgrade, "websocket");
});

// 24
await test("Public stream-ticket route requires access token", async () => {
  const response = await worker.fetch(
    request("/api/stream-ticket", {
      method: "POST"
    }),
    makeEnv()
  );

  assert.equal(response.status, 401);
});

// 25
await test("Public stream-ticket route forwards authorized request", async () => {
  let forwardedUrl = "";

  const env = makeEnv({
    SMARTAPI_SESSION: {
      idFromName: () => "test-id",
      get: () => ({
        fetch: async url => {
          forwardedUrl = url;

          return new Response(
            JSON.stringify({
              ok: true,
              ticket: "test-ticket",
              expiresInSeconds: 60
            }),
            { status: 200 }
          );
        }
      })
    }
  });

  const response = await worker.fetch(
    request("/api/stream-ticket", {
      method: "POST",
      headers: authHeaders()
    }),
    env
  );

  assert.equal(response.status, 200);
  assert.match(forwardedUrl, /internal\/ticket/);
  assert.equal((await response.json()).ticket, "test-ticket");
});

// 26
await test("Subscription rejects invalid JSON", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});
  const client = new FakeSocket();

  await session.webSocketMessage(client, "{invalid");

  const data = JSON.parse(client.sent[0]);

  assert.equal(data.type, "error");
  assert.equal(data.error, "INVALID_SUBSCRIPTION_JSON");
});

// 27
await test("Subscription rejects unsupported exchange", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});
  const client = new FakeSocket();

  await session.webSocketMessage(
    client,
    JSON.stringify({
      action: 1,
      params: {
        mode: 2,
        tokenList: [{
          exchangeType: 2,
          tokens: ["99926000"]
        }]
      }
    })
  );

  assert.equal(
    JSON.parse(client.sent[0]).error,
    "ONLY_VALID_NSE_CASH_TOKENS_ALLOWED"
  );
});

// 28
await test("Subscription rejects non-numeric token", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});
  const client = new FakeSocket();

  await session.webSocketMessage(
    client,
    JSON.stringify({
      action: 1,
      params: {
        mode: 2,
        tokenList: [{
          exchangeType: 1,
          tokens: ["NIFTY"]
        }]
      }
    })
  );

  assert.equal(
    JSON.parse(client.sent[0]).error,
    "ONLY_VALID_NSE_CASH_TOKENS_ALLOWED"
  );
});

// 29
await test("Subscription is blocked without upstream connection", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});
  const client = new FakeSocket();

  await session.webSocketMessage(
    client,
    JSON.stringify({
      action: 1,
      params: {
        mode: 2,
        tokenList: [{
          exchangeType: 1,
          tokens: ["99926000"]
        }]
      }
    })
  );

  assert.equal(
    JSON.parse(client.sent[0]).error,
    "ANGEL_ONE_FEED_NOT_CONNECTED"
  );
});

// 30
await test("Order-related action is rejected", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});
  const client = new FakeSocket();

  await session.webSocketMessage(
    client,
    JSON.stringify({
      action: 2,
      params: {
        mode: 2,
        tokenList: [{
          exchangeType: 1,
          tokens: ["99926000"]
        }]
      }
    })
  );

  assert.equal(
    JSON.parse(client.sent[0]).error,
    "INVALID_SUBSCRIPTION_REQUEST"
  );
});

// 31
await test("Disconnect disables connection request", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});

  await ctx.storage.put("connection_wanted", true);

  const response = await session.fetch(
    request("/internal/disconnect", { method: "POST" })
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "DISCONNECTED");
  assert.equal(await ctx.storage.get("connection_wanted"), false);
});

// 32
await test("Connect route does not accept GET", async () => {
  const response = await worker.fetch(
    request("/api/connect", {
      headers: authHeaders()
    }),
    makeEnv()
  );

  assert.equal(response.status, 404);
});

// 33
await test("Status route does not accept POST", async () => {
  const response = await worker.fetch(
    request("/api/status", {
      method: "POST",
      headers: authHeaders()
    }),
    makeEnv()
  );

  assert.equal(response.status, 404);
});

// 34
await test("Status route forwards request to Durable Object", async () => {
  let forwardedUrl = "";

  const env = makeEnv({
    SMARTAPI_SESSION: {
      idFromName: name => {
        assert.equal(name, "primary");
        return "test-id";
      },

      get: id => {
        assert.equal(id, "test-id");

        return {
          fetch: async url => {
            forwardedUrl = url;

            return new Response(
              JSON.stringify({
                ok: true,
                status: "CONNECTED",
                authenticated: true
              }),
              { status: 200 }
            );
          }
        };
      }
    }
  });

  const response = await worker.fetch(
    request("/api/status", {
      headers: authHeaders()
    }),
    env
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "CONNECTED");
  assert.match(forwardedUrl, /internal\/status/);
});

// 35
await test("Worker returns 404 for unknown route", async () => {
  const response = await worker.fetch(
    request("/api/not-real", {
      headers: authHeaders()
    }),
    makeEnv()
  );

  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "NOT_FOUND");
});

// 36
await test("Internal disconnect does not enable trading", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});

  const response = await session.fetch(
    request("/internal/status")
  );

  const data = await response.json();

  assert.equal(data.tradingOrdersEnabled, false);
});

// 37
await test("Stream route rejects malformed UUID ticket", async () => {
  const response = await worker.fetch(
    request("/api/stream?ticket=bad-ticket", {
      headers: { Upgrade: "websocket" }
    }),
    makeEnv()
  );

  assert.equal(response.status, 401);
});

// 38
await test("Expired ticket is rejected by Durable Object", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});

  const ticket = "00000000-0000-4000-8000-000000000000";

  await ctx.storage.put(`ticket:${ticket}`, {
    expiresAt: Date.now() - 1000
  });

  const response = await session.fetch(
    request(`/internal/stream?ticket=${ticket}`, {
      headers: { Upgrade: "websocket" }
    })
  );

  assert.equal(response.status, 401);
  assert.equal(
    (await response.json()).error,
    "STREAM_TICKET_EXPIRED"
  );
});

// 39
await test("NSE subscription accepts only supported market modes", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});
  const client = new FakeSocket();

  await session.webSocketMessage(
    client,
    JSON.stringify({
      action: 1,
      params: {
        mode: 4,
        tokenList: [{
          exchangeType: 1,
          tokens: ["99926000"]
        }]
      }
    })
  );

  assert.equal(
    JSON.parse(client.sent[0]).error,
    "INVALID_SUBSCRIPTION_REQUEST"
  );
});

// 40
await test("Worker version is fixed at 12.4", async () => {
  const response = await worker.fetch(
    request("/api/health"),
    makeEnv()
  );

  const data = await response.json();

  assert.equal(data.version, "12.4");
  assert.equal(data.tradingOrdersEnabled, false);
});

console.log("");
console.log(`ANGEL ONE SMARTAPI WORKER: ${passed}/40 TESTS PASSED`);
assert.equal(passed, 40);
console.log("ANGEL ONE SMARTAPI WORKER TESTS: ALL PASSED");
