
import assert from "node:assert/strict";

import {
  runHistoricalAnalysisApiPipeline
} from "./historical-analysis-api-pipeline.js";

const FIXED_NOW = Date.parse(
  "2026-11-26T12:00:00.000Z"
);

const SESSION_DATES = [
  { year: 2026, month: 11, day: 16 },
  { year: 2026, month: 11, day: 17 },
  { year: 2026, month: 11, day: 18 },
  { year: 2026, month: 11, day: 19 },
  { year: 2026, month: 11, day: 20 },
  { year: 2026, month: 11, day: 23 },
  { year: 2026, month: 11, day: 24 },
  { year: 2026, month: 11, day: 25 }
];

// ------------------------------------------------------
// HELPERS
// ------------------------------------------------------

function makeSession(date, basePrice = 25000) {
  const candles = [];

  for (
    let minute = 9 * 60 + 15;
    minute <= 15 * 60 + 15;
    minute += 15
  ) {
    const index = candles.length;

    const close =
      basePrice +
      index * 0.5 +
      Math.sin(index / 3) * 5;

    const open = close - 0.5;

    candles.push({
      timestamp: new Date(
        Date.UTC(
          date.year,
          date.month - 1,
          date.day,
          Math.floor(minute / 60) - 5,
          minute % 60 - 30
        )
      ).toISOString(),
      open,
      high: close + 2,
      low: open - 2,
      close,
      volume: 1000 + index
    });
  }

  return candles;
}

