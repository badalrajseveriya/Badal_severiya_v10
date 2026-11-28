
// ==========================================================
// BADAL SEVERIYA V12
// LIVE MASTER FEED BRIDGE TESTS
// ==========================================================

import assert from "node:assert/strict";

import {
  createLiveMasterFeedBridge,
  LIVE_MASTER_FEED_BRIDGE_CONFIG
} from "./live-master-feed-bridge.js";

import {
  createLiveCandleEngine
} from "./live-candle-engine.js";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// 27 November 2026, 15:30 IST (Friday)
const NOW = Date.UTC(2026, 10, 27, 10, 0, 0);

// NSE session starts at 09:15 IST.
const SESSION_START = Date.UTC(2026, 10, 27, 3, 45, 0);

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

function makeCandle(timestamp, price = 25000) {
  return {
    timestamp,
    open: price,
    high: price + 2,
    low: price - 2,
    close: price + 1,
    volume: 1000
  };
}

function makeHistoricalCandles(timeframe, count = 60) {
  const output = [];

  const interval =
    timeframe === "1d"
      ? DAY
      : 15 * MINUTE;

  const base =
    NOW - 90 * DAY;

  for (let i = 0; i < count; i++) {
    output.push(
      makeCandle(
        base + i * interval,
        24000 + i
      )
    );
  }

  return output;
}

function makeApiPayload(timeframe, candles, overrides = {}) {
  return {
    app: "BADAL SEVERIYA DATA V11",
    index: "NIFTY",
    timeframe,
    count: candles.length,
    limit: 5000,
    offset: 0,
    hasMore: false,
    source: "D1_HISTORICAL_STORAGE",
    dataType: "HISTORICAL",
    candles,
    ...overrides
  };
}

function makeFetch(options = {}) {
  const calls = [];

  const fetchImpl = async url => {
    const parsed = new URL(url);
    const timeframe =
      parsed.searchParams.get("timeframe");

    const offset =
      Number(parsed.searchParams.get("offset"));

    calls.push({
      timeframe,
      offset,
      url: parsed.toString()
    });

    if (typeof options.response === "function") {
      return options.response({
        timeframe,
        offset,
        calls
      });
    }

    const candles =
      options.candles?.[timeframe] ||
      makeHistoricalCandles(timeframe);

    return {
      ok: true,
      json: async () =>
        makeApiPayload(timeframe, candles)
    };
  };

  fetchImpl.calls = calls;

  return fetchImpl;
}

function createBridge(options = {}) {
  const fetchImpl =
    options.fetchImpl || makeFetch();

  const updates = [];

  const bridge = createLiveMasterFeedBridge({
    fetchImpl,
    engine:
      options.engine ||
      createLiveCandleEngine({
        maxMinuteBars: 390
      }),
    maxAgeMs1D: options.maxAgeMs1D,
    maxAgeMs15M: options.maxAgeMs15M,
    onUpdate: payload => updates.push(payload)
  });

  return {
    bridge,
    fetchImpl,
    updates
  };
}

function makeMinute(offset, price = 25000) {
  return makeCandle(
    SESSION_START + offset * MINUTE,
    price
  );
}

function makeConnectedProvider() {
  return {
    name: "TEST_REAL_TIME_PROVIDER",

    subscribe: async callbacks => {
      callbacks.onStatus("CONNECTED");

      return () => {};
    }
  };
}

async function prepareConnectedBridge(options = {}) {
  const context = createBridge(options);

  const loaded =
    await context.bridge.loadHistoricalBaseline();

  assert.equal(loaded.status, "READY");

  const connected =
    await context.bridge.connect(
      makeConnectedProvider()
    );

  assert.equal(connected.status, "CONNECTED");

  return context;
}

// ----------------------------------------------------------
// 1. Configuration contract
// ----------------------------------------------------------

await test(
  "Configuration supports only 1D and 15M",
  async () => {
    assert.deepEqual(
      LIVE_MASTER_FEED_BRIDGE_CONFIG.supportedTimeframes,
      ["1D", "15M"]
    );

    assert.equal(
      LIVE_MASTER_FEED_BRIDGE_CONFIG.timeframeFallback,
      false
    );
  }
);

