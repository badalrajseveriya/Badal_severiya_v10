
import assert from "node:assert/strict";

import {
  fetchAllHistoricalCandles,
  getAutomaticCompletedSessionDates,
  runIntradayGapApiCheck
} from "./intraday-gap-api-runner.js";

// ======================================================
// HELPERS
// ======================================================

const FIXED_NOW = Date.parse(
  "2026-11-26T12:00:00.000Z"
);

function istTimestamp(date, hour, minute) {
  return Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    hour - 5,
    minute - 30
  );
}

function candle(date, hour, minute) {
  return {
    timestamp: new Date(
      istTimestamp(date, hour, minute)
    ).toISOString(),
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: 1000
  };
}

function fullSession(date) {
  const candles = [];

  for (
    let minute = 9 * 60 + 15;
    minute <= 15 * 60 + 15;
    minute += 15
  ) {
    candles.push(
      candle(
        date,
        Math.floor(minute / 60),
        minute % 60
      )
    );
  }

  return candles;
}

function makeApiPayload(candles, {
  offset = 0,
  limit = 5000,
  hasMore = false,
  index = "NIFTY",
  timeframe = "15m"
} = {}) {
  return {
    app: "BADAL SEVERIYA DATA V11",
    index,
    timeframe,
    count: candles.length,
    limit,
    offset,
    hasMore,
    source: "D1_HISTORICAL_STORAGE",
    dataType: "HISTORICAL",
    candles
  };
}

function mockFetchFromPages(pages) {
  const requests = [];

  const fetchImpl = async url => {
    const parsedUrl = new URL(url);

    const offset = Number(
      parsedUrl.searchParams.get("offset")
    );

    requests.push(offset);

    const page = pages.get(offset);

    if (!page) {
      throw new Error(
        `Unexpected API offset: ${offset}`
      );
    }

    return {
      ok: true,
      status: 200,
      json: async () => page
    };
  };

  return {
    fetchImpl,
    requests
  };
}

function runTest(name, fn) {
  fn();
  console.log(`PASS: ${name}`);
}

async function runAsyncTest(name, fn) {
  await fn();
  console.log(`PASS: ${name}`);
}

// ======================================================
// TEST 1: AUTOMATIC IST DATE DETECTION
// ======================================================

runTest(
  "Detects past dates and excludes current IST date",
  () => {
    const candles = [
      candle(
        { year: 2026, month: 11, day: 24 },
        9, 15
      ),
      candle(
        { year: 2026, month: 11, day: 25 },
        9, 15
      ),
      candle(
        { year: 2026, month: 11, day: 26 },
        9, 15
      )
    ];

    assert.deepEqual(
      getAutomaticCompletedSessionDates(
        candles,
        FIXED_NOW
      ),
      ["2026-11-24", "2026-11-25"]
    );
  }
);

// ======================================================
// TEST 2: PAGINATION
// ======================================================

await runAsyncTest(
  "Fetches multiple pages with correct offsets",
  async () => {
    const date = {
      year: 2026,
      month: 11,
      day: 24
    };

    const page1 = [
      candle(date, 9, 15),
      candle(date, 9, 30)
    ];

    const page2 = [
      candle(date, 9, 45),
      candle(date, 10, 0)
    ];

    const pages = new Map([
      [
        0,
        makeApiPayload(page1, {
          offset: 0,
          limit: 2,
          hasMore: true
        })
      ],
      [
        2,
        makeApiPayload(page2, {
          offset: 2,
          limit: 2,
          hasMore: false
        })
      ]
    ]);

    const { fetchImpl, requests } =
      mockFetchFromPages(pages);

    const result =
      await fetchAllHistoricalCandles({
        apiBaseUrl: "https://example.test",
        pageSize: 2,
        fetchImpl
      });

    assert.equal(result.status, "OK");
    assert.equal(result.candleCount, 4);
    assert.equal(result.pagesRead, 2);

    assert.deepEqual(
      requests,
      [0, 2]
    );
  }
);

// ======================================================
// TEST 3: GLOBAL PAGE SORTING
// ======================================================

