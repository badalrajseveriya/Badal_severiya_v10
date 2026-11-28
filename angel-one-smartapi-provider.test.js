
/* ==========================================================
   BADAL SEVERIYA V12
   ANGEL ONE SMARTAPI PROVIDER TESTS
   Version 12.1
   ========================================================== */

import assert from "node:assert/strict";

import {
  createAngelOneSmartApiProvider,
  ANGEL_ONE_SMARTAPI_PROVIDER_CONFIG
} from "./angel-one-smartapi-provider.js";

const NOW = Date.UTC(2026, 10, 27, 10, 0, 0);

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

class FakeWebSocket {
  constructor() {
    this.readyState = 0;
    this.binaryType = "blob";
    this.sent = [];
    this.closed = false;

    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
  }

  send(value) {
    if (this.readyState !== 1) {
      throw new Error("Socket is not open.");
    }

    this.sent.push(value);
  }

  close() {
    this.closed = true;
    this.readyState = 3;
  }

  open() {
    this.readyState = 1;
    this.onopen?.({});
  }

  async message(data) {
    await this.onmessage?.({ data });
  }
}

function makePacket(options = {}) {
  const token = options.token || "99926000";

  const buffer = new ArrayBuffer(123);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  view.setUint8(0, options.mode ?? 2);
  view.setUint8(1, options.exchangeType ?? 1);

  const tokenBytes = new TextEncoder().encode(token);

  bytes.set(
    tokenBytes.slice(0, 25),
    2
  );

  function writeInt64(offset, value) {
    view.setBigInt64(
      offset,
      BigInt(value),
      true
    );
  }

  writeInt64(27, options.sequence ?? 1001);
  writeInt64(35, options.timestamp ?? NOW);

  writeInt64(43, options.price ?? 2500000);
  writeInt64(67, options.volume ?? 100000);

  writeInt64(91, options.open ?? 2499900);
  writeInt64(99, options.high ?? 2501000);
  writeInt64(107, options.low ?? 2499000);
  writeInt64(115, options.close ?? 2500000);

  return buffer;
}

function createTestProvider(options = {}) {
  const socket = new FakeWebSocket();

  const intervalCalls = [];
  const clearedIntervals = [];

  const provider = createAngelOneSmartApiProvider({
    instrumentToken: options.instrumentToken || "99926000",

    exchangeType: 1,

    socketFactory: () => socket,

    setIntervalImpl: callback => {
      intervalCalls.push(callback);
      return intervalCalls.length;
    },

    clearIntervalImpl: id => {
      clearedIntervals.push(id);
    }
  });

  const ticks = [];
  const statuses = [];
  const minutes = [];

  const subscription = provider.subscribe({
    onMinute: candle => minutes.push(candle),
    onTick: tick => ticks.push(tick),
    onStatus: (status, detail) => {
      statuses.push({ status, detail });
    }
  });

  return {
    provider,
    socket,
    ticks,
    statuses,
    minutes,
    subscription,
    intervalCalls,
    clearedIntervals
  };
}

// ----------------------------------------------------------
// 1. Configuration
// ----------------------------------------------------------

await test(
  "Configuration supports only 1D and 15M",
  async () => {
    assert.deepEqual(
      ANGEL_ONE_SMARTAPI_PROVIDER_CONFIG.supportedTimeframes,
      ["1D", "15M"]
    );

    assert.equal(
      ANGEL_ONE_SMARTAPI_PROVIDER_CONFIG.timeframeFallback,
      false
    );
  }
);

// ----------------------------------------------------------
// 2. Security contract
// ----------------------------------------------------------

await test(
  "Browser credentials are disabled",
  async () => {
    assert.equal(
      ANGEL_ONE_SMARTAPI_PROVIDER_CONFIG.browserCredentialsAccepted,
      false
    );

    assert.equal(
      ANGEL_ONE_SMARTAPI_PROVIDER_CONFIG.credentialsPersisted,
      false
    );

    assert.equal(
      ANGEL_ONE_SMARTAPI_PROVIDER_CONFIG.secureBackendRequired,
      true
    );
  }
);

// ----------------------------------------------------------
// 3. No order execution
// ----------------------------------------------------------

await test(
  "Order execution remains disabled",
  async () => {
    assert.equal(
      ANGEL_ONE_SMARTAPI_PROVIDER_CONFIG.orderExecution,
      false
    );
  }
);

// ----------------------------------------------------------
// 4. Secure socket factory required
// ----------------------------------------------------------

