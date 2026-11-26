import assert from "node:assert/strict";

import {
  runHistoricalMasterApiIntegration
} from "./historical-master-api-integration.js";

const FIXED_NOW = Date.parse(
  "2026-11-26T12:00:00.000Z"
);

const DATES = [
  [2026, 11, 16],
  [2026, 11, 17],
  [2026, 11, 18],
  [2026, 11, 19],
  [2026, 11, 20],
  [2026, 11, 23],
  [2026, 11, 24],
  [2026, 11, 25]
];

// ------------------------------------------------------
// HELPERS
// ------------------------------------------------------

function makeSession([year, month, day], basePrice) {
  const candles = [];

  for (
    let minute = 9 * 60 + 15;
    minute <= 15 * 60 + 15;
    minute += 15
  ) {
    const i = candles.length;

    const close =
      basePrice +
      i * 0.5 +
      Math.sin(i / 3) * 5;

    const open = close - 0.5;

    const utc = Date.UTC(
      year,
      month - 1,
      day,
      Math.floor(minute / 60) - 5,
      minute % 60 - 30
    );

    candles.push({
      timestamp: new Date(utc).toISOString(),
      open,
      high: close + 2,
      low: open - 2,
      close,
      volume: 1000 + i
    });
  }

  return candles;
}

function makeHistory() {
  return DATES.flatMap(
    (date, i) =>
      makeSession(
        date,
        25000 + i * 20
      )
  );
}

function makePayload(candles, {
  offset = 0,
  limit = 5000,
  hasMore = false
} = {}) {
  return {
    app: "BADAL SEVERIYA DATA V11",
    index: "NIFTY",
    timeframe: "15m",
    count: candles.length,
    limit,
    offset,
    hasMore,
    source: "D1_HISTORICAL_STORAGE",
    dataType: "HISTORICAL",
    candles
  };
}

function makeFetch(pages) {
  const requests = [];

  const fetchImpl = async url => {
    const parsed = new URL(url);
    const offset = Number(
      parsed.searchParams.get("offset")
    );

    requests.push(offset);

    const payload = pages.get(offset);

    if (!payload) {
      throw new Error(
        `Unexpected offset ${offset}`
      );
    }

    return {
      ok: true,
      status: 200,
      json: async () => payload
    };
  };

  return {
    fetchImpl,
    requests
  };
}

// ------------------------------------------------------
// TEST 1: COMPLETE MASTER INTEGRATION
// ------------------------------------------------------

{
  const candles = makeHistory();

  const pages = new Map([
    [
      0,
      makePayload(
        candles.slice(0, 100),
        {
          offset: 0,
          limit: 100,
          hasMore: true
        }
      )
    ],
    [
      100,
      makePayload(
        candles.slice(100),
        {
          offset: 100,
          limit: 100,
          hasMore: false
        }
      )
    ]
  ]);

  const { fetchImpl, requests } =
    makeFetch(pages);

  const result =
    await runHistoricalMasterApiIntegration({
      apiBaseUrl: "https://example.test",
      pageSize: 100,
      maxCandles: 10000,
      fetchImpl,
      now: FIXED_NOW
    });

  assert.equal(result.status, "OK");
  assert.equal(
    result.module,
    "HISTORICAL_MASTER_API_INTEGRATION"
  );

  assert.equal(
    result.dataType,
    "HISTORICAL_ONLY"
  );

  assert.equal(result.timeframe, "15m");
  assert.equal(result.candleCount, 200);

  assert.deepEqual(
    requests,
    [0, 100]
  );

  assert.equal(
    result.gapValidation.quality,
    "VALID"
  );

  assert.equal(
    result.report.status,
    "OK"
  );

  assert.equal(
    result.structure.status,
    "OK"
  );

  assert.equal(
    result.masterAnalysis.status,
    "OK"
  );

  assert.equal(
    result.masterAnalysis.candleCount,
    200
  );

  assert.equal(
    result.validation.masterAnalysisValid,
    true
  );

  const p =
    result.masterAnalysis.composition.percentages;

  const total =
    p.bullish +
    p.bearish +
    p.neutral;

  assert.ok(
    Math.abs(total - 100) <= 0.2
  );

  assert.equal(
    result.validation.percentagesTotal100,
    true
  );

  assert.equal(
    result.masterAnalysis.smc.status,
    "OK"
  );

  console.log(
    "PASS: Complete API to Master Analysis integration"
  );
}

