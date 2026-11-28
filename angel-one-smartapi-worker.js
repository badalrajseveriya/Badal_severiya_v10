
const SMARTAPI_LOGIN_URL =
  "https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword";

const SMARTAPI_STREAM_URL =
  "wss://smartapisocket.angelone.in/smart-stream";

const WORKER_VERSION = "12.5";
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 75_000;
const CONNECTION_ROTATION_MS = 14 * 60_000;
const RECONNECT_BASE_DELAY_MS = 5_000;
const RECONNECT_MAX_DELAY_MS = 60_000;

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Accept": "application/json"
};

function jsonResponse(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...JSON_HEADERS,
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Cache-Control": "no-store"
    }
  });
}

function getOrigin(env) {
  return env.APP_ORIGIN || "*";
}

function getBearer(request) {
  const value = request.headers.get("Authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function authorized(request, env) {
  const supplied = getBearer(request);
  const expected = env.WORKER_ACCESS_TOKEN || "";

  if (!supplied || !expected || supplied.length !== expected.length) {
    return false;
  }

  let difference = 0;

  for (let i = 0; i < supplied.length; i++) {
    difference |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  }

  return difference === 0;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function callSession(env, path, options = {}) {
  const id = env.SMARTAPI_SESSION.idFromName("primary");
  const stub = env.SMARTAPI_SESSION.get(id);

  return stub.fetch(`https://smartapi-session.internal${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = getOrigin(env);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    try {
      if (path === "/api/health" && request.method === "GET") {
        return jsonResponse({
          ok: true,
          service: "BADAL SEVERIYA ANGEL ONE LIVE",
          version: WORKER_VERSION,
          mode: "MARKET_DATA_ONLY",
          tradingOrdersEnabled: false,
          timestamp: new Date().toISOString()
        }, 200, origin);
      }

      /*
       * Browser WebSocket authentication:
       * The browser WebSocket API cannot attach a custom
       * Authorization header. A short-lived, one-time ticket
       * is issued by the protected /api/stream-ticket route.
       * That ticket is the authorization capability here.
       */
      if (path === "/api/stream" && request.method === "GET") {
        if (request.headers.get("Upgrade") !== "websocket") {
          return jsonResponse({
            ok: false,
            error: "WEBSOCKET_UPGRADE_REQUIRED"
          }, 426, origin);
        }

        const ticket = url.searchParams.get("ticket") || "";

        if (!/^[a-f0-9-]{36}$/i.test(ticket)) {
          return jsonResponse({
            ok: false,
            error: "INVALID_STREAM_TICKET"
          }, 401, origin);
        }

        const id = env.SMARTAPI_SESSION.idFromName("primary");
        const stub = env.SMARTAPI_SESSION.get(id);

        return stub.fetch(
          `https://smartapi-session.internal/internal/stream?ticket=${encodeURIComponent(ticket)}`,
          {
            headers: {
              "Upgrade": "websocket"
            }
          }
        );
      }

      if (!authorized(request, env)) {
        return jsonResponse({
          ok: false,
          error: "UNAUTHORIZED",
          message: "Valid Worker access token required."
        }, 401, origin);
      }

      if (path === "/api/login" && request.method === "POST") {
        const body = await readJson(request);
        const totp = String(body?.totp || "").trim();

        if (!/^\d{6}$/.test(totp)) {
          return jsonResponse({
            ok: false,
            error: "INVALID_TOTP",
            message: "A current 6-digit authenticator code is required."
          }, 400, origin);
        }

        const requiredSecrets = [
          env.ANGEL_API_KEY,
          env.ANGEL_CLIENT_CODE,
          env.ANGEL_PIN,
          env.ANGEL_MAC_ADDRESS,
          env.ANGEL_CLIENT_LOCAL_IP,
          env.ANGEL_CLIENT_PUBLIC_IP
        ];

        if (requiredSecrets.some(value => !String(value || "").trim())) {
          return jsonResponse({
            ok: false,
            error: "MISSING_CLOUDFLARE_SECRETS",
            message: "One or more required Angel One Worker Secrets are not configured."
          }, 503, origin);
        }

        const loginResponse = await fetch(SMARTAPI_LOGIN_URL, {
          method: "POST",
          headers: {
            ...JSON_HEADERS,
            "X-MACAddress": env.ANGEL_MAC_ADDRESS,
            "X-PrivateKey": env.ANGEL_API_KEY,
            "X-UserType": "USER",
            "X-SourceID": "WEB",
            "X-ClientLocalIP": env.ANGEL_CLIENT_LOCAL_IP,
            "X-ClientPublicIP": env.ANGEL_CLIENT_PUBLIC_IP
          },
          body: JSON.stringify({
            clientcode: env.ANGEL_CLIENT_CODE,
            password: env.ANGEL_PIN,
            totp
          })
        });

        const loginData = await loginResponse.json().catch(() => null);

        if (
          !loginResponse.ok ||
          loginData?.status !== true ||
          !loginData?.data?.jwtToken ||
          !loginData?.data?.feedToken ||
          !loginData?.data?.refreshToken
        ) {
          return jsonResponse({
            ok: false,
            error: "ANGEL_ONE_LOGIN_FAILED",
            providerStatus: loginResponse.status,
            providerMessage: loginData?.message || "Login was not accepted.",
            providerErrorCode: loginData?.errorcode || null
          }, 502, origin);
        }

        const stored = await callSession(env, "/internal/session", {
          method: "POST",
          body: {
            jwtToken: loginData.data.jwtToken,
            refreshToken: loginData.data.refreshToken,
            feedToken: loginData.data.feedToken,
            clientCode: env.ANGEL_CLIENT_CODE,
            apiKey: env.ANGEL_API_KEY
          }
        });

        const storedData = await stored.json().catch(() => null);

        if (!stored.ok || storedData?.ok !== true) {
          return jsonResponse({
            ok: false,
            error: "SESSION_STORAGE_FAILED"
          }, 500, origin);
        }

        return jsonResponse({
          ok: true,
          status: "AUTHENTICATED",
          message: "Angel One session stored securely on the Worker.",
          credentialsReturnedToBrowser: false
        }, 200, origin);
      }

      if (path === "/api/connect" && request.method === "POST") {
        const response = await callSession(env, "/internal/connect", {
          method: "POST"
        });

        const data = await response.json().catch(() => null);

        return jsonResponse(data || {
          ok: false,
          error: "CONNECT_FAILED"
        }, response.status, origin);
      }

      if (path === "/api/disconnect" && request.method === "POST") {
        const response = await callSession(env, "/internal/disconnect", {
          method: "POST"
        });

        const data = await response.json().catch(() => null);

        return jsonResponse(data || {
          ok: false,
          error: "DISCONNECT_FAILED"
        }, response.status, origin);
      }

      if (path === "/api/status" && request.method === "GET") {
        const response = await callSession(env, "/internal/status");
        const data = await response.json().catch(() => null);

        return jsonResponse(data || {
          ok: false,
          error: "STATUS_UNAVAILABLE"
        }, response.status, origin);
      }

      if (path === "/api/stream-ticket" && request.method === "POST") {
        const response = await callSession(env, "/internal/ticket", {
          method: "POST"
        });

        const data = await response.json().catch(() => null);

        return jsonResponse(data || {
          ok: false,
          error: "TICKET_CREATION_FAILED"
        }, response.status, origin);
      }

      return jsonResponse({
        ok: false,
        error: "NOT_FOUND"
      }, 404, origin);

    } catch (error) {
      console.error("Angel One Worker error:", error?.message || error);

      return jsonResponse({
        ok: false,
        error: "WORKER_INTERNAL_ERROR",
        message: "The request could not be completed."
      }, 500, origin);
    }
  }
};

