
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

function candle(date, hour, minute, close = 102) {
  return {
    timestamp: new Date(
      istTimestamp(date, hour, minute)
    ).toISOString(),
    open: 100,
    high: 105,
    low: 95,
    close,
    volume: 1000
  };
}

function fullSession(date) {
  const result = [];

  for (
    let minute = 9 * 60 + 15;
    minute <= 15 * 60 + 15;
    minute += 15
  ) {
    result.push(
      candle(
        date,
        Math.floor(minute / 60),
        minute % 60
      )
    );
  }

  return result;
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

  const fetchImpl = async (url, options) => {
    const parsedUrl = new URL(url);

    const offset = Number(
      parsedUrl.searchParams.get("offset")
    );

    const limit = Number(
      parsedUrl.searchParams.get("limit")
    );

    requests.push({
      url: parsedUrl,
      options,
      offset,
      limit
    });

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
// TEST 1: AUTOMATIC DATE DETECTION
// ======================================================

runTest(
  "Detects historical IST dates automatically",
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
// TEST 2: EXCLUDES TODAY
// ======================================================

runTest(
  "Excludes current IST date",
  () => {
    const candles = [
      candle(
        { year: 2026, month: 11, day: 26 },
        9, 15
      ),
      candle(
        { year: 2026, month: 11, day: 26 },
        10, 0
      )
    ];

    assert.deepEqual(
      getAutomaticCompletedSessionDates(
        candles,
        FIXED_NOW
      ),
      []
    );
  }
);

// ======================================================
// TEST 3: INVALID DATE INPUT
// ======================================================

runTest(
  "Handles invalid date helper input safely",
  () => {
    assert.deepEqual(
      getAutomaticCompletedSessionDates(
        null,
        FIXED_NOW
      ),
      []
    );

    assert.deepEqual(
      getAutomaticCompletedSessionDates(
        [
          { timestamp: "invalid" },
          { timestamp: null },
          {}
        ],
        FIXED_NOW
      ),
      []
    );
  }
);

// ======================================================
// TEST 4: SORT AND DEDUPLICATE DATES
// ======================================================

runTest(
  "Automatic dates are sorted and deduplicated",
  () => {
    const candles = [
      candle(
        { year: 2026, month: 11, day: 25 },
        9, 15
      ),
      candle(
        { year: 2026, month: 11, day: 24 },
        9, 15
      ),
      candle(
        { year: 2026, month: 11, day: 25 },
        9, 30
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
// TEST 5: PAGINATION
// ======================================================

await runAsyncTest(
  "Fetches multiple API pages using correct offsets",
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
      requests.map(item => item.offset),
      [0, 2]
    );

    assert.deepEqual(
      result.candles,
      [...page1, ...page2]
    );
  }
);

// ======================================================
// TEST 6: REVERSED API PAGE ORDER
// ======================================================

await runAsyncTest(
  "Globally sorts reverse-ordered API pages",
  async () => {
    const date = {
      year: 2026,
      month: 11,
      day: 24
    };

    // API offset 0 returns newer candles first.
    const newerPage = [
      candle(date, 10, 0),
      candle(date, 10, 15)
    ];

    // API offset 2 returns older candles.
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
    assert.equal(result.candleCount, 4);

    assert.deepEqual(
      result.candles.map(c => c.timestamp),
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
// TEST 7: SORTS OUT-OF-ORDER ROWS
// ======================================================

await runAsyncTest(
  "Sorts out-of-order rows inside API pages",
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
      result.candles.map(c => c.timestamp),
      [
        unsorted[1].timestamp,
        unsorted[0].timestamp,
        unsorted[2].timestamp
      ]
    );
  }
);

// ======================================================
// TEST 8: DUPLICATE TIMESTAMPS
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
// TEST 9: EMPTY API RESPONSE
// ======================================================

await runAsyncTest(
  "Handles empty API response safely",
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

    const { fetchImpl, requests } =
      mockFetchFromPages(pages);

    const result =
      await fetchAllHistoricalCandles({
        apiBaseUrl: "https://example.test",
        pageSize: 10,
        fetchImpl
      });

    assert.equal(result.status, "OK");
    assert.equal(result.candleCount, 0);
    assert.equal(result.pagesRead, 1);
    assert.equal(requests.length, 1);
  }
);

// ======================================================
// TEST 10: INVALID APPLICATION
// ======================================================

await runAsyncTest(
  "Rejects wrong API application identifier",
  async () => {
    const payload = {
      ...makeApiPayload([]),
      app: "WRONG APP"
    };

    const pages = new Map([
      [0, payload]
    ]);

    const { fetchImpl } =
      mockFetchFromPages(pages);

    const result =
      await fetchAllHistoricalCandles({
        apiBaseUrl: "https://example.test",
        fetchImpl
      });

    assert.equal(result.status, "ERROR");

    assert.match(
      result.error,
      /Invalid historical API application/
    );
  }
);

// ======================================================
// TEST 11: INDEX / TIMEFRAME MISMATCH
// ======================================================

await runAsyncTest(
  "Rejects index and timeframe mismatch",
  async () => {
    const pages = new Map([
      [
        0,
        makeApiPayload([], {
          index: "BANKNIFTY",
          timeframe: "5m"
        })
      ]
    ]);

    const { fetchImpl } =
      mockFetchFromPages(pages);

    const result =
      await fetchAllHistoricalCandles({
        apiBaseUrl: "https://example.test",
        fetchImpl
      });

    assert.equal(result.status, "ERROR");

    assert.match(
      result.error,
      /mismatched index\/timeframe/
    );
  }
);

// ======================================================
// TEST 12: HTTP ERROR
// ======================================================

await runAsyncTest(
  "Handles HTTP errors safely",
  async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 503,
      json: async () => ({})
    });

    const result =
      await fetchAllHistoricalCandles({
        apiBaseUrl: "https://example.test",
        fetchImpl
      });

    assert.equal(result.status, "ERROR");

    assert.match(
      result.error,
      /HTTP 503/
    );
  }
);

// ======================================================
// TEST 13: INVALID PAGE SIZE
// ======================================================

await runAsyncTest(
  "Rejects invalid page size",
  async () => {
    const result =
      await fetchAllHistoricalCandles({
        pageSize: 5001,
        fetchImpl: async () => {
          throw new Error(
            "Fetch should not run"
          );
        }
      });

    assert.equal(result.status, "ERROR");

    assert.match(
      result.error,
      /Page size must be between/
    );
  }
);

// ======================================================
// TEST 14: AUTOMATIC SESSION BOUNDARIES
// ======================================================

await runAsyncTest(
  "Automatically checks completed session boundaries",
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

    assert.equal(result.status, "ERROR");

    assert.deepEqual(
      result.automaticCompletedSessionDates,
      ["2026-11-24"]
    );

    assert.deepEqual(
      result.completedSessionDates,
      ["2026-11-24"]
    );

    assert.equal(
      result.gapCheck.boundaryCheckStatus,
      "CHECKED"
    );

    assert.equal(
      result.gapCheck.boundaryGapCount,
      2
    );

    assert.equal(
      result.gapCheck.boundaryMissingCandleCount,
      2
    );
  }
);

// ======================================================
// TEST 15: MANUAL DATE MERGE
// ======================================================

await runAsyncTest(
  "Merges manual dates with automatic dates",
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
        now: FIXED_NOW,
        completedSessionDates: [
          "2026-11-25",
          "2026-11-25",
          "invalid-date"
        ]
      });

    assert.equal(result.status, "OK");

    assert.deepEqual(
      result.automaticCompletedSessionDates,
      [
        "2026-11-24",
        "2026-11-25"
      ]
    );

    assert.deepEqual(
      result.completedSessionDates,
      [
        "2026-11-24",
        "2026-11-25"
      ]
    );

    assert.equal(
      result.gapCheck.boundaryCheckStatus,
      "CHECKED"
    );

    assert.equal(
      result.gapCheck.boundaryGapCount,
      0
    );

    assert.equal(
      result.gapCheck.quality,
      "VALID"
    );
  }
);

// ======================================================
// TEST 16: TODAY EXCLUDED
// ======================================================

await runAsyncTest(
  "Current day is excluded from boundary checks",
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
// TEST 17: FETCH FAILURE
// ======================================================

await runAsyncTest(
  "Runner returns safe error report on API failure",
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

    assert.equal(
      result.module,
      "INTRADAY_GAP_API_RUNNER"
    );

    assert.equal(result.gapCheck, null);

    assert.match(
      result.error,
      /HTTP 500/
    );
  }
);

// ======================================================
// TEST 18: NO DATA
// ======================================================

await runAsyncTest(
  "Runner reports NO_DATA for empty storage",
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
    assert.equal(result.gapCheck, null);
    assert.equal(result.fetch.candleCount, 0);
  }
);

// ======================================================
// ALL TESTS
// ======================================================

console.log("\n========================================");
console.log(
  "ALL 18 INTRADAY GAP API RUNNER TESTS PASSED"
);
console.log("========================================");
