
/* ==========================================================
   BADAL SEVERIYA V12
   ANGEL ONE SMARTAPI SECURE PROVIDER ADAPTER
   Version 12.1

   Security:
   - No API key, PIN, TOTP, JWT or Feed Token in browser.
   - WebSocket must be supplied by a secure backend socket factory.
   - No credentials persisted.
   - No order execution.

   Market data:
   - NSE Cash Market
   - Quote mode
   - Real binary packet validation
   - Real ticks only
   ========================================================== */

const MODULE = "ANGEL_ONE_SMARTAPI_PROVIDER";
const VERSION = "12.1";

const EXCHANGE_NSE_CM = 1;
const SUBSCRIBE_ACTION = 1;
const QUOTE_MODE = 2;

const HEARTBEAT_INTERVAL_MS = 30000;
const PRICE_DIVISOR = 100;
const QUOTE_PACKET_MIN_BYTES = 123;

function requiredString(value, name) {
  const result = String(value ?? "").trim();

  if (!result) {
    throw new Error(`${name} is required.`);
  }

  return result;
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
      throw new Error("SmartAPI packet integer is unsafe.");
    }

    return number;
  }

  const low = view.getUint32(offset, true);
  const high = view.getInt32(offset + 4, true);

  return high * 4294967296 + low;
}

