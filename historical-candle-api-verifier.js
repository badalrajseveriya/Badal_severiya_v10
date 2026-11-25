
/**
 * BADAL SEVERIYA V12
 * Historical Candle API Read-back Verifier
 *
 * Reads all historical candles from API with pagination.
 * Compares expected data with server data.
 * Detects missing timestamps, OHLCV mismatches and duplicates.
 *
 * No live trading or order execution.
 */

const DEFAULT_PAGE_SIZE = 5000;
const MAX_OFFSET = 10000000;
const MAX_REPORT_ITEMS = 1000;

function normalizeTimestamp(value) {
  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid candle timestamp: ${value}`);
  }

  return new Date(parsed).toISOString();
}

function normalizeNumber(value, fieldName) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for ${fieldName}: ${value}`);
  }

  return parsed;
}

function normalizeCandle(candle) {
  if (!candle || typeof candle !== "object") {
    throw new Error("Candle must be an object.");
  }

  const timestamp =
    candle.timestamp ??
    candle.candle_time ??
    candle.time ??
    candle.datetime;

  if (timestamp === undefined || timestamp === null) {
    throw new Error("Candle timestamp is missing.");
  }

  return {
    timestamp: normalizeTimestamp(timestamp),
    open: normalizeNumber(candle.open, "open"),
    high: normalizeNumber(candle.high, "high"),
    low: normalizeNumber(candle.low, "low"),
    close: normalizeNumber(candle.close, "close"),
    volume: normalizeNumber(candle.volume, "volume")
  };
}

function extractExpectedCandles(input) {
  if (Array.isArray(input)) {
    return input;
  }

  if (input && Array.isArray(input.candles)) {
    return input.candles;
  }

  if (input && Array.isArray(input.batches)) {
    return input.batches.flatMap((batch) => {
      if (!batch || !Array.isArray(batch.candles)) {
        throw new Error("Invalid prepared import batch.");
      }

      return batch.candles;
    });
  }

  throw new Error(
    "Expected candles must be an array, an object with candles, " +
    "or a prepared import with batches."
  );
}

function compareValue(expected, actual) {
  if (expected === null || expected === undefined) {
    return {
      compared: false,
      match: true
    };
  }

  if (actual === null || actual === undefined) {
    return {
      compared: true,
      match: false
    };
  }

  return {
    compared: true,
    match: Number(expected) === Number(actual)
  };
}

function compareCandles(expected, actual) {
  const fields = ["open", "high", "low", "close", "volume"];
  const mismatches = [];

  for (const field of fields) {
    const result = compareValue(expected[field], actual[field]);

    if (result.compared && !result.match) {
      mismatches.push({
        field,
        expected: expected[field],
        actual: actual[field]
      });
    }
  }

  return mismatches;
}

function createApiUrl(apiBaseUrl, index, timeframe, limit, offset) {
  const base = String(apiBaseUrl).replace(/\/+$/, "");

  const params = new URLSearchParams({
    index: String(index),
    timeframe: String(timeframe),
    limit: String(limit),
    offset: String(offset)
  });

  return `${base}/api/data/candles?${params.toString()}`;
}

async function readAllServerCandles(options = {}) {
  const {
    apiBaseUrl,
    index,
    timeframe,
    fetchImpl = globalThis.fetch,
    pageSize = DEFAULT_PAGE_SIZE,
    onProgress
  } = options;

  if (!apiBaseUrl) {
    throw new Error("apiBaseUrl is required.");
  }

  if (!index) {
    throw new Error("index is required.");
  }

  if (!timeframe) {
    throw new Error("timeframe is required.");
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("A valid fetch implementation is required.");
  }

  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > DEFAULT_PAGE_SIZE
  ) {
    throw new Error(
      `pageSize must be an integer between 1 and ${DEFAULT_PAGE_SIZE}.`
    );
  }

  const maxPages = Math.floor(MAX_OFFSET / pageSize) + 1;
  const candlesByTimestamp = new Map();
  const duplicateTimestamps = [];

  let offset = 0;
  let pagesRead = 0;
  let rowsRead = 0;
  let hasMore = true;

  while (hasMore) {
    if (pagesRead >= maxPages) {
      throw new Error("Maximum pagination page count exceeded.");
    }

    if (offset > MAX_OFFSET) {
      throw new Error("Maximum API offset exceeded.");
    }

    const url = createApiUrl(
      apiBaseUrl,
      index,
      timeframe,
      pageSize,
      offset
    );

    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response || !response.ok) {
      const status = response ? response.status : "unknown";

      throw new Error(
        `Candle read-back request failed. HTTP ${status}.`
      );
    }

    const payload = await response.json();

    if (!payload || !Array.isArray(payload.candles)) {
      throw new Error(
        "Invalid API response: candles array is missing."
      );
    }

    const pageCandles = payload.candles;

    pagesRead += 1;
    rowsRead += pageCandles.length;

    for (const rawCandle of pageCandles) {
      const candle = normalizeCandle(rawCandle);

      if (candlesByTimestamp.has(candle.timestamp)) {
        duplicateTimestamps.push(candle.timestamp);
      } else {
        candlesByTimestamp.set(candle.timestamp, candle);
      }
    }

    if (typeof onProgress === "function") {
      onProgress({
        pagesRead,
        rowsRead,
        uniqueCandles: candlesByTimestamp.size,
        offset,
        pageCount: pageCandles.length
      });
    }

    hasMore =
      payload.hasMore === true &&
      pageCandles.length > 0;

    if (hasMore) {
      offset += pageSize;
    }
  }

  return {
    candles: Array.from(candlesByTimestamp.values()),
    pagesRead,
    rowsRead,
    uniqueCandles: candlesByTimestamp.size,
    duplicateTimestamps,
    duplicateCount: duplicateTimestamps.length
  };
}