function makeFullHistory() {
  return SESSION_DATES.flatMap(
    (date, index) =>
      makeSession(
        date,
        25000 + index * 20
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

function mockFetch(pages) {
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
        `Unexpected API offset: ${offset}`
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
// TEST 1: COMPLETE PIPELINE
// ------------------------------------------------------

{
  const candles = makeFullHistory();

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
    mockFetch(pages);

  const result =
    await runHistoricalAnalysisApiPipeline({
      apiBaseUrl: "https://example.test",
      pageSize: 100,
      fetchImpl,
      now: FIXED_NOW
    });

  assert.equal(result.status, "OK");
  assert.equal(result.module,
    "HISTORICAL_ANALYSIS_API_PIPELINE");

  assert.equal(result.dataType,
    "HISTORICAL_ONLY");

  assert.equal(result.timeframe, "15m");
  assert.equal(result.candleCount, 200);

  assert.equal(result.fetch.status, "OK");
  assert.equal(result.fetch.pagesRead, 2);

  assert.deepEqual(requests, [0, 100]);

  assert.equal(
    result.gapValidation.quality,
    "VALID"
  );

  assert.equal(
    result.report.status,
    "OK"
  );

  assert.equal(
    result.report.reportInfo.candleCount,
    200
  );

  assert.equal(
    result.validation.apiFetchValid,
    true
  );

  assert.equal(
    result.validation.intradayGapCheckValid,
    true
  );

  assert.equal(
    result.validation.historicalReportValid,
    true
  );

  console.log(
    "PASS: Complete historical API pipeline"
  );
}

// ------------------------------------------------------
// TEST 2: AUTOMATIC COMPLETED DATES
// ------------------------------------------------------

{
  const candles = makeFullHistory();

  const pages = new Map([
    [
      0,
      makePayload(candles, {
        limit: 500,
        hasMore: false
      })
    ]
  ]);

  const { fetchImpl } = mockFetch(pages);

  const result =
    await runHistoricalAnalysisApiPipeline({
      apiBaseUrl: "https://example.test",
      fetchImpl,
      now: FIXED_NOW
    });

  assert.equal(result.status, "OK");

  assert.deepEqual(
    result.sessionValidation
      .automaticCompletedSessionDates,
    [
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-23",
      "2026-11-24",
      "2026-11-25"
    ]
  );

  console.log(
    "PASS: Automatic completed session dates"
  );
}

// ------------------------------------------------------
// TEST 3: MANUAL DATE MERGE
// ------------------------------------------------------

{
  const candles = makeFullHistory();

  const pages = new Map([
    [
      0,
      makePayload(candles, {
        limit: 500,
        hasMore: false
      })
    ]
  ]);

  const { fetchImpl } = mockFetch(pages);

  const result =
    await runHistoricalAnalysisApiPipeline({
      apiBaseUrl: "https://example.test",
      fetchImpl,
      now: FIXED_NOW,
      completedSessionDates: [
        "2026-11-25",
        "2026-11-25",
        "2026-11-24",
        "invalid-date",
        "2026-02-30"
      ]
    });

  assert.equal(result.status, "OK");

  assert.deepEqual(
    result.sessionValidation.completedSessionDates,
    [
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-23",
      "2026-11-24",
      "2026-11-25"
    ]
  );

  assert.equal(
    result.gapValidation.boundaryGapCount,
    0
  );

  console.log(
    "PASS: Manual dates merge and deduplicate"
  );
}

// ------------------------------------------------------
// TEST 4: CURRENT DATE EXCLUDED AUTOMATICALLY
// ------------------------------------------------------

{
  const today = {
    year: 2026,
    month: 11,
    day: 26
  };

  const candles = [
    ...makeFullHistory(),
    ...makeSession(today, 25200)
  ];

  const pages = new Map([
    [
      0,
      makePayload(candles, {
        limit: 500,
        hasMore: false
      })
    ]
  ]);

  const { fetchImpl } = mockFetch(pages);

  const result =
    await runHistoricalAnalysisApiPipeline({
      apiBaseUrl: "https://example.test",
      fetchImpl,
      now: FIXED_NOW
    });

  assert.equal(result.status, "OK");

  assert.ok(
    !result.sessionValidation
      .automaticCompletedSessionDates
      .includes("2026-11-26")
  );

  console.log(
    "PASS: Current date excluded automatically"
  );
}

// ------------------------------------------------------
// TEST 5: DATA QUALITY GATE
// ------------------------------------------------------

{
  const candles = makeFullHistory();

  // Remove the first candle of a completed session.
  // The boundary validator should catch it.
  const missingStart = candles.filter(
    candle =>
      candle.timestamp !==
      makeSession(
        SESSION_DATES[0]
      )[0].timestamp
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

  const { fetchImpl } = mockFetch(pages);

  const result =
    await runHistoricalAnalysisApiPipeline({
      apiBaseUrl: "https://example.test",
      fetchImpl,
      now: FIXED_NOW
    });

  assert.equal(result.status, "ERROR");

  assert.equal(
    result.gapValidation.quality,
    "ISSUES_FOUND"
  );

  assert.equal(
    result.gapValidation
      .boundaryMissingCandleCount,
    1
  );

  // Pipeline must stop before report generation.
  assert.equal(result.report, null);

  assert.match(
    result.error,
    /validation failed|gap validation/i
  );

  console.log(
    "PASS: Invalid data blocks report generation"
  );
}

// ------------------------------------------------------
// TEST 6: EMPTY HISTORICAL STORAGE
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

  const { fetchImpl } = mockFetch(pages);

  const result =
    await runHistoricalAnalysisApiPipeline({
      apiBaseUrl: "https://example.test",
      fetchImpl,
      now: FIXED_NOW
    });

  assert.equal(result.status, "NO_DATA");
  assert.equal(result.candleCount, 0);
  assert.equal(result.report, null);
  assert.equal(result.gapValidation, null);

  console.log(
    "PASS: Empty historical storage"
  );
}

// ------------------------------------------------------
// TEST 7: API FETCH ERROR
// ------------------------------------------------------

{
  const fetchImpl = async () => ({
    ok: false,
    status: 503,
    json: async () => ({})
  });

  const result =
    await runHistoricalAnalysisApiPipeline({
      apiBaseUrl: "https://example.test",
      fetchImpl,
      now: FIXED_NOW
    });

  assert.equal(result.status, "ERROR");
  assert.equal(result.report, null);

  assert.match(
    result.error,
    /HTTP 503/
  );

  console.log(
    "PASS: API failure blocks pipeline"
  );
}

// ------------------------------------------------------
// TEST 8: UNSUPPORTED TIMEFRAME
// ------------------------------------------------------

{
  const result =
    await runHistoricalAnalysisApiPipeline({
      timeframe: "5m"
    });

  assert.equal(result.status, "ERROR");

  assert.match(
    result.error,
    /supports 15m timeframe only/
  );

  console.log(
    "PASS: Unsupported timeframe rejected"
  );
}

// ------------------------------------------------------
// TEST 9: INVALID MAX CANDLE CONFIGURATION
// ------------------------------------------------------

{
  const result =
    await runHistoricalAnalysisApiPipeline({
      maxCandles: 100
    });

  assert.equal(result.status, "ERROR");

  assert.match(
    result.error,
    /maxCandles must be an integer/
  );

  console.log(
    "PASS: Invalid max candle setting rejected"
  );
}

// ------------------------------------------------------
// TEST 10: HISTORICAL-ONLY SAFETY
// ------------------------------------------------------

{
  const candles = makeFullHistory();

  const pages = new Map([
    [
      0,
      makePayload(candles, {
        limit: 500,
        hasMore: false
      })
    ]
  ]);

  const { fetchImpl } = mockFetch(pages);

  const result =
    await runHistoricalAnalysisApiPipeline({
      apiBaseUrl: "https://example.test",
      fetchImpl,
      now: FIXED_NOW
    });

  assert.equal(result.status, "OK");
  assert.equal(result.dataType, "HISTORICAL_ONLY");

  assert.match(
    result.note,
    /No forecasts/
  );

  assert.match(
    result.note,
    /trading recommendations/
  );

  console.log(
    "PASS: Historical-only safety"
  );
}

console.log(
  "\nALL 10 HISTORICAL API PIPELINE TESTS PASSED"
);