function readFloat64(view, offset) {
  if (
    !(view instanceof DataView) ||
    offset < 0 ||
    offset + 8 > view.byteLength
  ) {
    throw new Error("SmartAPI binary packet is incomplete.");
  }

  return view.getFloat64(offset, true);
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

function parseQuotePacket(input) {
  let bytes;

  if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else if (ArrayBuffer.isView(input)) {
    bytes = new Uint8Array(
      input.buffer,
      input.byteOffset,
      input.byteLength
    );
  } else {
    throw new Error("Unsupported SmartAPI binary message.");
  }

  if (bytes.byteLength < QUOTE_PACKET_MIN_BYTES) {
    throw new Error("SmartAPI Quote packet is incomplete.");
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

  const sequenceNumber = readInt64(view, 27);
  const exchangeTimestamp = readInt64(view, 35);
  const rawPrice = readInt64(view, 43);
  const rawVolume = readInt64(view, 67);

  const rawOpen = readInt64(view, 91);
  const rawHigh = readInt64(view, 99);
  const rawLow = readInt64(view, 107);
  const rawClose = readInt64(view, 115);

  const timestamp =
    normalizeTimestamp(exchangeTimestamp);

  const price = rawPrice / PRICE_DIVISOR;
  const open = rawOpen / PRICE_DIVISOR;
  const high = rawHigh / PRICE_DIVISOR;
  const low = rawLow / PRICE_DIVISOR;
  const close = rawClose / PRICE_DIVISOR;

  const cumulativeVolume = rawVolume;

  if (
    !token ||
    !timestamp ||
    !Number.isFinite(sequenceNumber) ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close) ||
    !Number.isFinite(cumulativeVolume) ||
    cumulativeVolume < 0
  ) {
    throw new Error("SmartAPI Quote packet contains invalid values.");
  }

  if (
    high < low ||
    high < Math.max(open, close, price) ||
    low > Math.min(open, close, price)
  ) {
    throw new Error("SmartAPI Quote OHLC values are inconsistent.");
  }

  return {
    ignored: false,
    subscriptionMode,
    exchangeType,
    token,
    sequenceNumber,
    timestamp,
    price,
    open,
    high,
    low,
    close,
    cumulativeVolume
  };
}

export function createAngelOneSmartApiProvider(options = {}) {
  const instrumentToken = requiredString(
    options.instrumentToken,
    "NIFTY NSE instrument token"
  );

  const exchangeType = Number(
    options.exchangeType ?? EXCHANGE_NSE_CM
  );

  if (exchangeType !== EXCHANGE_NSE_CM) {
    throw new Error("Only NSE Cash Market is supported.");
  }

  if (typeof options.socketFactory !== "function") {
    throw new Error(
      "A secure backend socketFactory is required. Browser credentials are not accepted."
    );
  }

  const setIntervalImpl =
    options.setIntervalImpl || globalThis.setInterval;

  const clearIntervalImpl =
    options.clearIntervalImpl || globalThis.clearInterval;

  let activeSocket = null;
  let activeCleanup = null;

  let status = "DISCONNECTED";

  let connectionCount = 0;
  let tickCount = 0;
  let rejectedCount = 0;

  let lastTickAt = null;
  let lastError = null;

  let lastCumulativeVolume = null;
  let lastVolumeDate = null;

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
        credentialsAcceptedByBrowser: false,
        credentialsPersisted: false,
        orderExecution: false
      }
    };
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
      throw new Error("Provider is already connected.");
    }

    const onTick = handlers.onTick;
    const onStatus = handlers.onStatus;

    let socket = null;
    let heartbeatId = null;
    let closedByUser = false;
    let connectedReported = false;
    let cleanupCalled = false;

    function report(nextStatus, detail = null) {
      status = nextStatus;

      try {
        onStatus(nextStatus, detail);
      } catch {
        // Status callback errors must not break the socket.
      }
    }

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
      if (closedByUser) return;

      lastError = String(
        message || "SmartAPI provider failed."
      );

      report("ERROR", { message: lastError });
      cleanup();
    }

    try {
      report("CONNECTING");

      // Backend must perform authenticated SmartAPI connection.
      // This browser module never receives SmartAPI credentials.
      socket = options.socketFactory();

      if (
        !socket ||
        typeof socket.send !== "function" ||
        typeof socket.close !== "function"
      ) {
        throw new Error(
          "Secure backend did not provide a valid WebSocket."
        );
      }

      activeSocket = socket;
      activeCleanup = cleanup;

      try {
        socket.binaryType = "arraybuffer";
      } catch {
        // Optional browser property.
      }

      socket.onopen = () => {
        if (closedByUser) return;

        try {
          socket.send(JSON.stringify({
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
          }));

          connectionCount++;

          heartbeatId = setIntervalImpl(() => {
            if (
              socket &&
              socket.readyState === 1
            ) {
              try {
                socket.send("ping");
              } catch (error) {
                fail(error?.message);
              }
            }
          }, HEARTBEAT_INTERVAL_MS);

          report("CONNECTING", {
            message: "Waiting for first valid market tick."
          });
        } catch (error) {
          fail(error?.message);
        }
      };

      socket.onmessage = async event => {
        if (closedByUser) return;

        try {
          if (event.data === "pong") return;

          if (typeof event.data === "string") {
            return;
          }

          let packetData = event.data;

          if (
            typeof Blob !== "undefined" &&
            packetData instanceof Blob
          ) {
            packetData = await packetData.arrayBuffer();
          }

          const packet = parseQuotePacket(packetData);

          if (packet.ignored) return;

          if (
            packet.exchangeType !== exchangeType ||
            packet.token !== instrumentToken
          ) {
            return;
          }

          const dateKey = new Date(
            packet.timestamp
          ).toISOString().slice(0, 10);

          if (lastVolumeDate !== dateKey) {
            lastVolumeDate = dateKey;
            lastCumulativeVolume = null;
          }

          let volumeDelta = 0;

          if (lastCumulativeVolume !== null) {
            if (
              packet.cumulativeVolume >= lastCumulativeVolume
            ) {
              volumeDelta =
                packet.cumulativeVolume -
                lastCumulativeVolume;
            }
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
            sequenceNumber: packet.sequenceNumber,

            dataType: "REAL_PROVIDER_TICK"
          };

          if (!connectedReported) {
            connectedReported = true;

            report("CONNECTED", {
              source: "ANGEL_ONE_SMARTAPI",
              firstValidTickAt: packet.timestamp
            });
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
        fail("Secure SmartAPI WebSocket reported an error.");
      };

      socket.onclose = event => {
        if (closedByUser) {
          report("DISCONNECTED");
          return;
        }

        stopHeartbeat();

        report("DISCONNECTED", {
          message:
            event?.reason ||
            `WebSocket closed (${event?.code ?? "unknown"}).`
        });

        cleanup();
      };

      return {
        unsubscribe() {
          if (closedByUser) return;

          closedByUser = true;
          report("DISCONNECTED");
          cleanup();
        }
      };
    } catch (error) {
      cleanup();

      report("ERROR", {
        message:
          error?.message ||
          "SmartAPI provider initialization failed."
      });

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

  return {
    name: "ANGEL_ONE_SMARTAPI",
    subscribe,
    disconnect,
    snapshot,

    config: {
      module: MODULE,
      version: VERSION,
      exchange: "NSE",
      exchangeType,
      subscriptionMode: QUOTE_MODE,
      instrumentToken,
      supportedTimeframes: ["1D", "15M"],
      secureBackendRequired: true,
      browserCredentialsAccepted: false,
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

  exchange: "NSE",
  exchangeType: EXCHANGE_NSE_CM,
  subscriptionMode: QUOTE_MODE,

  supportedTimeframes: ["1D", "15M"],

  secureBackendRequired: true,
  browserCredentialsAccepted: false,
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