async function verifyHistoricalCandleReadBack(
  expectedInput,
  options = {}
) {
  const expectedRaw = extractExpectedCandles(expectedInput);

  if (expectedRaw.length === 0) {
    throw new Error("No expected candles were supplied for verification.");
  }

  const expectedByTimestamp = new Map();
  const expectedDuplicates = [];

  for (const rawCandle of expectedRaw) {
    const candle = normalizeCandle(rawCandle);

    if (expectedByTimestamp.has(candle.timestamp)) {
      expectedDuplicates.push(candle.timestamp);
    } else {
      expectedByTimestamp.set(candle.timestamp, candle);
    }
  }

  const serverResult = await readAllServerCandles(options);

  const serverByTimestamp = new Map(
    serverResult.candles.map((candle) => [
      candle.timestamp,
      candle
    ])
  );

  const missingTimestamps = [];
  const mismatches = [];

  let verifiedCount = 0;

  for (const [timestamp, expected] of expectedByTimestamp) {
    const actual = serverByTimestamp.get(timestamp);

    if (!actual) {
      missingTimestamps.push(timestamp);
      continue;
    }

    const candleMismatches = compareCandles(expected, actual);

    if (candleMismatches.length > 0) {
      mismatches.push({
        timestamp,
        fields: candleMismatches
      });
    } else {
      verifiedCount += 1;
    }
  }

  let status = "VERIFIED";

  if (mismatches.length > 0) {
    status = "MISMATCH";
  } else if (
    missingTimestamps.length > 0 ||
    expectedDuplicates.length > 0 ||
    serverResult.duplicateCount > 0
  ) {
    status = "MISSING";
  }

  return {
    app: "BADAL SEVERIYA V12",
    verification: "HISTORICAL_READ_BACK",
    status,
    index: options.index,
    timeframe: options.timeframe,

    summary: {
      expectedCount: expectedRaw.length,
      expectedUniqueCount: expectedByTimestamp.size,
      serverRowsRead: serverResult.rowsRead,
      serverUniqueCount: serverResult.uniqueCandles,
      verifiedCount,
      missingCount: missingTimestamps.length,
      mismatchCount: mismatches.length,
      expectedDuplicateCount: expectedDuplicates.length,
      serverDuplicateCount: serverResult.duplicateCount,
      pagesRead: serverResult.pagesRead
    },

    missingTimestamps: missingTimestamps.slice(0, MAX_REPORT_ITEMS),
    mismatches: mismatches.slice(0, MAX_REPORT_ITEMS),
    expectedDuplicates: expectedDuplicates.slice(0, MAX_REPORT_ITEMS),
    serverDuplicates: serverResult.duplicateTimestamps.slice(
      0,
      MAX_REPORT_ITEMS
    ),

    reportTruncated:
      missingTimestamps.length > MAX_REPORT_ITEMS ||
      mismatches.length > MAX_REPORT_ITEMS ||
      expectedDuplicates.length > MAX_REPORT_ITEMS ||
      serverResult.duplicateTimestamps.length > MAX_REPORT_ITEMS,

    completedAt: new Date().toISOString()
  };
}

export {
  readAllServerCandles,
  verifyHistoricalCandleReadBack,
  normalizeCandle,
  normalizeTimestamp
};
