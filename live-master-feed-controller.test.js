
// ==========================================================
// BADAL SEVERIYA V12
// LIVE MASTER FEED CONTROLLER TESTS
// Version 12.1
// ==========================================================

import assert from "node:assert/strict";

import {
  createLiveMasterFeedController
} from "./live-master-feed-controller.js";

import {
  LIVE_MASTER_FEED_BRIDGE_CONFIG
} from "./live-master-feed-bridge.js";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const NOW = Date.UTC(2026, 10, 27, 10, 0, 0);

const originalDateNow = Date.now;
Date.now = () => NOW;

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

function candle(timestamp, price = 25000) {
  return {
    timestamp,
    open: price,
    high: price + 2,
    low: price - 2,
    close: price + 1,
    volume: 1000
  };
}

function historical(timeframe, count = 60) {
  const interval =
    timeframe === "1d" ? DAY : 15 * MINUTE;

  const base = NOW - 100 * DAY;

  return Array.from({ length: count }, (_, index) =>
    candle(base + index * interval, 24000 + index)
  );
}

function response(timeframe, candles) {
  return {
    ok: true,
    json: async () => ({
      app: "BADAL SEVERIYA DATA V11",
      index: "NIFTY",
      timeframe,
      count: candles.length,
      limit: 5000,
      offset: 0,
      hasMore: false,
      source: "D1_HISTORICAL_STORAGE",
      dataType: "HISTORICAL",
      candles
    })
  };
}

function makeFetch(options = {}) {
  return async url => {
    const parsed = new URL(url);
    const timeframe =
      parsed.searchParams.get("timeframe");

    if (options.fail) {
      throw new Error("TEST_NETWORK_FAILURE");
    }

    if (typeof options.respond === "function") {
      return options.respond(timeframe);
    }

    return response(
      timeframe,
      historical(timeframe)
    );
  };
}

function createController(options = {}) {
  return createLiveMasterFeedController({
    fetchImpl: options.fetchImpl || makeFetch(),
    engine: options.engine,
    apiBase: "https://example.test",
    maxAgeMs1D: options.maxAgeMs1D,
    maxAgeMs15M: options.maxAgeMs15M
  });
}

function connectedProvider() {
  return {
    name: "TEST_PROVIDER",

    subscribe: async callbacks => {
      callbacks.onStatus("CONNECTED");
      return () => {};
    }
  };
}

// 1. Module configuration
await test(
  "Controller configuration supports only 1D and 15M",
  async () => {
    const controller = createController();

    assert.deepEqual(
      controller.config.supportedTimeframes,
      ["1D", "15M"]
    );

    assert.equal(
      controller.config.timeframeFallback,
      false
    );

    assert.equal(
      controller.config.requiresRealProvider,
      true
    );
  }
);

// 2. Historical baseline loads
await test(
  "Both historical baselines load before live connection",
  async () => {
    const controller = createController();
    const result = await controller.initialize();

    assert.equal(
      result.status,
      "WAITING_FOR_REAL_PROVIDER"
    );

    assert.equal(result.baseline.status, "READY");
    assert.equal(
      result.snapshot.historicalBaseline.loaded,
      true
    );

    assert.equal(
      result.snapshot.historicalBaseline["1D"],
      60
    );

    assert.equal(
      result.snapshot.historicalBaseline["15M"],
      60
    );
  }
);

// 3. Historical baseline is not a live connection
await test(
  "Historical baseline alone remains waiting for a real provider",
  async () => {
    const controller = createController();
    await controller.initialize();

    const snapshot = controller.snapshot();

    assert.equal(
      snapshot.status,
      "WAITING_FOR_REAL_PROVIDER"
    );

    assert.equal(
      snapshot.feed.source.connected,
      false
    );

    assert.equal(
      snapshot.feed.publication.count,
      0
    );
  }
);

// 4. Failed baseline blocks connection
await test(
  "Historical network failure blocks provider connection",
  async () => {
    const controller = createController({
      fetchImpl: makeFetch({ fail: true })
    });

    const result = await controller.connect(
      connectedProvider()
    );

    assert.equal(result.status, "WAIT");

    assert.equal(
      result.baseline.status,
      "WAITING_FOR_HISTORICAL_DATA"
    );

    assert.equal(
      controller.snapshot().feed.source.connected,
      false
    );
  }
);

// 5. Failed baseline can be retried
await test(
  "Failed baseline initialization can be retried",
  async () => {
    let shouldFail = true;

    const controller = createController({
      fetchImpl: makeFetch({
        respond: timeframe => {
          if (shouldFail) {
            throw new Error("TEMPORARY_FAILURE");
          }

          return response(
            timeframe,
            historical(timeframe)
          );
        }
      })
    });

    const first = await controller.initialize();

    assert.equal(
      first.status,
      "WAITING_FOR_HISTORICAL_DATA"
    );

    shouldFail = false;

    const second = await controller.initialize();

    assert.equal(
      second.status,
      "WAITING_FOR_REAL_PROVIDER"
    );

    assert.equal(second.baseline.status, "READY");
  }
);