// ------------------------------------------------------
// TEST 2: EMPTY API STORAGE
// ------------------------------------------------------

{
  const pages = new Map([
    [
      0,
      makePayload([], {
        limit: 5000,
        hasMore: false
      })
    ]
  ]);

  const { fetchImpl } = makeFetch(pages);

  const result =
    await runHistoricalMasterApiIntegration({
      apiBaseUrl: "https://example.test",
      fetchImpl,
      now: FIXED_NOW
    });

  assert.equal(
    result.status,
    "WAITING_FOR_DATA"
  );

  assert.equal(result.candleCount, 0);
  assert.equal(result.report, null);
  assert.equal(result.structure, null);
  assert.equal(result.masterAnalysis, null);

  console.log(
    "PASS: Empty API data returns waiting state"
  );
}

// ------------------------------------------------------
// TEST 3: INVALID DATA BLOCKS MASTER ANALYSIS
// ------------------------------------------------------

{
  const candles = makeHistory();

  const firstSessionStart =
    makeSession(DATES[0], 25000)[0].timestamp;

  const missingStart = candles.filter(
    candle =>
      candle.timestamp !== firstSessionStart
  );

  const pages = new Map([
    [
      0,
      makePayload(missingStart, {
        limit: 500,
        hasMore: false
      })
    ]
  ]);

  const { fetchImpl } = makeFetch(pages);

  const result =
    await runHistoricalMasterApiIntegration({
      apiBaseUrl: "https://example.test",
      fetchImpl,
      now: FIXED_NOW
    });

  assert.equal(result.status, "ERROR");

  assert.equal(
    result.gapValidation.quality,
    "ISSUES_FOUND"
  );

  assert.equal(result.report, null);
  assert.equal(result.masterAnalysis, null);

  console.log(
    "PASS: Invalid session data blocks downstream analysis"
  );
}

// ------------------------------------------------------
// TEST 4: API FAILURE
// ------------------------------------------------------

{
  const fetchImpl = async () => ({
    ok: false,
    status: 503,
    json: async () => ({})
  });

  const result =
    await runHistoricalMasterApiIntegration({
      apiBaseUrl: "https://example.test",
      fetchImpl,
      now: FIXED_NOW
    });

  assert.equal(result.status, "ERROR");
  assert.equal(result.report, null);
  assert.equal(result.masterAnalysis, null);

  assert.match(
    result.error,
    /HTTP 503/
  );

  console.log(
    "PASS: API failure blocks Master Integration"
  );
}

// ------------------------------------------------------
// TEST 5: UNSUPPORTED TIMEFRAME
// ------------------------------------------------------

{
  const result =
    await runHistoricalMasterApiIntegration({
      timeframe: "1d"
    });

  assert.equal(result.status, "ERROR");

  assert.match(
    result.error,
    /supports 15m only/
  );

  console.log(
    "PASS: Unsupported timeframe rejected"
  );
}

// ------------------------------------------------------
// TEST 6: INVALID CANDLE LIMIT
// ------------------------------------------------------

{
  const result =
    await runHistoricalMasterApiIntegration({
      maxCandles: 100
    });

  assert.equal(result.status, "ERROR");

  assert.match(
    result.error,
    /between 200 and 100000/
  );

  console.log(
    "PASS: Invalid candle limit rejected"
  );
}

console.log(
  "\nALL 6 MASTER API INTEGRATION TESTS PASSED"
);