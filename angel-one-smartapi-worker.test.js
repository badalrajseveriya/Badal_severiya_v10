
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

function makeRequest(path, options = {}) {
  return new Request(`https://angel-worker.test${path}`, {
    method: options.method || "GET",
    headers: options.headers || {},
    body: options.body
      ? JSON.stringify(options.body)
      : undefined
  });
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
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        )
      })
    },
    ...overrides
  };
}

function authHeaders() {
  return {
    Authorization: "Bearer test-worker-access-token",
    "Content-Type": "application/json"
  };
}

function makeStorage() {
  const values = new Map();

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

function makeSessionData() {
  return {
    jwtToken: "mock-jwt-token",
    refreshToken: "mock-refresh-token",
    feedToken: "mock-feed-token",
    clientCode: "TESTCLIENT",
    apiKey: "test-api-key"
  };
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

// ----------------------------------------------------------
// 1. Health endpoint
// ----------------------------------------------------------

await test("Health endpoint is publicly accessible", async () => {
  const response = await worker.fetch(
    makeRequest("/api/health"),
    makeEnv()
  );

  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.version, "12.2");
  assert.equal(data.mode, "MARKET_DATA_ONLY");
  assert.equal(data.tradingOrdersEnabled, false);
});

// ----------------------------------------------------------
// 2. Health response headers
// ----------------------------------------------------------

await test("Health response includes no-store and configured origin", async () => {
  const response = await worker.fetch(
    makeRequest("/api/health"),
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

// ----------------------------------------------------------
// 3. OPTIONS preflight
// ----------------------------------------------------------

await test("OPTIONS request returns CORS preflight", async () => {
  const response = await worker.fetch(
    makeRequest("/api/login", {
      method: "OPTIONS"
    }),
    makeEnv()
  );

  assert.equal(response.status, 204);

  assert.equal(
    response.headers.get("Access-Control-Allow-Methods"),
    "GET, POST, OPTIONS"
  );
});

// ----------------------------------------------------------
// 4. Protected route
// ----------------------------------------------------------

await test("Protected route rejects missing access token", async () => {
  const response = await worker.fetch(
    makeRequest("/api/status"),
    makeEnv()
  );

  const data = await response.json();

  assert.equal(response.status, 401);
  assert.equal(data.error, "UNAUTHORIZED");
});

// ----------------------------------------------------------
// 5. Wrong access token
// ----------------------------------------------------------

await test("Protected route rejects incorrect access token", async () => {
  const response = await worker.fetch(
    makeRequest("/api/status", {
      headers: {
        Authorization: "Bearer wrong-token"
      }
    }),
    makeEnv()
  );

  assert.equal(response.status, 401);
});

// ----------------------------------------------------------
// 6. Missing configured access token
// ----------------------------------------------------------

await test("Missing Worker access secret rejects protected routes", async () => {
  const response = await worker.fetch(
    makeRequest("/api/status", {
      headers: authHeaders()
    }),
    makeEnv({
      WORKER_ACCESS_TOKEN: ""
    })
  );

  assert.equal(response.status, 401);
});

// ----------------------------------------------------------
// 7. Invalid TOTP
// ----------------------------------------------------------

await test("Login rejects invalid TOTP format", async () => {
  const response = await worker.fetch(
    makeRequest("/api/login", {
      method: "POST",
      headers: authHeaders(),
      body: {
        totp: "12345"
      }
    }),
    makeEnv()
  );

  const data = await response.json();

  assert.equal(response.status, 400);
  assert.equal(data.error, "INVALID_TOTP");
});

// ----------------------------------------------------------
// 8. Missing Angel One secrets
// ----------------------------------------------------------

await test("Login rejects missing Angel One secrets", async () => {
  const response = await worker.fetch(
    makeRequest("/api/login", {
      method: "POST",
      headers: authHeaders(),
      body: {
        totp: "123456"
      }
    }),
    makeEnv({
      ANGEL_API_KEY: ""
    })
  );

  const data = await response.json();

  assert.equal(response.status, 503);
  assert.equal(data.error, "MISSING_CLOUDFLARE_SECRETS");
});

// ----------------------------------------------------------
// 9. Invalid JSON body
// ----------------------------------------------------------

await test("Login rejects malformed JSON body", async () => {
  const response = await worker.fetch(
    new Request("https://angel-worker.test/api/login", {
      method: "POST",
      headers: authHeaders(),
      body: "{invalid-json"
    }),
    makeEnv()
  );

  const data = await response.json();

  assert.equal(response.status, 400);
  assert.equal(data.error, "INVALID_TOTP");
});

// ----------------------------------------------------------
// 10. Unknown route
// ----------------------------------------------------------

await test("Unknown protected route returns 404", async () => {
  const response = await worker.fetch(
    makeRequest("/api/not-real", {
      headers: authHeaders()
    }),
    makeEnv()
  );

  const data = await response.json();

  assert.equal(response.status, 404);
  assert.equal(data.error, "NOT_FOUND");
});

// ----------------------------------------------------------
// 11. Login provider failure
// ----------------------------------------------------------

await test("Login reports provider rejection without returning tokens", async () => {
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
      makeRequest("/api/login", {
        method: "POST",
        headers: authHeaders(),
        body: {
          totp: "123456"
        }
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

// ----------------------------------------------------------
// 12. Successful login stores tokens server-side
// ----------------------------------------------------------

await test("Successful login stores session without returning credentials", async () => {
  const originalFetch = globalThis.fetch;
  let loginRequest = null;
  let storedSession = null;

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
      makeRequest("/api/login", {
        method: "POST",
        headers: authHeaders(),
        body: {
          totp: "123456"
        }
      }),
      env
    );

    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
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

// ----------------------------------------------------------
// 13. Session storage rejects incomplete session
// ----------------------------------------------------------

await test("Durable Object rejects incomplete session data", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});

  const response = await session.fetch(
    makeRequest("/internal/session", {
      method: "POST",
      body: {
        jwtToken: "jwt"
      }
    })
  );

  const data = await response.json();

  assert.equal(response.status, 400);
  assert.equal(data.error, "INVALID_SESSION_DATA");
});

// ----------------------------------------------------------
// 14. Session storage accepts complete session
// ----------------------------------------------------------

await test("Durable Object stores complete session data", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});

  const response = await session.fetch(
    makeRequest("/internal/session", {
      method: "POST",
      body: makeSessionData()
    })
  );

  const data = await response.json();
  const saved = await ctx.storage.get("smartapi_session");

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(saved.jwtToken, "mock-jwt-token");
  assert.equal(saved.feedToken, "mock-feed-token");
});

// ----------------------------------------------------------
// 15. Connect without login
// ----------------------------------------------------------

await test("Durable Object refuses upstream connection without login", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});

  const response = await session.fetch(
    makeRequest("/internal/connect", {
      method: "POST"
    })
  );

  const data = await response.json();

  assert.equal(response.status, 401);
  assert.equal(data.error, "NOT_AUTHENTICATED");
});

