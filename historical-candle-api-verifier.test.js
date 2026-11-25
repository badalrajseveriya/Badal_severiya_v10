
import {
  readAllServerCandles,
  verifyHistoricalCandleReadBack,
  normalizeCandle
} from "./historical-candle-api-verifier.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertRejects(fn, message) {
  let rejected = false;

  try {
    await fn();
  } catch {
    rejected = true;
  }

  assert(rejected, message);
}

function candle(index) {
  const timestamp = new Date(
    Date.UTC(2026, 0, 1, 0, index * 15)
  ).toISOString();

  const price = 25000 + index;

  return {
    timestamp,
    open: price,
    high: price + 10,
    low: price - 5,
    close: price + 5,
    volume: 1000 + index
  };
}

function mockResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    }
  };
}

function createPagedFetch(allCandles, options = {}) {
  const requests = [];
  const descending = [...allCandles].reverse();

  return {
    requests,

    fetchImpl: async (url) => {
      requests.push(url);

      const parsed = new URL(url);
      const offset = Number(parsed.searchParams.get("offset"));
      const limit = Number(parsed.searchParams.get("limit"));

      if (options.failAtOffset === offset) {
        return mockResponse(500, {
          error: "Simulated server failure"
        });
      }

      let page = descending
        .slice(offset, offset + limit)
        .reverse();

      if (
        options.duplicateAtOffset === offset &&
        page.length > 0
      ) {
        page = [...page, page[page.length - 1]];
      }

      return mockResponse(200, {
        candles: page,
        limit,
        offset,
        hasMore: offset + limit < descending.length
      });
    }
  };
}

const validOptions = {
  apiBaseUrl: "https://example-worker.example.com",
  index: "NIFTY",
  timeframe: "15m"
};

// 1. Normalize valid candle
{
  const result = normalizeCandle(candle(1));

  assert(
    result.timestamp === candle(1).timestamp,
    "Timestamp normalization failed"
  );

  assert(
    result.open === candle(1).open,
    "Open normalization failed"
  );

  assert(
    result.volume === candle(1).volume,
    "Volume normalization failed"
  );
}

// 2. Reject invalid timestamp
{
  await assertRejects(
    async () => normalizeCandle({
      ...candle(1),
      timestamp: "not-a-date"
    }),
    "Invalid timestamp should be rejected"
  );
}

// 3. Read more than 5000 candles using pagination
{
  const expected = Array.from(
    { length: 5400 },
    (_, index) => candle(index)
  );

  const mock = createPagedFetch(expected);

  const result = await readAllServerCandles({
    ...validOptions,
    pageSize: 5000,
    fetchImpl: mock.fetchImpl
  });

  assert(
    result.rowsRead === 5400,
    "Pagination total row count error"
  );

  assert(
    result.uniqueCandles === 5400,
    "Pagination unique candle count error"
  );

  assert(
    result.pagesRead === 2,
    "Expected exactly 2 pagination pages"
  );

  assert(
    mock.requests.length === 2,
    "Expected exactly 2 API requests"
  );

  assert(
    new URL(mock.requests[0]).searchParams.get("offset") === "0",
    "First page offset error"
  );

  assert(
    new URL(mock.requests[1]).searchParams.get("offset") === "5000",
    "Second page offset error"
  );
}

// 4. Verify all 5400 candles successfully
{
  const expected = Array.from(
    { length: 5400 },
    (_, index) => candle(index)
  );

  const mock = createPagedFetch(expected);

  const report = await verifyHistoricalCandleReadBack(
    expected,
    {
      ...validOptions,
      fetchImpl: mock.fetchImpl
    }
  );

  assert(
    report.status === "VERIFIED",
    "Expected VERIFIED status"
  );

  assert(
    report.summary.expectedCount === 5400,
    "Expected candle count error"
  );

  assert(
    report.summary.verifiedCount === 5400,
    "Verified candle count error"
  );

  assert(
    report.summary.missingCount === 0,
    "Unexpected missing candles"
  );

  assert(
    report.summary.mismatchCount === 0,
    "Unexpected mismatches"
  );

  assert(
    report.summary.pagesRead === 2,
    "Verification pagination count error"
  );
}

// 5. Detect missing candle
{
  const expected = [
    candle(0),
    candle(1),
    candle(2)
  ];

  const server = [
    candle(0),
    candle(2)
  ];

  const mock = createPagedFetch(server);

  const report = await verifyHistoricalCandleReadBack(
    expected,
    {
      ...validOptions,
      fetchImpl: mock.fetchImpl
    }
  );

  assert(
    report.status === "MISSING",
    "Missing candle status error"
  );

  assert(
    report.summary.missingCount === 1,
    "Missing candle count error"
  );

  assert(
    report.missingTimestamps[0] === candle(1).timestamp,
    "Missing timestamp detection error"
  );
}