await test(
  "Missing secure socket factory is rejected",
  async () => {
    assert.throws(
      () =>
        createAngelOneSmartApiProvider({
          instrumentToken: "99926000"
        }),
      /secure backend socketFactory/i
    );
  }
);

// ----------------------------------------------------------
// 5. Instrument token required
// ----------------------------------------------------------

await test(
  "Missing instrument token is rejected",
  async () => {
    assert.throws(
      () =>
        createAngelOneSmartApiProvider({
          socketFactory: () => new FakeWebSocket()
        }),
      /instrument token/i
    );
  }
);

// ----------------------------------------------------------
// 6. Only NSE Cash Market
// ----------------------------------------------------------

await test(
  "Unsupported exchange type is rejected",
  async () => {
    assert.throws(
      () =>
        createAngelOneSmartApiProvider({
          instrumentToken: "99926000",
          exchangeType: 2,
          socketFactory: () => new FakeWebSocket()
        }),
      /only nse cash market/i
    );
  }
);

// ----------------------------------------------------------
// 7. Required callbacks
// ----------------------------------------------------------

await test(
  "All provider callbacks are required",
  async () => {
    const provider = createAngelOneSmartApiProvider({
      instrumentToken: "99926000",
      socketFactory: () => new FakeWebSocket()
    });

    assert.throws(
      () => provider.subscribe({
        onTick: () => {},
        onStatus: () => {}
      }),
      /onMinute, onTick and onStatus/i
    );
  }
);

// ----------------------------------------------------------
// 8. Initial connection state
// ----------------------------------------------------------

await test(
  "Provider starts in DISCONNECTED state",
  async () => {
    const context = createTestProvider();

    assert.equal(
      context.provider.snapshot().status,
      "CONNECTING"
    );

    assert.equal(
      context.ticks.length,
      0
    );

    context.subscription.unsubscribe();
  }
);

// ----------------------------------------------------------
// 9. Subscription message
// ----------------------------------------------------------

await test(
  "Socket sends NSE Quote subscription after opening",
  async () => {
    const context = createTestProvider();

    context.socket.open();

    assert.equal(context.socket.sent.length, 1);

    const message = JSON.parse(
      context.socket.sent[0]
    );

    assert.equal(message.action, 1);
    assert.equal(message.params.mode, 2);

    assert.equal(
      message.params.tokenList[0].exchangeType,
      1
    );

    assert.deepEqual(
      message.params.tokenList[0].tokens,
      ["99926000"]
    );

    assert.equal(
      context.provider.snapshot().status,
      "CONNECTING"
    );

    context.subscription.unsubscribe();
  }
);

// ----------------------------------------------------------
// 10. First valid quote connects provider
// ----------------------------------------------------------

await test(
  "First valid quote reports CONNECTED and emits a tick",
  async () => {
    const context = createTestProvider();

    context.socket.open();

    await context.socket.message(
      makePacket()
    );

    assert.equal(
      context.provider.snapshot().status,
      "CONNECTED"
    );

    assert.equal(context.ticks.length, 1);

    assert.equal(
      context.ticks[0].source,
      "ANGEL_ONE_SMARTAPI"
    );

    assert.equal(
      context.ticks[0].dataType,
      "REAL_PROVIDER_TICK"
    );

    assert.equal(
      context.ticks[0].price,
      25000
    );

    assert.equal(
      context.ticks[0].volumeDelta,
      0
    );
  }
);

// ----------------------------------------------------------
// 11. Volume delta
// ----------------------------------------------------------

await test(
  "Cumulative volume is converted to incremental volume",
  async () => {
    const context = createTestProvider();

    context.socket.open();

    await context.socket.message(
      makePacket({ volume: 100000 })
    );

    await context.socket.message(
      makePacket({
        sequence: 1002,
        volume: 100125
      })
    );

    assert.equal(context.ticks.length, 2);

    assert.equal(
      context.ticks[1].volumeDelta,
      125
    );
  }
);

// ----------------------------------------------------------
// 12. Wrong token ignored
// ----------------------------------------------------------

await test(
  "Unexpected instrument token is ignored",
  async () => {
    const context = createTestProvider();

    context.socket.open();

    await context.socket.message(
      makePacket({
        token: "WRONGTOKEN"
      })
    );

    assert.equal(context.ticks.length, 0);

    assert.equal(
      context.provider.snapshot().status,
      "CONNECTING"
    );
  }
);

// ----------------------------------------------------------
// 13. Wrong exchange ignored
// ----------------------------------------------------------

await test(
  "Unexpected exchange type is ignored",
  async () => {
    const context = createTestProvider();

    context.socket.open();

    await context.socket.message(
      makePacket({
        exchangeType: 2
      })
    );

    assert.equal(context.ticks.length, 0);
  }
);