// ----------------------------------------------------------
// 16. Status without session
// ----------------------------------------------------------

await test("Status reports disconnected and unauthenticated", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});

  const response = await session.fetch(
    makeRequest("/internal/status")
  );

  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.status, "DISCONNECTED");
  assert.equal(data.authenticated, false);
  assert.equal(data.tradingOrdersEnabled, false);
});

// ----------------------------------------------------------
// 17. Ticket requires authentication
// ----------------------------------------------------------

await test("Stream ticket requires an authenticated session", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});

  const response = await session.fetch(
    makeRequest("/internal/ticket", {
      method: "POST"
    })
  );

  const data = await response.json();

  assert.equal(response.status, 401);
  assert.equal(data.error, "NOT_AUTHENTICATED");
});

// ----------------------------------------------------------
// 18. Ticket creation and one-time use
// ----------------------------------------------------------

await test("Stream ticket is created and consumed once", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});

  await ctx.storage.put(
    "smartapi_session",
    makeSessionData()
  );

  const ticketResponse = await session.fetch(
    makeRequest("/internal/ticket", {
      method: "POST"
    })
  );

  const ticketData = await ticketResponse.json();

  assert.equal(ticketResponse.status, 200);
  assert.equal(ticketData.ok, true);
  assert.equal(ticketData.expiresInSeconds, 60);

  const key = `ticket:${ticketData.ticket}`;

  assert.ok(await ctx.storage.get(key));

  const pair = makePair();

  // Node.js Response does not natively support Cloudflare's
  // WebSocket upgrade response status 101.
  // This shim preserves normal Response behavior while allowing
  // the Worker-specific 101 + webSocket response to be tested.
  const NativeResponse = globalThis.Response;

  class WorkerCompatibleResponse extends NativeResponse {
    constructor(body, init = {}) {
      if (init.status === 101) {
        super(null, {
          status: 200,
          headers: init.headers
        });

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
      new Request(
        `https://angel-worker.test/internal/stream?ticket=${ticketData.ticket}`,
        {
          headers: {
            Upgrade: "websocket"
          }
        }
      )
    );

    assert.equal(streamResponse.status, 101);
    assert.equal(streamResponse.webSocket, pair.client);
    assert.equal(await ctx.storage.get(key), undefined);
    assert.equal(ctx.sockets.length, 1);

    const secondPair = makePair();

    const secondResponse = await session.fetch(
      new Request(
        `https://angel-worker.test/internal/stream?ticket=${ticketData.ticket}`,
        {
          headers: {
            Upgrade: "websocket"
          }
        }
      )
    );

    assert.equal(secondResponse.status, 401);
    assert.equal(secondPair.client.readyState, 1);
  } finally {
    globalThis.Response = NativeResponse;
  }
});

