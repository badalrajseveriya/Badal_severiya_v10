
/* ==========================================================
   BADAL SEVERIYA V12
   ANGEL ONE SMARTAPI PROVIDER ADAPTER
   Version 12.0

   Purpose:
   - Connect to Angel One SmartAPI WebSocket 2.0.
   - Receive NIFTY NSE Quote packets.
   - Convert real market ticks into Live Feed Bridge ticks.
   - Use only runtime credentials; never persist credentials.
   - No historical candle fabrication.
   - No order placement or trading APIs.
   ========================================================== */

const MODULE = "ANGEL_ONE_SMARTAPI_PROVIDER";
const VERSION = "12.0";

const SOCKET_URL =
  "wss://smartapisocket.angelone.in/smart-stream";

const EXCHANGE_NSE_CM = 1;
const SUBSCRIBE_ACTION = 1;
const QUOTE_MODE = 2;

const HEARTBEAT_INTERVAL_MS = 30000;
const PRICE_DIVISOR = 100;

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function requiredString(value, name) {
  const result = String(value ?? "").trim();

  if (!result) {
    throw new Error(`${name} is required.`);
  }

  return result;
}

function normalizeTimestamp(value) {
  const timestamp = Number(value);

  if (
    !Number.isFinite(timestamp) ||
    timestamp <= 0
  ) {
    return null;
  }

  return timestamp < 1e12
    ? timestamp * 1000
    : timestamp;
}

function readInt64(view, offset) {
  if (
    !(view instanceof DataView) ||
    offset < 0 ||
    offset + 8 > view.byteLength
  ) {
    throw new Error("SmartAPI binary packet is incomplete.");
  }

  if (typeof view.getBigInt64 === "function") {
    const value = view.getBigInt64(offset, true);
    const number = Number(value);

    if (!Number.isSafeInteger(number)) {
      throw new Error("SmartAPI packet contains an unsafe integer.");
    }

    return number;
  }

  const low = view.getUint32(offset, true);
  const high = view.getInt32(offset + 4, true);

  return high * 4294967296 + low;
}

function readToken(bytes) {
  const tokenBytes = bytes.slice(2, 27);

  let result = "";

  for (const byte of tokenBytes) {
    if (byte === 0) break;
    result += String.fromCharCode(byte);
  }

  return result.trim();
}

function parseQuotePacket(input) {
  let bytes;

  if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else if (
    ArrayBuffer.isView(input)
  ) {
    bytes = new Uint8Array(
      input.buffer,
      input.byteOffset,
      input.byteLength
    );
  } else {
    throw new Error("Unsupported SmartAPI binary message.");
  }

  // Quote mode packet requires fields through daily volume.
  if (bytes.byteLength < 75) {
    throw new Error("SmartAPI Quote packet is too short.");
  }

  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  );

  const subscriptionMode = view.getUint8(0);
  const exchangeType = view.getUint8(1);

  if (subscriptionMode !== QUOTE_MODE) {
    return {
      ignored: true,
      reason: "UNSUPPORTED_SUBSCRIPTION_MODE"
    };
  }

  const token = readToken(bytes);

  const exchangeTimestamp = readInt64(view, 35);
  const rawPrice = readInt64(view, 43);
  const rawVolume = readInt64(view, 67);

  const timestamp =
    normalizeTimestamp(exchangeTimestamp);

  const price =
    rawPrice / PRICE_DIVISOR;

  const cumulativeVolume = rawVolume;

  if (
    !token ||
    !timestamp ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isFinite(cumulativeVolume) ||
    cumulativeVolume < 0
  ) {
    throw new Error("SmartAPI Quote packet contains invalid market data.");
  }

  return {
    ignored: false,
    subscriptionMode,
    exchangeType,
    token,
    timestamp,
    price,
    cumulativeVolume
  };
}

function buildSocketUrl(credentials) {
  const url = new URL(SOCKET_URL);

  // Angel One's documented browser WebSocket authentication.
  // Credentials remain in memory and are never stored by this module.
  url.searchParams.set(
    "clientCode",
    credentials.clientCode
  );

  url.searchParams.set(
    "feedToken",
    credentials.feedToken
  );

  url.searchParams.set(
    "apiKey",
    credentials.apiKey
  );

  return url.toString();
}