await runAsyncTest(
  "Globally sorts reverse-ordered API pages",
  async () => {
    const date = {
      year: 2026,
      month: 11,
      day: 24
    };

    const newerPage = [
      candle(date, 10, 0),
      candle(date, 10, 15)
    ];

    const olderPage = [
      candle(date, 9, 15),
      candle(date, 9, 30)
    ];

    const pages = new Map([
      [
        0,
        makeApiPayload(newerPage, {
          offset: 0,
          limit: 2,
          hasMore: true
        })
      ],
      [
        2,
        makeApiPayload(olderPage, {
          offset: 2,
          limit: 2,
          hasMore: false
        })
      ]
    ]);

    const { fetchImpl } =
      mockFetchFromPages(pages);

    const result =
      await fetchAllHistoricalCandles({
        apiBaseUrl: "https://example.test",
        pageSize: 2,
        fetchImpl
      });

    assert.equal(result.status, "OK");

    assert.deepEqual(
      result.candles.map(
        item => item.timestamp
      ),
      [
        olderPage[0].timestamp,
        olderPage[1].timestamp,
        newerPage[0].timestamp,
        newerPage[1].timestamp
      ]
    );
  }
);

// ======================================================
// TEST 4: SORT ROWS INSIDE PAGE
// ======================================================

await runAsyncTest(
  "Sorts out-of-order rows within a page",
  async () => {
    const date = {
      year: 2026,
      month: 11,
      day: 24
    };

    const unsorted = [
      candle(date, 9, 30),
      candle(date, 9, 15),
      candle(date, 9, 45)
    ];

    const pages = new Map([
      [
        0,
        makeApiPayload(unsorted, {
          offset: 0,
          limit: 10,
          hasMore: false
        })
      ]
    ]);

    const { fetchImpl } =
      mockFetchFromPages(pages);

    const result =
      await fetchAllHistoricalCandles({
        apiBaseUrl: "https://example.test",
        pageSize: 10,
        fetchImpl
      });

    assert.equal(result.status, "OK");

    assert.deepEqual(
      result.candles.map(
        item => item.timestamp
      ),
      [
        unsorted[1].timestamp,
        unsorted[0].timestamp,
        unsorted[2].timestamp
      ]
    );
  }
);

// ======================================================
// TEST 5: DUPLICATE TIMESTAMPS
// ======================================================

await runAsyncTest(
  "Rejects duplicate timestamps across pages",
  async () => {
    const date = {
      year: 2026,
      month: 11,
      day: 24
    };

    const duplicate = candle(date, 9, 30);

    const pages = new Map([
      [
        0,
        makeApiPayload(
          [
            candle(date, 9, 15),
            duplicate
          ],
          {
            offset: 0,
            limit: 2,
            hasMore: true
          }
        )
      ],
      [
        2,
        makeApiPayload(
          [
            duplicate,
            candle(date, 9, 45)
          ],
          {
            offset: 2,
            limit: 2,
            hasMore: false
          }
        )
      ]
    ]);

    const { fetchImpl } =
      mockFetchFromPages(pages);

    const result =
      await fetchAllHistoricalCandles({
        apiBaseUrl: "https://example.test",
        pageSize: 2,
        fetchImpl
      });

    assert.equal(result.status, "ERROR");

    assert.match(
      result.error,
      /Duplicate timestamp/
    );
  }
);

// ======================================================
// TEST 6: BOUNDARY QUALITY STATUS
// ======================================================

await runAsyncTest(
  "Boundary gaps affect quality but not execution status",
  async () => {
    const date = {
      year: 2026,
      month: 11,
      day: 24
    };

    const partialSession = [
      candle(date, 9, 30),
      candle(date, 15, 0)
    ];

    const pages = new Map([
      [
        0,
        makeApiPayload(partialSession, {
          offset: 0,
          limit: 10,
          hasMore: false
        })
      ]
    ]);

    const { fetchImpl } =
      mockFetchFromPages(pages);

    const result =
      await runIntradayGapApiCheck({
        apiBaseUrl: "https://example.test",
        pageSize: 10,
        fetchImpl,
        now: FIXED_NOW
      });

    // The analysis itself completed.
    assert.equal(result.status, "OK");
    assert.equal(result.executionSucceeded, true);

    // The historical data has quality issues.
    assert.equal(result.quality, "ISSUES_FOUND");
    assert.equal(result.issuesFound, true);

    assert.equal(
      result.boundaryGapCount,
      2
    );

    assert.equal(
      result.boundaryMissingCandleCount,
      2
    );

    assert.equal(
      result.gapCheck.boundaryCheckStatus,
      "CHECKED"
    );
  }
);