// ----------------------------------------------------------
// 2. Historical data is baseline only
// ----------------------------------------------------------

await test(
  "Historical source is baseline only",
  async () => {
    assert.equal(
      LIVE_MASTER_FEED_BRIDGE_CONFIG.historicalBaselineOnly,
      true
    );

    assert.equal(
      LIVE_MASTER_FEED_BRIDGE_CONFIG.requiresRealLiveSource,
      true
    );
  }
);

// ----------------------------------------------------------
// 3. Synthetic candles disabled
// ----------------------------------------------------------

await test(
  "Synthetic candles remain disabled",
  async () => {
    assert.equal(
      LIVE_MASTER_FEED_BRIDGE_CONFIG.syntheticCandles,
      false
    );
  }
);

// ----------------------------------------------------------
// 4. Order execution disabled
// ----------------------------------------------------------

await test(
  "Order execution remains disabled",
  async () => {
    assert.equal(
      LIVE_MASTER_FEED_BRIDGE_CONFIG.orderExecution,
      false
    );
  }
);

// ----------------------------------------------------------
// 5. Historical baseline loads
// ----------------------------------------------------------

await test(
  "Both historical timeframes load successfully",
  async () => {
    const { bridge } = createBridge();

    const result =
      await bridge.loadHistoricalBaseline();

    assert.equal(result.status, "READY");
    assert.equal(
      result.historicalBaseline["1D"].count,
      60
    );
    assert.equal(
      result.historicalBaseline["15M"].count,
      60
    );
  }
);

// ----------------------------------------------------------
// 6. Historical API source validation
// ----------------------------------------------------------

await test(
  "Incorrect historical source is rejected",
  async () => {
    const fetchImpl = makeFetch({
      response: ({ timeframe }) => ({
        ok: true,
        json: async () =>
          makeApiPayload(
            timeframe,
            makeHistoricalCandles(timeframe),
            {
              source: "UNKNOWN_SOURCE"
            }
          )
      })
    });

    const { bridge } = createBridge({
      fetchImpl
    });

    const result =
      await bridge.loadHistoricalBaseline();

    assert.equal(result.status, "WAIT");
    assert.match(result.reason, /invalid response/i);
  }
);

// ----------------------------------------------------------
// 7. Historical timeframe validation
// ----------------------------------------------------------

await test(
  "Incorrect API timeframe is rejected",
  async () => {
    const fetchImpl = makeFetch({
      response: ({ timeframe }) => ({
        ok: true,
        json: async () =>
          makeApiPayload(
            "1h",
            makeHistoricalCandles(timeframe)
          )
      })
    });

    const { bridge } = createBridge({
      fetchImpl
    });

    const result =
      await bridge.loadHistoricalBaseline();

    assert.equal(result.status, "WAIT");
  }
);

// ----------------------------------------------------------
// 8. Insufficient historical data
// ----------------------------------------------------------

await test(
  "Less than 50 historical candles returns WAIT",
  async () => {
    const fetchImpl = makeFetch({
      candles: {
        "1d": makeHistoricalCandles("1d", 49),
        "15m": makeHistoricalCandles("15m", 60)
      }
    });

    const { bridge } = createBridge({
      fetchImpl
    });

    const result =
      await bridge.loadHistoricalBaseline();

    assert.equal(result.status, "WAIT");
    assert.match(result.reason, /50 historical candles/i);
  }
);

// ----------------------------------------------------------
// 9. Invalid historical OHLC
// ----------------------------------------------------------

await test(
  "Invalid historical OHLC is rejected",
  async () => {
    const invalid =
      makeHistoricalCandles("1d");

    invalid[5].high =
      invalid[5].low - 10;

    const fetchImpl = makeFetch({
      candles: {
        "1d": invalid,
        "15m": makeHistoricalCandles("15m")
      }
    });

    const { bridge } = createBridge({
      fetchImpl
    });

    const result =
      await bridge.loadHistoricalBaseline();

    assert.equal(result.status, "WAIT");
    assert.match(result.reason, /OHLC values are invalid/i);
  }
);