export function createAngelOneSmartApiProvider(options = {}) {
  const credentials = {
    apiKey: requiredString(
      options.apiKey,
      "SmartAPI API Key"
    ),

    clientCode: requiredString(
      options.clientCode,
      "Angel One Client Code"
    ),

    feedToken: requiredString(
      options.feedToken,
      "SmartAPI Feed Token"
    )
  };

  const instrumentToken = requiredString(
    options.instrumentToken,
    "NIFTY NSE instrument token"
  );

  const exchangeType = Number(
    options.exchangeType ?? EXCHANGE_NSE_CM
  );

  if (exchangeType !== EXCHANGE_NSE_CM) {
    throw new Error(
      "This adapter currently supports NSE Cash Market only."
    );
  }

  const WebSocketImpl =
    options.WebSocketImpl ||
    globalThis.WebSocket;

  if (typeof WebSocketImpl !== "function") {
    throw new Error(
      "Browser WebSocket is not available."
    );
  }

  const setIntervalImpl =
    options.setIntervalImpl ||
    globalThis.setInterval;

  const clearIntervalImpl =
    options.clearIntervalImpl ||
    globalThis.clearInterval;

  let activeSocket = null;
  let activeCleanup = null;

  let connectionCount = 0;
  let tickCount = 0;
  let rejectedCount = 0;

  let lastTickAt = null;
  let lastError = null;
  let lastCumulativeVolume = null;
  let lastVolumeDate = null;

  let status = "DISCONNECTED";

  function reportStatus(callback, nextStatus, detail = null) {
    status = nextStatus;

    if (typeof callback === "function") {
      callback(nextStatus, detail);
    }
  }

  function subscribe(handlers = {}) {
    if (
      typeof handlers.onMinute !== "function" ||
      typeof handlers.onTick !== "function" ||
      typeof handlers.onStatus !== "function"
    ) {
      throw new Error(
        "onMinute, onTick and onStatus callbacks are required."
      );
    }

    if (activeSocket) {
      throw new Error(
        "This SmartAPI provider is already connected."
      );
    }

    const onTick = handlers.onTick;
    const onStatus = handlers.onStatus;

    let socket;
    let heartbeatId = null;
    let closedByUser = false;
    let connectedReported = false;

    let cleanupCalled = false;

    function stopHeartbeat() {
      if (heartbeatId !== null) {
        clearIntervalImpl(heartbeatId);
        heartbeatId = null;
      }
    }

    function cleanup() {
      if (cleanupCalled) return;

      cleanupCalled = true;
      stopHeartbeat();

      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;

        try {
          if (
            socket.readyState === 0 ||
            socket.readyState === 1
          ) {
            socket.close();
          }
        } catch {
          // Safe cleanup.
        }
      }

      if (activeSocket === socket) {
        activeSocket = null;
        activeCleanup = null;
      }
    }

    function fail(message) {
      lastError = String(
        message || "SmartAPI provider failed."
      );

      reportStatus(
        onStatus,
        "ERROR",
        { message: lastError }
      );

      cleanup();
    }

    try {
      reportStatus(
        onStatus,
        "CONNECTING"
      );

      const socketUrl =
        buildSocketUrl(credentials);

      socket = new WebSocketImpl(socketUrl);

      activeSocket = socket;
      activeCleanup = cleanup;

      // Binary market-data packets are required.
      try {
        socket.binaryType = "arraybuffer";
      } catch {
        // Browser may expose a read-only property.
      }

      socket.onopen = () => {
        if (closedByUser) return;

        try {
          const request = {
            correlationID: "BADALV12N1",
            action: SUBSCRIBE_ACTION,
            params: {
              mode: QUOTE_MODE,
              tokenList: [
                {
                  exchangeType,
                  tokens: [instrumentToken]
                }
              ]
            }
          };

          socket.send(JSON.stringify(request));

          connectionCount++;

          // SmartAPI browser WebSocket heartbeat.
          heartbeatId = setIntervalImpl(() => {
            if (
              socket &&
              socket.readyState === 1
            ) {
              try {
                socket.send("ping");
              } catch (error) {
                fail(
                  error?.message ||
                  "SmartAPI heartbeat failed."
                );
              }
            }
          }, HEARTBEAT_INTERVAL_MS);

          // CONNECTED is reported only after a valid market tick.
          reportStatus(
            onStatus,
            "CONNECTING",
            {
              message:
                "WebSocket opened; waiting for first valid NIFTY market tick."
            }
          );
        } catch (error) {
          fail(error?.message);
        }
      };

      socket.onmessage = async event => {
        if (closedByUser) return;

        try {
          if (event.data === "pong") {
            return;
          }

          if (typeof event.data === "string") {
            // Ignore textual control messages.
            return;
          }

          let packetData = event.data;

          if (
            typeof Blob !== "undefined" &&
            packetData instanceof Blob
          ) {
            packetData = await packetData.arrayBuffer();
          }

          const packet =
            parseQuotePacket(packetData);

          if (packet.ignored) {
            return;
          }

          if (
            packet.exchangeType !== exchangeType ||
            packet.token !== instrumentToken
          ) {
            return;
          }

          const dateKey = new Date(
            packet.timestamp
          ).toISOString().slice(0, 10);

          let volumeDelta = 0;

          if (lastVolumeDate !== dateKey) {
            lastVolumeDate = dateKey;
            lastCumulativeVolume = null;
          }

          if (lastCumulativeVolume === null) {
            volumeDelta = 0;
          } else if (
            packet.cumulativeVolume >= lastCumulativeVolume
          ) {
            volumeDelta =
              packet.cumulativeVolume -
              lastCumulativeVolume;
          } else {
            // Volume reset: do not create negative volume.
            volumeDelta = 0;
          }

          lastCumulativeVolume =
            packet.cumulativeVolume;

          const tick = {
            timestamp: packet.timestamp,
            price: packet.price,
            volumeDelta,

            source: "ANGEL_ONE_SMARTAPI",
            exchange: "NSE",
            exchangeType: packet.exchangeType,
            instrumentToken: packet.token,

            dataType: "REAL_PROVIDER_TICK"
          };

          if (!connectedReported) {
            connectedReported = true;

            reportStatus(
              onStatus,
              "CONNECTED",
              {
                source: "ANGEL_ONE_SMARTAPI",
                firstValidTickAt: packet.timestamp
              }
            );
          }

          tickCount++;
          lastTickAt = packet.timestamp;
          lastError = null;

          onTick(tick);
        } catch (error) {
          rejectedCount++;
          lastError =
            error?.message ||
            "SmartAPI market packet could not be parsed.";
        }
      };

      socket.onerror = () => {
        if (closedByUser) return;

        fail(
          "Angel One SmartAPI WebSocket reported an error."
        );
      };

      socket.onclose = event => {
        if (closedByUser) {
          reportStatus(
            onStatus,
            "DISCONNECTED"
          );
          return;
        }

        stopHeartbeat();

        const reason =
          event?.reason ||
          `SmartAPI WebSocket closed (${event?.code ?? "unknown"}).`;

        reportStatus(
          onStatus,
          "DISCONNECTED",
          { message: reason }
        );

        cleanup();
      };

      return {
        unsubscribe() {
          if (closedByUser) return;

          closedByUser = true;

          reportStatus(
            onStatus,
            "DISCONNECTED"
          );

          cleanup();
        }
      };
    } catch (error) {
      cleanup();

      reportStatus(
        onStatus,
        "ERROR",
        {
          message:
            error?.message ||
            "SmartAPI provider initialization failed."
        }
      );

      throw error;
    }
  }

  function disconnect() {
    if (typeof activeCleanup === "function") {
      activeCleanup();
    }

    activeSocket = null;
    activeCleanup = null;
    status = "DISCONNECTED";

    return {
      status,
      module: MODULE
    };
  }

  function snapshot() {
    return {
      module: MODULE,
      version: VERSION,

      status,

      source: "ANGEL_ONE_SMARTAPI",

      exchange: "NSE",
      exchangeType,

      instrumentToken,

      subscriptionMode: "QUOTE",

      counters: {
        connections: connectionCount,
        receivedTicks: tickCount,
        rejectedPackets: rejectedCount
      },

      lastTickAt,
      lastError,

      safety: {
        supportedTimeframes: ["1D", "15M"],
        timeframeFallback: false,
        historicalCandlesCreated: false,
        syntheticCandlesCreated: false,
        importedSourceExecuted: false,
        credentialsPersisted: false,
        orderExecution: false
      }
    };
  }

  return {
    name: "ANGEL_ONE_SMARTAPI",

    subscribe,
    disconnect,
    snapshot,

    config: {
      module: MODULE,
      version: VERSION,

      websocket: SOCKET_URL,

      exchange: "NSE",
      exchangeType,

      subscriptionMode: QUOTE_MODE,

      instrumentToken,

      heartbeatIntervalMs:
        HEARTBEAT_INTERVAL_MS,

      supportedTimeframes: ["1D", "15M"],

      credentialsPersisted: false,
      syntheticCandles: false,
      timeframeFallback: false,
      orderExecution: false
    }
  };
}

export const ANGEL_ONE_SMARTAPI_PROVIDER_CONFIG = {
  module: MODULE,
  version: VERSION,

  websocket: SOCKET_URL,

  exchange: "NSE",
  exchangeType: EXCHANGE_NSE_CM,

  subscriptionMode: QUOTE_MODE,

  supportedTimeframes: ["1D", "15M"],

  credentialsPersisted: false,
  syntheticCandles: false,
  timeframeFallback: false,
  orderExecution: false
};

if (typeof window !== "undefined") {
  window.BADAL_SEVERIYA_ANGEL_ONE_PROVIDER = {
    create: options =>
      createAngelOneSmartApiProvider(options),

    config: ANGEL_ONE_SMARTAPI_PROVIDER_CONFIG
  };
}