// ======================================================
// TEST 7: COMPLETE SESSION
// ======================================================

await runAsyncTest(
  "Complete sessions produce VALID quality",
  async () => {
    const date1 = {
      year: 2026,
      month: 11,
      day: 24
    };

    const date2 = {
      year: 2026,
      month: 11,
      day: 25
    };

    const candles = [
      ...fullSession(date1),
      ...fullSession(date2)
    ];

    const pages = new Map([
      [
        0,
        makeApiPayload(candles, {
          offset: 0,
          limit: 100,
          hasMore: false
        })
      ]
    ]);

    const { fetchImpl } =
      mockFetchFromPages(pages);

    const result =
      await runIntradayGapApiCheck({
        apiBaseUrl: "https://example.test",
        pageSize: 100,
        fetchImpl,
        now: FIXED_NOW
      });

    assert.equal(result.status, "OK");
    assert.equal(result.executionSucceeded, true);
    assert.equal(result.quality, "VALID");
    assert.equal(result.issuesFound, false);

    assert.equal(
      result.boundaryGapCount,
      0
    );

    assert.equal(
      result.boundaryMissingCandleCount,
      0
    );
  }
);

// ======================================================
// TEST 8: CURRENT DATE EXCLUDED
// ======================================================

await runAsyncTest(
  "Current IST date is excluded from boundary checks",
  async () => {
    const today = {
      year: 2026,
      month: 11,
      day: 26
    };

    const candles = [
      candle(today, 9, 15),
      candle(today, 10, 0)
    ];

    const pages = new Map([
      [
        0,
        makeApiPayload(candles, {
          offset: 0,
          limit: 10,
          hasMore: false
        })
      ]
    ]);

    const { fetchImpl } =
      mockFetchFromPages(pages);

    const result =
      await runIntradayGapApiCheck({
        apiBaseUrl: "https://example.test",
        pageSize: 10,
        fetchImpl,
        now: FIXED_NOW
      });

    assert.equal(result.status, "OK");

    assert.deepEqual(
      result.automaticCompletedSessionDates,
      []
    );

    assert.equal(
      result.gapCheck.boundaryCheckStatus,
      "NO_COMPLETED_DATES"
    );
  }
);

// ======================================================
// TEST 9: API ERROR
// ======================================================

await asyncTest(
  "API failure returns ERROR status",
  async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 500,
      json: async () => ({})
    });

    const result =
      await runIntradayGapApiCheck({
        apiBaseUrl: "https://example.test",
        fetchImpl,
        now: FIXED_NOW
      });

    assert.equal(result.status, "ERROR");
    assert.equal(result.quality, "ERROR");
    assert.equal(result.gapCheck, null);

    assert.match(
      result.error,
      /HTTP 500/
    );
  }
);

// ======================================================
// TEST 10: EMPTY DATABASE
// ======================================================

await asyncTest(
  "Empty database safely returns NO_DATA",
  async () => {
    const pages = new Map([
      [
        0,
        makeApiPayload([], {
          offset: 0,
          limit: 10,
          hasMore: false
        })
      ]
    ]);

    const { fetchImpl } =
      mockFetchFromPages(pages);

    const result =
      await runIntradayGapApiCheck({
        apiBaseUrl: "https://example.test",
        pageSize: 10,
        fetchImpl,
        now: FIXED_NOW
      });

    assert.equal(result.status, "NO_DATA");
    assert.equal(result.quality, "NO_DATA");
    assert.equal(result.issuesFound, false);
    assert.equal(result.gapCheck, null);
  }
);

// ======================================================
// ALL TESTS
// ======================================================

console.log("\n========================================");
console.log(
  "ALL 10 INTRADAY GAP API RUNNER TESTS PASSED"
);
console.log("========================================");