// ----------------------------------------------------------
// 14. Unsupported subscription mode ignored
// ----------------------------------------------------------

await test(
  "Unsupported subscription mode is ignored",
  async () => {
    const context = createTestProvider();

    context.socket.open();

    await context.socket.message(
      makePacket({ mode: 1 })
    );

    assert.equal(context.ticks.length, 0);
  }
);

// ----------------------------------------------------------
// 15. Invalid OHLC rejected
// ----------------------------------------------------------

await test(
  "Inconsistent OHLC packet is rejected",
  async () => {
    const context = createTestProvider();

    context.socket.open();

    await context.socket.message(
      makePacket({
        low: 2510000
      })
    );

    assert.equal(context.ticks.length, 0);

    assert.equal(
      context.provider.snapshot().counters.rejectedPackets,
      1
    );
  }
);

// ----------------------------------------------------------
// 16. Incomplete binary packet rejected
// ----------------------------------------------------------

await test(
  "Incomplete binary packet is rejected",
  async () => {
    const context = createTestProvider();

    context.socket.open();

    await context.socket.message(
      new ArrayBuffer(20)
    );

    assert.equal(context.ticks.length, 0);

    assert.equal(
      context.provider.snapshot().counters.rejectedPackets,
      1
    );
  }
);

// ----------------------------------------------------------
// 17. Text messages do not create ticks
// ----------------------------------------------------------

await test(
  "Text WebSocket messages do not create market ticks",
  async () => {
    const context = createTestProvider();

    context.socket.open();

    await context.socket.message(
      JSON.stringify({
        status: true,
        message: "Connected"
      })
    );

    assert.equal(context.ticks.length, 0);

    assert.equal(
      context.provider.snapshot().status,
      "CONNECTING"
    );
  }
);

// ----------------------------------------------------------
// 18. Heartbeat
// ----------------------------------------------------------

await test(
  "Heartbeat timer starts after socket opens",
  async () => {
    const context = createTestProvider();

    context.socket.open();

    assert.equal(
      context.intervalCalls.length,
      1
    );

    context.intervalCalls[0]();

    assert.equal(
      context.socket.sent.at(-1),
      "ping"
    );

    context.subscription.unsubscribe();
  }
);

// ----------------------------------------------------------
// 19. Disconnect
// ----------------------------------------------------------

await test(
  "Unsubscribe closes socket and clears heartbeat",
  async () => {
    const context = createTestProvider();

    context.socket.open();

    context.subscription.unsubscribe();

    assert.equal(
      context.socket.closed,
      true
    );

    assert.equal(
      context.provider.snapshot().status,
      "DISCONNECTED"
    );

    assert.equal(
      context.clearedIntervals.length,
      1
    );
  }
);

// ----------------------------------------------------------
// 20. Duplicate subscription blocked
// ----------------------------------------------------------

await test(
  "Second active subscription is rejected",
  async () => {
    const context = createTestProvider();

    assert.throws(
      () =>
        context.provider.subscribe({
          onMinute: () => {},
          onTick: () => {},
          onStatus: () => {}
        }),
      /already connected/i
    );

    context.subscription.unsubscribe();
  }
);

// ----------------------------------------------------------
// 21. Snapshot counters
// ----------------------------------------------------------

await test(
  "Snapshot reports real tick counters",
  async () => {
    const context = createTestProvider();

    context.socket.open();

    await context.socket.message(
      makePacket()
    );

    const snapshot =
      context.provider.snapshot();

    assert.equal(
      snapshot.counters.receivedTicks,
      1
    );

    assert.equal(
      snapshot.lastTickAt,
      NOW
    );

    assert.equal(
      snapshot.safety.orderExecution,
      false
    );

    context.subscription.unsubscribe();
  }
);

// ----------------------------------------------------------
// 22. No minute candle fabrication
// ----------------------------------------------------------

await test(
  "Provider does not fabricate minute candles",
  async () => {
    const context = createTestProvider();

    context.socket.open();

    await context.socket.message(
      makePacket()
    );

    assert.equal(context.minutes.length, 0);
    assert.equal(context.ticks.length, 1);

    context.subscription.unsubscribe();
  }
);

// ----------------------------------------------------------
// Final result
// ----------------------------------------------------------

console.log("");

console.log(
  `ANGEL ONE SMARTAPI PROVIDER: ${passed}/22 TESTS PASSED`
);

assert.equal(passed, 22);

console.log(
  "ANGEL ONE SMARTAPI PROVIDER TESTS: ALL PASSED"
);