// ----------------------------------------------------------
// 10. Network failure
// ----------------------------------------------------------

await test(
  "Historical network failure returns WAIT",
  async () => {
    const fetchImpl = async () => {
      throw new Error("NETWORK_FAILURE");
    };

    const { bridge } = createBridge({
      fetchImpl
    });

    const result =
      await bridge.loadHistoricalBaseline();

    assert.equal(result.status, "WAIT");
    assert.match(result.reason, /NETWORK_FAILURE/);
  }
);

// ----------------------------------------------------------
// 11. Historical-only data cannot publish
// ----------------------------------------------------------

await test(
  "Historical data alone cannot publish live updates",
  async () => {
    const { bridge, updates } = createBridge();

    const loaded =
      await bridge.loadHistoricalBaseline();

    assert.equal(loaded.status, "READY");

    const result = bridge.publish();

    assert.equal(result.status, "WAIT");
    assert.equal(updates.length, 0);
  }
);

// ----------------------------------------------------------
// 12. Missing real provider
// ----------------------------------------------------------

await test(
  "Invalid provider cannot connect",
  async () => {
    const { bridge } = createBridge();

    const result =
      await bridge.connect({});

    assert.equal(
      result.status,
      "INVALID_SOURCE"
    );
  }
);

// ----------------------------------------------------------
// 13. Provider must explicitly connect
// ----------------------------------------------------------

await test(
  "Provider without CONNECTED status cannot publish",
  async () => {
    const { bridge, updates } = createBridge();

    await bridge.loadHistoricalBaseline();

    const result = await bridge.connect({
      name: "UNCONFIRMED_PROVIDER",

      subscribe: async () => () => {}
    });

    assert.equal(result.status, "CONNECTING");

    const publication = bridge.publish();

    assert.equal(publication.status, "WAIT");
    assert.equal(updates.length, 0);
  }
);

// ----------------------------------------------------------
// 14. Live minute data accepted after connection
// ----------------------------------------------------------

await test(
  "Real minute candle is accepted after connection",
  async () => {
    const { bridge } =
      await prepareConnectedBridge();

    const result =
      bridge.ingestMinute(makeMinute(374));

    assert.equal(result.accepted, true);
    assert.equal(result.status, "ACCEPTED");
  }
);

// ----------------------------------------------------------
// 15. Live data rejected while disconnected
// ----------------------------------------------------------

await test(
  "Disconnected provider cannot ingest live candles",
  async () => {
    const { bridge } =
      await prepareConnectedBridge();

    bridge.disconnect();

    const result =
      bridge.ingestMinute(makeMinute(374));

    assert.equal(result.accepted, false);
    assert.equal(result.status, "WAIT");
  }
);

// ----------------------------------------------------------
// 16. Full 1D and 15M live publication
// ----------------------------------------------------------

await test(
  "Fresh real 1D and 15M candles publish together",
  async () => {
    const { bridge, updates } =
      await prepareConnectedBridge();

    let lastResult = null;

    // 09:15 to 15:29 IST = 375 market minutes.
    for (let i = 0; i < 375; i++) {
      lastResult = bridge.ingestMinute(
        makeMinute(i, 25000 + i)
      );
    }

    assert.equal(lastResult.accepted, true);

    assert.ok(updates.length > 0);

    const payload =
      updates[updates.length - 1];

    assert.ok(payload.candles1D.length >= 50);
    assert.ok(payload.candles15M.length >= 50);

    assert.ok(
      payload.feedMetadata.liveDailyCandleCount > 0
    );

    assert.ok(
      payload.feedMetadata.live15MCandleCount > 0
    );

    assert.equal(
      payload.feedMetadata.syntheticCandlesCreated,
      0
    );

    assert.equal(
      payload.feedMetadata.timeframeFallback,
      false
    );

    const publication = bridge.publish();

    assert.equal(publication.status, "PUBLISHED");
  }
);

// ----------------------------------------------------------
// 17. Stale 15M data blocks publication
// ----------------------------------------------------------