// 6. Invalid provider blocked
await test(
  "Provider without subscribe function is rejected",
  async () => {
    const controller = createController();
    const result = await controller.connect({});

    assert.equal(
      result.status,
      "INVALID_SOURCE"
    );
  }
);

// 7. Explicit CONNECTED required
await test(
  "Provider must explicitly report CONNECTED",
  async () => {
    const controller = createController();

    const result = await controller.connect({
      name: "UNCONFIRMED_PROVIDER",
      subscribe: async () => () => {}
    });

    assert.equal(result.status, "CONNECTING");

    assert.equal(
      controller.snapshot().status,
      "CONNECTING"
    );

    assert.equal(
      controller.snapshot().feed.source.connected,
      false
    );
  }
);

// 8. Provider connected status reflected
await test(
  "Explicit provider connection is reflected in controller snapshot",
  async () => {
    const controller = createController();

    const result = await controller.connect(
      connectedProvider()
    );

    assert.equal(result.status, "CONNECTED");

    assert.equal(
      controller.snapshot().status,
      "CONNECTED"
    );

    assert.equal(
      controller.snapshot().feed.source.connected,
      true
    );
  }
);

// 9. Provider error reflected
await test(
  "Provider ERROR status is reflected in controller snapshot",
  async () => {
    const controller = createController();
    let callbacks;

    await controller.connect({
      name: "STATUS_TEST_PROVIDER",

      subscribe: async value => {
        callbacks = value;
        value.onStatus("CONNECTED");
        return () => {};
      }
    });

    callbacks.onStatus(
      "ERROR",
      { message: "Provider lost connection" }
    );

    assert.equal(
      controller.snapshot().status,
      "ERROR"
    );

    assert.equal(
      controller.snapshot().feed.source.connected,
      false
    );
  }
);

// 10. Provider disconnect reflected
await test(
  "Provider DISCONNECTED status returns to waiting state",
  async () => {
    const controller = createController();
    let callbacks;

    await controller.connect({
      name: "DISCONNECT_TEST_PROVIDER",

      subscribe: async value => {
        callbacks = value;
        value.onStatus("CONNECTED");
        return () => {};
      }
    });

    callbacks.onStatus("DISCONNECTED");

    assert.equal(
      controller.snapshot().status,
      "WAITING_FOR_REAL_PROVIDER"
    );

    assert.equal(
      controller.snapshot().feed.source.connected,
      false
    );
  }
);

// 11. Explicit disconnect
await test(
  "Controller disconnect disables provider connection",
  async () => {
    const controller = createController();

    await controller.connect(connectedProvider());

    const result = controller.disconnect();

    assert.equal(
      result.status,
      "DISCONNECTED"
    );

    assert.equal(
      controller.snapshot().status,
      "WAITING_FOR_REAL_PROVIDER"
    );

    assert.equal(
      controller.snapshot().feed.source.connected,
      false
    );
  }
);

// 12. Safety contract
await test(
  "Controller never enables fallback, synthetic data, or orders",
  async () => {
    const controller = createController();
    const snapshot = controller.snapshot();

    assert.deepEqual(
      snapshot.safety.supportedTimeframes,
      ["1D", "15M"]
    );

    assert.equal(
      snapshot.safety.timeframeFallback,
      false
    );

    assert.equal(
      snapshot.safety.historicalDataUsedAsLiveSource,
      false
    );

    assert.equal(
      snapshot.safety.syntheticCandlesCreated,
      false
    );

    assert.equal(
      snapshot.safety.importedSourceExecuted,
      false
    );

    assert.equal(
      snapshot.safety.orderExecution,
      false
    );

    assert.equal(
      controller.config.syntheticCandles,
      false
    );

    assert.equal(
      controller.config.orderExecution,
      false
    );

    assert.deepEqual(
      LIVE_MASTER_FEED_BRIDGE_CONFIG.supportedTimeframes,
      ["1D", "15M"]
    );
  }
);

// 13. No live publication from historical data
await test(
  "Historical baseline cannot create a live publication",
  async () => {
    const controller = createController();

    await controller.initialize();

    const snapshot = controller.snapshot();

    assert.equal(
      snapshot.feed.publication.count,
      0
    );

    assert.equal(
      snapshot.feed.liveEngine.minuteCandles.length,
      0
    );

    assert.equal(
      snapshot.feed.liveEngine.syntheticCandlesCreated,
      0
    );
  }
);

// Restore clock
Date.now = originalDateNow;

console.log("");

console.log(
  `LIVE MASTER FEED CONTROLLER: ${passed}/13 TESTS PASSED`
);

assert.equal(passed, 13);

console.log(
  "LIVE MASTER FEED CONTROLLER TESTS: ALL PASSED"
);