// ----------------------------------------------------------
// 19. Stream requires WebSocket upgrade
// ----------------------------------------------------------

await test("Stream route rejects non-WebSocket requests", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});

  const response = await session.fetch(
    makeRequest("/internal/stream?ticket=invalid")
  );

  const data = await response.json();

  assert.equal(response.status, 426);
  assert.equal(data.error, "WEBSOCKET_UPGRADE_REQUIRED");
});

// ----------------------------------------------------------
// 20. Invalid stream ticket
// ----------------------------------------------------------

await test("Expired or unknown stream ticket is rejected", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});

  const response = await session.fetch(
    new Request(
      "https://angel-worker.test/internal/stream?ticket=00000000-0000-4000-8000-000000000000",
      {
        headers: {
          Upgrade: "websocket"
        }
      }
    )
  );

  const data = await response.json();

  assert.equal(response.status, 401);
  assert.equal(data.error, "STREAM_TICKET_EXPIRED");
});

// ----------------------------------------------------------
// 21. Subscription request validation
// ----------------------------------------------------------

await test("Invalid subscription JSON is rejected", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});
  const client = new FakeSocket();

  session.webSocketMessage(client, "{invalid");

  const response = JSON.parse(client.sent[0]);

  assert.equal(response.type, "error");
  assert.equal(response.error, "INVALID_SUBSCRIPTION_JSON");
});

// ----------------------------------------------------------
// 22. Subscription rejects unsupported exchange
// ----------------------------------------------------------

await test("Subscription rejects non-NSE exchange", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});
  const client = new FakeSocket();

  session.webSocketMessage(
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

  const response = JSON.parse(client.sent[0]);

  assert.equal(response.type, "error");
  assert.equal(
    response.error,
    "ONLY_VALID_NSE_CASH_TOKENS_ALLOWED"
  );
});

// ----------------------------------------------------------
// 23. Subscription rejects invalid token
// ----------------------------------------------------------

await test("Subscription rejects non-numeric instrument token", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});
  const client = new FakeSocket();

  session.webSocketMessage(
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

  const response = JSON.parse(client.sent[0]);

  assert.equal(response.type, "error");
  assert.equal(
    response.error,
    "ONLY_VALID_NSE_CASH_TOKENS_ALLOWED"
  );
});

// ----------------------------------------------------------
// 24. Subscription requires connected upstream
// ----------------------------------------------------------

await test("Subscription is blocked when upstream is disconnected", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});
  const client = new FakeSocket();

  session.webSocketMessage(
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

  const response = JSON.parse(client.sent[0]);

  assert.equal(response.type, "error");
  assert.equal(
    response.error,
    "ANGEL_ONE_FEED_NOT_CONNECTED"
  );
});

// ----------------------------------------------------------
// 25. No order action accepted
// ----------------------------------------------------------