await test(
  "Stale 15M data returns WAIT",
  async () => {
    const { bridge, updates } =
      await prepareConnectedBridge({
        maxAgeMs15M: MINUTE
      });

    for (let i = 0; i < 375; i++) {
      bridge.ingestMinute(makeMinute(i));
    }

    const result = bridge.publish();

    assert.equal(result.status, "WAIT");
    assert.match(result.reason, /stale/i);
    assert.equal(updates.length, 0);
  }
);

// ----------------------------------------------------------
// 18. Tick ingestion
// ----------------------------------------------------------

await test(
  "Real market tick enters the candle engine",
  async () => {
    const { bridge } =
      await prepareConnectedBridge();

    const result = bridge.ingestTick({
      timestamp: SESSION_START +
        374 * MINUTE +
        30000,
      price: 25100,
      volumeDelta: 25
    });

    assert.equal(result.accepted, true);

    const snapshot = bridge.snapshot();

    assert.equal(
      snapshot.liveEngine.minuteCandles.length,
      1
    );

    assert.equal(
      snapshot.liveEngine.syntheticCandlesCreated,
      0
    );
  }
);

// ----------------------------------------------------------
// 19. Invalid minute OHLC blocked
// ----------------------------------------------------------

await test(
  "Invalid live OHLC is rejected",
  async () => {
    const { bridge } =
      await prepareConnectedBridge();

    const result = bridge.ingestMinute({
      timestamp: SESSION_START + 374 * MINUTE,
      open: 25000,
      high: 24900,
      low: 24950,
      close: 25010,
      volume: 100
    });

    assert.equal(result.accepted, false);
  }
);

// ----------------------------------------------------------
// 20. Unsupported timeframe blocked
// ----------------------------------------------------------

await test(
  "1H historical timeframe is blocked",
  async () => {
    const { bridge } = createBridge();

    await assert.rejects(
      () => bridge.fetchHistoricalTimeframe("1H"),
      /Unsupported historical timeframe/
    );
  }
);

// ----------------------------------------------------------
// 21. Disconnect contract
// ----------------------------------------------------------

await test(
  "Disconnect disables live publication",
  async () => {
    const { bridge } =
      await prepareConnectedBridge();

    const result = bridge.disconnect();

    assert.equal(
      result.status,
      "DISCONNECTED"
    );

    assert.equal(
      bridge.snapshot().source.connected,
      false
    );

    assert.equal(
      bridge.publish().status,
      "WAIT"
    );
  }
);

// ----------------------------------------------------------
// 22. Snapshot safety contract
// ----------------------------------------------------------

await test(
  "Snapshot reports no fallback or order execution",
  async () => {
    const { bridge } =
      await prepareConnectedBridge();

    const snapshot = bridge.snapshot();

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
      snapshot.safety.orderExecution,
      false
    );
  }
);

// ----------------------------------------------------------
// 23. Historical baseline counts
// ----------------------------------------------------------

await test(
  "Snapshot reports independent historical counts",
  async () => {
    const { bridge } =
      await prepareConnectedBridge();

    const snapshot = bridge.snapshot();

    assert.equal(
      snapshot.historicalBaseline.loaded,
      true
    );

    assert.equal(
      snapshot.historicalBaseline["1D"],
      60
    );

    assert.equal(
      snapshot.historicalBaseline["15M"],
      60
    );
  }
);

// ----------------------------------------------------------
// 24. No fabricated live data
// ----------------------------------------------------------

await test(
  "No live candles are fabricated before source data",
  async () => {
    const { bridge } =
      await prepareConnectedBridge();

    const snapshot = bridge.snapshot();

    assert.equal(
      snapshot.liveEngine.minuteCandles.length,
      0
    );

    assert.equal(
      snapshot.liveEngine.syntheticCandlesCreated,
      0
    );

    assert.equal(
      bridge.publish().status,
      "WAIT"
    );
  }
);

// ----------------------------------------------------------
// Final result
// ----------------------------------------------------------

Date.now = originalDateNow;

console.log("");
console.log(
  `LIVE MASTER FEED BRIDGE: ${passed}/24 TESTS PASSED`
);

assert.equal(passed, 24);

console.log(
  "LIVE MASTER FEED BRIDGE TESTS: ALL PASSED"
);