// 6. Detect OHLC mismatch
{
  const expected = [candle(0)];

  const changed = {
    ...candle(0),
    close: candle(0).close + 50
  };

  const mock = createPagedFetch([changed]);

  const report = await verifyHistoricalCandleReadBack(
    expected,
    {
      ...validOptions,
      fetchImpl: mock.fetchImpl
    }
  );

  assert(
    report.status === "MISMATCH",
    "Mismatch status error"
  );

  assert(
    report.summary.mismatchCount === 1,
    "Mismatch count error"
  );

  assert(
    report.mismatches[0].fields.some(
      field => field.field === "close"
    ),
    "Close mismatch was not identified"
  );
}

// 7. Detect volume mismatch
{
  const expected = [candle(0)];

  const changed = {
    ...candle(0),
    volume: candle(0).volume + 1
  };

  const mock = createPagedFetch([changed]);

  const report = await verifyHistoricalCandleReadBack(
    expected,
    {
      ...validOptions,
      fetchImpl: mock.fetchImpl
    }
  );

  assert(
    report.status === "MISMATCH",
    "Volume mismatch status error"
  );

  assert(
    report.mismatches[0].fields.some(
      field => field.field === "volume"
    ),
    "Volume mismatch was not identified"
  );
}

// 8. Skip volume comparison when expected volume is unavailable
{
  const expected = [{
    ...candle(0),
    volume: null
  }];

  const server = [{
    ...candle(0),
    volume: 12345
  }];

  const mock = createPagedFetch(server);

  const report = await verifyHistoricalCandleReadBack(
    expected,
    {
      ...validOptions,
      fetchImpl: mock.fetchImpl
    }
  );

  assert(
    report.status === "VERIFIED",
    "Unavailable expected volume should be skipped"
  );
}

// 9. Detect duplicate timestamps from server
{
  const expected = [
    candle(0),
    candle(1)
  ];

  const mock = createPagedFetch(
    expected,
    {
      duplicateAtOffset: 0
    }
  );

  const report = await verifyHistoricalCandleReadBack(
    expected,
    {
      ...validOptions,
      fetchImpl: mock.fetchImpl
    }
  );

  assert(
    report.status === "MISSING",
    "Server duplicate should not be VERIFIED"
  );

  assert(
    report.summary.serverDuplicateCount === 1,
    "Server duplicate count error"
  );
}

// 10. Detect duplicate expected timestamps
{
  const expected = [
    candle(0),
    candle(0)
  ];

  const mock = createPagedFetch([candle(0)]);

  const report = await verifyHistoricalCandleReadBack(
    expected,
    {
      ...validOptions,
      fetchImpl: mock.fetchImpl
    }
  );

  assert(
    report.status === "MISSING",
    "Expected duplicate should not be VERIFIED"
  );

  assert(
    report.summary.expectedDuplicateCount === 1,
    "Expected duplicate count error"
  );
}

// 11. Reject invalid API URL configuration
{
  await assertRejects(
    () => readAllServerCandles({
      ...validOptions,
      apiBaseUrl: "",
      fetchImpl: async () => mockResponse(200, {
        candles: [],
        hasMore: false
      })
    }),
    "Missing API URL should be rejected"
  );
}

// 12. Reject invalid page size
{
  await assertRejects(
    () => readAllServerCandles({
      ...validOptions,
      pageSize: 6000,
      fetchImpl: async () => mockResponse(200, {
        candles: [],
        hasMore: false
      })
    }),
    "Page size above 5000 should be rejected"
  );
}

// 13. Reject server HTTP error
{
  await assertRejects(
    () => readAllServerCandles({
      ...validOptions,
      fetchImpl: async () => mockResponse(500, {
        error: "Server error"
      })
    }),
    "HTTP server error should be rejected"
  );
}

// 14. Reject invalid API response shape
{
  await assertRejects(
    () => readAllServerCandles({
      ...validOptions,
      fetchImpl: async () => mockResponse(200, {
        data: []
      })
    }),
    "Invalid API response should be rejected"
  );
}

// 15. Reject empty expected data
{
  await assertRejects(
    () => verifyHistoricalCandleReadBack(
      [],
      validOptions
    ),
    "Empty expected data should be rejected"
  );
}

// 16. Verify progress callback
{
  const expected = [
    candle(0),
    candle(1),
    candle(2)
  ];

  const mock = createPagedFetch(expected);
  const progress = [];

  await readAllServerCandles({
    ...validOptions,
    pageSize: 2,
    fetchImpl: mock.fetchImpl,
    onProgress: event => progress.push(event)
  });

  assert(
    progress.length === 2,
    "Progress callback count error"
  );

  assert(
    progress[0].pagesRead === 1 &&
    progress[1].pagesRead === 2,
    "Progress page sequence error"
  );
}

console.log(
  "HISTORICAL CANDLE API VERIFIER TESTS PASSED"
);