export class AngelOneSmartApiSession {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;

    this.upstream = null;
    this.heartbeat = null;

    this.lastTickAt = null;
    this.lastPongAt = null;
    this.lastError = null;
    this.connectedAt = null;

    this.reconnectAttempts = 0;
    this.reconnectScheduled = false;
    this.connectionWanted = false;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/internal/session" && request.method === "POST") {
      const body = await request.json().catch(() => null);

      if (
        !body?.jwtToken ||
        !body?.refreshToken ||
        !body?.feedToken ||
        !body?.clientCode ||
        !body?.apiKey
      ) {
        return jsonResponse({
          ok: false,
          error: "INVALID_SESSION_DATA"
        }, 400);
      }

      await this.ctx.storage.put("smartapi_session", {
        jwtToken: body.jwtToken,
        refreshToken: body.refreshToken,
        feedToken: body.feedToken,
        clientCode: body.clientCode,
        apiKey: body.apiKey,
        savedAt: Date.now()
      });

      return jsonResponse({ ok: true });
    }

    if (path === "/internal/connect" && request.method === "POST") {
      this.connectionWanted = true;

      await this.ctx.storage.put("connection_wanted", true);

      return this.connectUpstream();
    }

    if (path === "/internal/disconnect" && request.method === "POST") {
      this.connectionWanted = false;
      this.reconnectScheduled = false;

      await this.ctx.storage.put("connection_wanted", false);
      await this.clearReconnectAlarm();
      await this.ctx.storage.delete("rotation_at");
      await this.scheduleNextAlarm();
      await this.disconnectUpstream("USER_REQUEST");

      return jsonResponse({
        ok: true,
        status: "DISCONNECTED"
      });
    }

    if (path === "/internal/status" && request.method === "GET") {
      const session = await this.ctx.storage.get("smartapi_session");
      const wanted = await this.ctx.storage.get("connection_wanted");

      return jsonResponse({
        ok: true,
        status: this.upstream?.readyState === 1
          ? "CONNECTED"
          : this.upstream?.readyState === 0
            ? "CONNECTING"
            : wanted
              ? "RECONNECTING"
              : "DISCONNECTED",
        authenticated: Boolean(session),
        connectionWanted: Boolean(wanted),
        lastTickAt: this.lastTickAt,
        lastPongAt: this.lastPongAt,
        connectedAt: this.connectedAt,
        reconnectAttempts: this.reconnectAttempts,
        reconnectScheduled: this.reconnectScheduled,
        lastError: this.lastError,
        tradingOrdersEnabled: false
      });
    }

    if (path === "/internal/ticket" && request.method === "POST") {
      const session = await this.ctx.storage.get("smartapi_session");

      if (!session) {
        return jsonResponse({
          ok: false,
          error: "NOT_AUTHENTICATED"
        }, 401);
      }

      const ticket = crypto.randomUUID();

      await this.ctx.storage.put(`ticket:${ticket}`, {
        expiresAt: Date.now() + 60_000
      });

      return jsonResponse({
        ok: true,
        ticket,
        expiresInSeconds: 60
      });
    }

    if (path === "/internal/stream" && request.method === "GET") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return jsonResponse({
          ok: false,
          error: "WEBSOCKET_UPGRADE_REQUIRED"
        }, 426);
      }

      const ticket = url.searchParams.get("ticket") || "";
      const ticketKey = `ticket:${ticket}`;
      const savedTicket = await this.ctx.storage.get(ticketKey);

      if (!savedTicket || savedTicket.expiresAt < Date.now()) {
        await this.ctx.storage.delete(ticketKey);

        return jsonResponse({
          ok: false,
          error: "STREAM_TICKET_EXPIRED"
        }, 401);
      }

      await this.ctx.storage.delete(ticketKey);

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      this.ctx.acceptWebSocket(server);

      server.serializeAttachment?.({
        connectedAt: Date.now()
      });

      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }

    return jsonResponse({
      ok: false,
      error: "INTERNAL_ROUTE_NOT_FOUND"
    }, 404);
  }

  async connectUpstream() {
    const session = await this.ctx.storage.get("smartapi_session");

    if (!session) {
      this.lastError = "NOT_AUTHENTICATED";

      return jsonResponse({
        ok: false,
        error: "NOT_AUTHENTICATED",
        message: "Login before connecting the market feed."
      }, 401);
    }

    if (this.upstream?.readyState === 1) {
      return jsonResponse({
        ok: true,
        status: "ALREADY_CONNECTED"
      });
    }

    if (this.upstream?.readyState === 0) {
      return jsonResponse({
        ok: true,
        status: "CONNECTING"
      });
    }

    this.upstream = null;
    await this.clearHeartbeat();

    try {
      const response = await fetch(SMARTAPI_STREAM_URL, {
        method: "GET",
        headers: {
          "Upgrade": "websocket",

          // SmartAPI WebSocket 2.0 expects the JWT token
          // itself in Authorization, not the REST Bearer prefix.
          "Authorization": session.jwtToken,

          "x-api-key": session.apiKey,
          "x-client-code": session.clientCode,
          "x-feed-token": session.feedToken
        }
      });

      if (response.status !== 101 || !response.webSocket) {
        this.lastError = `SMARTAPI_HANDSHAKE_FAILED_${response.status}`;

        if (this.connectionWanted) {
          await this.scheduleReconnect();
        }

        return jsonResponse({
          ok: false,
          error: "SMARTAPI_WEBSOCKET_HANDSHAKE_FAILED",
          providerStatus: response.status
        }, 502);
      }

      const socket = response.webSocket;
      socket.binaryType = "arraybuffer";
      socket.accept();

      this.upstream = socket;
      this.connectedAt = new Date().toISOString();
      this.lastError = null;
      this.reconnectAttempts = 0;
      this.reconnectScheduled = false;
      this.lastPongAt = null;

      socket.addEventListener("message", event => {
        this.handleUpstreamMessage(event.data);
      });

      socket.addEventListener("close", event => {
        this.clearHeartbeat();

        if (this.upstream === socket) {
          this.upstream = null;
          this.lastError = `UPSTREAM_CLOSED_${event.code}`;

          this.broadcast({
            type: "status",
            status: "DISCONNECTED",
            code: event.code,
            reason: event.reason || ""
          });

          if (this.connectionWanted) {
            this.scheduleReconnect();
          }
        }
      });

      socket.addEventListener("error", () => {
        if (this.upstream !== socket) return;

        this.lastError = "UPSTREAM_WEBSOCKET_ERROR";

        this.broadcast({
          type: "status",
          status: "ERROR"
        });

        if (this.connectionWanted) {
          this.scheduleReconnect();
        }
      });

      this.heartbeat = setInterval(() => {
        if (this.upstream?.readyState !== 1) return;

        const lastResponseTime = this.lastPongAt
          ? Date.parse(this.lastPongAt)
          : Date.parse(this.connectedAt || "");

        if (
          Number.isFinite(lastResponseTime) &&
          Date.now() - lastResponseTime > HEARTBEAT_TIMEOUT_MS
        ) {
          this.lastError = "HEARTBEAT_TIMEOUT";

          try {
            this.upstream.close(1011, "Heartbeat timeout");
          } catch {
            // Socket may already be closed.
          }

          return;
        }

        try {
          this.upstream.send("ping");
        } catch {
          this.lastError = "HEARTBEAT_SEND_FAILED";

          try {
            this.upstream.close(1011, "Heartbeat failed");
          } catch {
            // Socket may already be closed.
          }
        }
      }, HEARTBEAT_INTERVAL_MS);

      await this.restoreSubscriptions();
      await this.scheduleConnectionRotation();

      this.broadcast({
        type: "status",
        status: "CONNECTED",
        connectedAt: this.connectedAt
      });

      return jsonResponse({
        ok: true,
        status: "CONNECTED",
        message: "Angel One market-data WebSocket connected."
      });

    } catch (error) {
      this.lastError = error?.message || "CONNECTION_FAILED";

      if (this.connectionWanted) {
        await this.scheduleReconnect();
      }

      return jsonResponse({
        ok: false,
        error: "SMARTAPI_CONNECTION_FAILED",
        message: this.lastError
      }, 502);
    }
  }

  async scheduleReconnect() {
    if (!this.connectionWanted || this.reconnectScheduled) return;

    this.reconnectScheduled = true;
    this.reconnectAttempts += 1;

    const exponent = Math.min(this.reconnectAttempts - 1, 4);
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * (2 ** exponent),
      RECONNECT_MAX_DELAY_MS
    );

    this.lastError = this.lastError || "RECONNECT_SCHEDULED";

    try {
      await this.ctx.storage.put("reconnect_at", Date.now() + delay);
      await this.scheduleNextAlarm();
    } catch (error) {
      this.reconnectScheduled = false;
      this.lastError = "RECONNECT_ALARM_FAILED: " + (error?.message || "UNKNOWN");
    }

    this.broadcast({
      type: "status",
      status: "RECONNECTING",
      attempt: this.reconnectAttempts,
      retryInMs: delay,
      error: this.lastError
    });
  }

  async scheduleConnectionRotation() {
    try {
      await this.ctx.storage.put("rotation_at", Date.now() + CONNECTION_ROTATION_MS);
      await this.scheduleNextAlarm();
    } catch (error) {
      this.lastError = "ROTATION_ALARM_FAILED: " + (error?.message || "UNKNOWN");
    }
  }

  async scheduleNextAlarm() {
    if (typeof this.ctx.storage.setAlarm !== "function") return;

    const [reconnectAt, rotationAt] = await Promise.all([
      this.ctx.storage.get("reconnect_at"),
      this.ctx.storage.get("rotation_at")
    ]);

    const deadlines = [reconnectAt, rotationAt]
      .filter(value => Number.isFinite(value) && value > 0);

    if (deadlines.length === 0) {
      if (typeof this.ctx.storage.deleteAlarm === "function") {
        await this.ctx.storage.deleteAlarm();
      }
      return;
    }

    await this.ctx.storage.setAlarm(Math.min(...deadlines));
  }

  async clearReconnectAlarm() {
    try {
      await this.ctx.storage.delete("reconnect_at");
      await this.scheduleNextAlarm();
    } catch {
      // Alarm may not exist.
    }
  }

  async alarm() {
    const now = Date.now();
    const wanted = await this.ctx.storage.get("connection_wanted");

    const [reconnectAt, rotationAt] = await Promise.all([
      this.ctx.storage.get("reconnect_at"),
      this.ctx.storage.get("rotation_at")
    ]);

    const reconnectDue =
      Number.isFinite(reconnectAt) && reconnectAt <= now;

    const rotationDue =
      Number.isFinite(rotationAt) && rotationAt <= now;

    if (wanted !== true) {
      this.connectionWanted = false;
      this.reconnectScheduled = false;

      await this.ctx.storage.delete("reconnect_at");
      await this.ctx.storage.delete("rotation_at");
      await this.scheduleNextAlarm();

      return;
    }

    if (!reconnectDue && !rotationDue) {
      await this.scheduleNextAlarm();
      return;
    }

    this.connectionWanted = true;

    const clients = this.ctx.getWebSockets().filter(
      socket => socket.readyState === 1
    );

    if (clients.length === 0) {
      this.connectionWanted = false;
      this.reconnectScheduled = false;

      await this.ctx.storage.put("connection_wanted", false);
      await this.ctx.storage.delete("reconnect_at");
      await this.ctx.storage.delete("rotation_at");
      await this.scheduleNextAlarm();
      await this.disconnectUpstream("NO_ACTIVE_BROWSER_CLIENTS");

      return;
    }

    if (reconnectDue) {
      await this.ctx.storage.delete("reconnect_at");
      this.reconnectScheduled = false;
    }

    if (rotationDue) {
      await this.ctx.storage.delete("rotation_at");
    }

    if (rotationDue && this.upstream?.readyState === 1) {
      await this.disconnectUpstream("CONTROLLED_CONNECTION_ROTATION");
    }

    if (!this.upstream || this.upstream.readyState !== 1) {
      await this.connectUpstream();
    } else {
      await this.scheduleNextAlarm();
    }
  }

  async restoreSubscriptions() {
    if (!this.upstream || this.upstream.readyState !== 1) return;

    const subscriptions =
      await this.ctx.storage.get("active_subscriptions") || [];

    for (const subscription of subscriptions) {
      if (!this.upstream || this.upstream.readyState !== 1) return;

      const request = {
        correlationID: "BADALSEV01",
        action: 1,
        params: {
          mode: subscription.mode,
          tokenList: [{
            exchangeType: 1,
            tokens: subscription.tokens
          }]
        }
      };

      try {
        this.upstream.send(JSON.stringify(request));
      } catch {
        this.lastError = "SUBSCRIPTION_RESTORE_FAILED";
        return;
      }
    }
  }

  async saveSubscription(action, mode, tokens) {
    const existing =
      await this.ctx.storage.get("active_subscriptions") || [];

    const key = `${mode}:${tokens.join(",")}`;

    const filtered = existing.filter(
      item => `${item.mode}:${item.tokens.join(",")}` !== key
    );

    if (action === 1) {
      filtered.push({
        mode,
        tokens
      });
    }

    await this.ctx.storage.put("active_subscriptions", filtered);
  }

  handleUpstreamMessage(data) {
    if (typeof data === "string") {
      if (data.toLowerCase() === "pong") {
        this.lastPongAt = new Date().toISOString();

        this.broadcast({
          type: "heartbeat",
          status: "ALIVE",
          timestamp: Date.now()
        });

        return;
      }

      this.broadcast({
        type: "provider_message",
        message: data.slice(0, 1000)
      });

      return;
    }

    if (!(data instanceof ArrayBuffer)) {
      return;
    }

    if (data.byteLength < 51) {
      return;
    }

    this.lastTickAt = new Date().toISOString();
    this.broadcastBinary(data);
  }

  async webSocketMessage(clientSocket, message) {
    if (typeof message !== "string") {
      return;
    }

    let request;

    try {
      request = JSON.parse(message);
    } catch {
      this.sendClient(clientSocket, {
        type: "error",
        error: "INVALID_SUBSCRIPTION_JSON"
      });

      return;
    }

    const action = Number(request?.action);
    const mode = Number(request?.params?.mode);
    const tokenGroups = request?.params?.tokenList;

    if (
      ![0, 1].includes(action) ||
      ![1, 2, 3].includes(mode) ||
      !Array.isArray(tokenGroups) ||
      tokenGroups.length !== 1
    ) {
      this.sendClient(clientSocket, {
        type: "error",
        error: "INVALID_SUBSCRIPTION_REQUEST"
      });

      return;
    }

    const group = tokenGroups[0];

    if (
      Number(group?.exchangeType) !== 1 ||
      !Array.isArray(group?.tokens) ||
      group.tokens.length < 1 ||
      group.tokens.length > 20 ||
      group.tokens.some(token => !/^\d{1,25}$/.test(String(token)))
    ) {
      this.sendClient(clientSocket, {
        type: "error",
        error: "ONLY_VALID_NSE_CASH_TOKENS_ALLOWED"
      });

      return;
    }

    if (!this.upstream || this.upstream.readyState !== 1) {
      this.sendClient(clientSocket, {
        type: "error",
        error: "ANGEL_ONE_FEED_NOT_CONNECTED"
      });

      return;
    }

    const tokens = group.tokens.map(String);

    const safeRequest = {
      correlationID: String(request.correlationID || "BADALSEV01").slice(0, 10),
      action,
      params: {
        mode,
        tokenList: [{
          exchangeType: 1,
          tokens
        }]
      }
    };

    try {
      this.upstream.send(JSON.stringify(safeRequest));

      await this.saveSubscription(action, mode, tokens);

      this.sendClient(clientSocket, {
        type: "subscription",
        status: action === 1 ? "SUBSCRIBE_SENT" : "UNSUBSCRIBE_SENT",
        exchange: "NSE_CASH",
        mode,
        tokens
      });
    } catch {
      this.sendClient(clientSocket, {
        type: "error",
        error: "SUBSCRIPTION_SEND_FAILED"
      });
    }
  }

  async webSocketClose(socket) {
    try {
      socket.close();
    } catch {
      // Socket is already closed.
    }

    const activeClients = this.ctx.getWebSockets().filter(
      item => item.readyState === 1
    );

    if (activeClients.length === 0) {
      this.connectionWanted = false;
      this.reconnectScheduled = false;

      await this.ctx.storage.put("connection_wanted", false);
      await this.clearReconnectAlarm();
      await this.ctx.storage.delete("rotation_at");
      await this.scheduleNextAlarm();
      await this.disconnectUpstream("NO_ACTIVE_BROWSER_CLIENTS");
    }
  }

  async webSocketError(socket) {
    try {
      socket.close(1011, "Browser socket error");
    } catch {
      // Socket is already closed.
    }

    const activeClients = this.ctx.getWebSockets().filter(
      item => item.readyState === 1
    );

    if (activeClients.length === 0) {
      this.connectionWanted = false;
      this.reconnectScheduled = false;

      await this.ctx.storage.put("connection_wanted", false);
      await this.clearReconnectAlarm();
      await this.ctx.storage.delete("rotation_at");
      await this.scheduleNextAlarm();
      await this.disconnectUpstream("NO_ACTIVE_BROWSER_CLIENTS");
    }
  }

  sendClient(socket, data) {
    try {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify(data));
      }
    } catch {
      // Ignore a client that has already disconnected.
    }
  }

  broadcast(data) {
    const payload = JSON.stringify(data);

    for (const socket of this.ctx.getWebSockets()) {
      try {
        if (socket.readyState === 1) {
          socket.send(payload);
        }
      } catch {
        // Ignore disconnected clients.
      }
    }
  }

  broadcastBinary(data) {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        if (socket.readyState === 1) {
          socket.send(data);
        }
      } catch {
        // Ignore disconnected clients.
      }
    }
  }

  async clearHeartbeat() {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  async disconnectUpstream(reason = "DISCONNECTED") {
    await this.clearHeartbeat();

    const socket = this.upstream;
    this.upstream = null;

    if (socket && socket.readyState < 2) {
      try {
        socket.close(1000, reason.slice(0, 100));
      } catch {
        // Ignore an already closed connection.
      }
    }

    this.broadcast({
      type: "status",
      status: "DISCONNECTED",
      reason
    });
  }
}