await test("Order-related action is rejected", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});
  const client = new FakeSocket();

  session.webSocketMessage(
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

  const response = JSON.parse(client.sent[0]);

  assert.equal(response.type, "error");
  assert.equal(
    response.error,
    "INVALID_SUBSCRIPTION_REQUEST"
  );
});

// ----------------------------------------------------------
// 26. Disconnect endpoint
// ----------------------------------------------------------

await test("Disconnect clears upstream and reports disconnected", async () => {
  const ctx = makeContext();
  const session = new AngelOneSmartApiSession(ctx, {});

  const response = await session.fetch(
    makeRequest("/internal/disconnect", {
      method: "POST"
    })
  );

  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.status, "DISCONNECTED");
});

// ----------------------------------------------------------
// 27. Public stream ticket route requires access token
// ----------------------------------------------------------

await test("Public stream ticket route rejects missing bearer token", async () => {
  const response = await worker.fetch(
    makeRequest("/api/stream-ticket", {
      method: "POST"
    }),
    makeEnv()
  );

  assert.equal(response.status, 401);
});

// ----------------------------------------------------------
// 28. Public stream route requires WebSocket upgrade
// ----------------------------------------------------------

await test("Public stream route rejects ordinary HTTP request", async () => {
  const response = await worker.fetch(
    makeRequest(
      "/api/stream?ticket=00000000-0000-4000-8000-000000000000",
      {
        headers: authHeaders()
      }
    ),
    makeEnv()
  );

  const data = await response.json();

  assert.equal(response.status, 426);
  assert.equal(data.error, "WEBSOCKET_UPGRADE_REQUIRED");
});

// ----------------------------------------------------------
// 29. Public stream rejects malformed ticket
// ----------------------------------------------------------

await test("Public stream route rejects malformed ticket", async () => {
  const response = await worker.fetch(
    makeRequest("/api/stream?ticket=bad", {
      headers: {
        ...authHeaders(),
        Upgrade: "websocket"
      }
    }),
    makeEnv()
  );

  const data = await response.json();

  assert.equal(response.status, 401);
  assert.equal(data.error, "INVALID_STREAM_TICKET");
});

// ----------------------------------------------------------
// 30. Login endpoint method validation
// ----------------------------------------------------------

await test("Login endpoint does not accept GET", async () => {
  const response = await worker.fetch(
    makeRequest("/api/login", {
      headers: authHeaders()
    }),
    makeEnv()
  );

  assert.equal(response.status, 404);
});

// ----------------------------------------------------------
// 31. Connect endpoint method validation
// ----------------------------------------------------------

await test("Connect endpoint does not accept GET", async () => {
  const response = await worker.fetch(
    makeRequest("/api/connect", {
      headers: authHeaders()
    }),
    makeEnv()
  );

  assert.equal(response.status, 404);
});

// ----------------------------------------------------------
// 32. Status endpoint method validation
// ----------------------------------------------------------

await test("Status endpoint does not accept POST", async () => {
  const response = await worker.fetch(
    makeRequest("/api/status", {
      method: "POST",
      headers: authHeaders()
    }),
    makeEnv()
  );

  assert.equal(response.status, 404);
});

// ----------------------------------------------------------
// 33. Worker route calls Durable Object
// ----------------------------------------------------------

await test("Status route forwards request to Durable Object", async () => {
  let requestedUrl = "";

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
            requestedUrl = url;

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
    makeRequest("/api/status", {
      headers: authHeaders()
    }),
    env
  );

  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.status, "CONNECTED");
  assert.match(requestedUrl, /internal\/status$/);
});

// ----------------------------------------------------------
// 34. Browser response never exposes configured secrets
// ----------------------------------------------------------

await test("Health response never exposes environment secrets", async () => {
  const response = await worker.fetch(
    makeRequest("/api/health"),
    makeEnv()
  );

  const text = await response.text();

  assert.equal(text.includes("test-api-key"), false);
  assert.equal(text.includes("1234"), false);
  assert.equal(text.includes("test-worker-access-token"), false);
});

// ----------------------------------------------------------
// Final result
// ----------------------------------------------------------

console.log("");

console.log(
  `ANGEL ONE SMARTAPI WORKER: ${passed}/34 TESTS PASSED`
);

assert.equal(passed, 34);

console.log(
  "ANGEL ONE SMARTAPI WORKER TESTS: ALL PASSED"
);
