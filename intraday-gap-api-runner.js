
/* ======================================================
   BADAL SEVERIYA V12
   INTRADAY GAP API RUNNER
   GLOBAL CHRONOLOGICAL SORT
   QUALITY STATUS SEPARATE FROM EXECUTION STATUS
====================================================== */

import {
  analyzeIntradayGaps
} from "./intraday-gap-check.js";

const DEFAULT_API_BASE =
  "https://badal-severiya-data.mrstarrdbs.workers.dev";

const DEFAULT_PAGE_SIZE = 5000;
const MAX_PAGE_SIZE = 5000;
const MAX_PAGES = 1000;
const IST_OFFSET_MS = 330 * 60 * 1000;

// ------------------------------------------------------
// IST DATE
// ------------------------------------------------------

function getISTDateKey(timestampMs) {
  const shifted = new Date(
    timestampMs + IST_OFFSET_MS
  );

  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0")
  ].join("-");
}

export function getAutomaticCompletedSessionDates(
  candles,
  now = Date.now()
) {
  if (!Array.isArray(candles)) {
    return [];
  }

  const todayIST = getISTDateKey(now);
  const dates = new Set();

  for (const candle of candles) {
    const timestamp = Date.parse(
      candle?.timestamp
    );

    if (!Number.isFinite(timestamp)) {
      continue;
    }

    const dateKey = getISTDateKey(timestamp);

    if (dateKey < todayIST) {
      dates.add(dateKey);
    }
  }

  return [...dates].sort();
}

// ------------------------------------------------------
// API URL
// ------------------------------------------------------

function buildCandleApiUrl({
  apiBaseUrl,
  index,
  timeframe,
  limit,
  offset
}) {
  const base = String(apiBaseUrl)
    .replace(/\/+$/, "");

  const url = new URL(
    `${base}/api/data/candles`
  );

  url.searchParams.set("index", index);
  url.searchParams.set("timeframe", timeframe);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));

  return url.toString();
}

// ------------------------------------------------------
// VALIDATE API PAGE
// ------------------------------------------------------

function validateApiPage(payload, {
  index,
  timeframe,
  limit
}) {
  if (
    !payload ||
    payload.app !== "BADAL SEVERIYA DATA V11"
  ) {
    throw new Error(
      "Invalid historical API application response."
    );
  }

  if (
    payload.index !== index ||
    payload.timeframe !== timeframe
  ) {
    throw new Error(
      "Historical API returned mismatched index/timeframe."
    );
  }

  if (!Array.isArray(payload.candles)) {
    throw new Error(
      "Historical API candles array is missing."
    );
  }

  if (payload.candles.length > limit) {
    throw new Error(
      "Historical API returned more candles than requested."
    );
  }

  for (
    let i = 0;
    i < payload.candles.length;
    i++
  ) {
    const candle = payload.candles[i];

    if (
      !Number.isFinite(
        Date.parse(candle?.timestamp)
      )
    ) {
      throw new Error(
        `Invalid timestamp in API page at row ${i}.`
      );
    }

    const fields = [
      candle.open,
      candle.high,
      candle.low,
      candle.close
    ];

    if (
      !fields.every(value =>
        Number.isFinite(Number(value))
      )
    ) {
      throw new Error(
        `Invalid OHLC values in API page at row ${i}.`
      );
    }
  }

  return payload;
}

// ------------------------------------------------------
// GLOBAL SORT
// ------------------------------------------------------

function sortCandlesChronologically(candles) {
  return candles
    .map((candle, originalIndex) => ({
      candle,
      originalIndex,
      timestamp: Date.parse(candle.timestamp)
    }))
    .sort((a, b) =>
      a.timestamp - b.timestamp ||
      a.originalIndex - b.originalIndex
    )
    .map(item => item.candle);
}

function validateChronologicalCandles(candles) {
  let previousTimestamp = -Infinity;

  for (
    let i = 0;
    i < candles.length;
    i++
  ) {
    const timestamp = Date.parse(
      candles[i]?.timestamp
    );

    if (!Number.isFinite(timestamp)) {
      throw new Error(
        `Invalid final timestamp at candle ${i}.`
      );
    }

    if (timestamp === previousTimestamp) {
      throw new Error(
        `Duplicate timestamp detected after sorting at candle ${i}: ${candles[i].timestamp}`
      );
    }

    if (timestamp < previousTimestamp) {
      throw new Error(
        "Chronological sorting failed."
      );
    }

    previousTimestamp = timestamp;
  }
}

// ------------------------------------------------------
// FETCH ALL PAGES
// ------------------------------------------------------

export async function fetchAllHistoricalCandles({
  apiBaseUrl = DEFAULT_API_BASE,
  index = "NIFTY",
  timeframe = "15m",
  pageSize = DEFAULT_PAGE_SIZE,
  fetchImpl = globalThis.fetch,
  onProgress
} = {}) {
  try {
    if (
      typeof apiBaseUrl !== "string" ||
      !apiBaseUrl.trim()
    ) {
      throw new Error(
        "API base URL is required."
      );
    }

    if (
      typeof index !== "string" ||
      !index.trim()
    ) {
      throw new Error(
        "Index is required."
      );
    }

    if (timeframe !== "15m") {
      throw new Error(
        "This runner currently supports 15m timeframe only."
      );
    }

    if (
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > MAX_PAGE_SIZE
    ) {
      throw new Error(
        `Page size must be between 1 and ${MAX_PAGE_SIZE}.`
      );
    }

    if (typeof fetchImpl !== "function") {
      throw new Error(
        "Fetch implementation is unavailable."
      );
    }

    const pages = [];

    let offset = 0;
    let pagesRead = 0;
    let rowsRead = 0;
    let hasMore = true;

    while (hasMore) {
      if (pagesRead >= MAX_PAGES) {
        throw new Error(
          "Maximum historical pagination limit reached."
        );
      }

      const url = buildCandleApiUrl({
        apiBaseUrl,
        index,
        timeframe,
        limit: pageSize,
        offset
      });

      const response = await fetchImpl(
        url,
        {
          method: "GET",
          cache: "no-store",
          headers: {
            Accept: "application/json"
          }
        }
      );

      if (!response || !response.ok) {
        throw new Error(
          `Historical API request failed: HTTP ${
            response?.status ?? "UNKNOWN"
          }`
        );
      }

      const payload = await response.json();

      validateApiPage(payload, {
        index,
        timeframe,
        limit: pageSize
      });

      const pageCandles =
        payload.candles;

      pagesRead++;
      rowsRead += pageCandles.length;

      if (pageCandles.length > 0) {
        pages.push(pageCandles);
      }

      if (typeof onProgress === "function") {
        onProgress({
          pagesRead,
          rowsRead,
          currentOffset: offset,
          currentPageCount:
            pageCandles.length
        });
      }

      hasMore =
        payload.hasMore === true &&
        pageCandles.length > 0;

      if (hasMore) {
        offset += pageSize;
      }
    }

    // Combine all API pages before sorting.
    const combinedCandles =
      pages.flat();

    // Sort the complete dataset globally.
    const candles =
      sortCandlesChronologically(
        combinedCandles
      );

    // Reject duplicates after global sorting.
    validateChronologicalCandles(candles);

    return {
      status: "OK",
      source: "D1_HISTORICAL_STORAGE",
      dataType: "HISTORICAL",
      index,
      timeframe,
      candleCount: candles.length,
      pagesRead,
      rowsRead,
      candles
    };

  } catch (error) {
    return {
      status: "ERROR",
      source: "D1_HISTORICAL_STORAGE",
      dataType: "HISTORICAL",
      index,
      timeframe,
      candleCount: 0,
      pagesRead: 0,
      rowsRead: 0,
      candles: [],
      error:
        error?.message ||
        "Unknown historical API error."
    };
  }
}

// ------------------------------------------------------
// RUN GAP CHECK
// ------------------------------------------------------

export async function runIntradayGapApiCheck({
  apiBaseUrl = DEFAULT_API_BASE,
  index = "NIFTY",
  timeframe = "15m",
  pageSize = DEFAULT_PAGE_SIZE,
  fetchImpl = globalThis.fetch,
  completedSessionDates,
  now = Date.now(),
  onProgress
} = {}) {
  const fetched =
    await fetchAllHistoricalCandles({
      apiBaseUrl,
      index,
      timeframe,
      pageSize,
      fetchImpl,
      onProgress
    });

  if (fetched.status !== "OK") {
    return {
      status: "ERROR",
      module: "INTRADAY_GAP_API_RUNNER",
      version: "1.4",
      index,
      timeframe,
      dataSource:
        "D1_HISTORICAL_STORAGE",
      fetch: fetched,
      quality: "ERROR",
      issuesFound: true,
      completedSessionDates: [],
      automaticCompletedSessionDates: [],
      gapCheck: null,
      error: fetched.error
    };
  }

  if (fetched.candleCount === 0) {
    return {
      status: "NO_DATA",
      module: "INTRADAY_GAP_API_RUNNER",
      version: "1.4",
      index,
      timeframe,
      dataSource:
        "D1_HISTORICAL_STORAGE",
      fetch: fetched,
      quality: "NO_DATA",
      issuesFound: false,
      completedSessionDates: [],
      automaticCompletedSessionDates: [],
      gapCheck: null,
      error: null
    };
  }

  const automaticDates =
    getAutomaticCompletedSessionDates(
      fetched.candles,
      now
    );

  const manualDates =
    Array.isArray(completedSessionDates)
      ? completedSessionDates.filter(
          date =>
            typeof date === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(date)
        )
      : [];

  const datesToCheck = [
    ...new Set([
      ...automaticDates,
      ...manualDates
    ])
  ].sort();

  const gapCheck =
    analyzeIntradayGaps(
      fetched.candles,
      {
        intervalMinutes: 15,
        checkSessionBoundaries:
          datesToCheck.length > 0,
        completedSessionDates:
          datesToCheck
      }
    );

  // Execution status is separate from data quality.
  const executionSucceeded =
    gapCheck.status === "OK";

  const quality =
    gapCheck.quality ??
    "UNKNOWN";

  const issuesFound =
    quality === "ISSUES_FOUND";

  return {
    status:
      executionSucceeded
        ? "OK"
        : "ERROR",

    module:
      "INTRADAY_GAP_API_RUNNER",

    version: "1.4",

    index,
    timeframe,

    dataSource:
      "D1_HISTORICAL_STORAGE",

    completedSessionDates:
      datesToCheck,

    automaticCompletedSessionDates:
      automaticDates,

    fetch: {
      status: fetched.status,
      candleCount:
        fetched.candleCount,
      pagesRead:
        fetched.pagesRead,
      rowsRead:
        fetched.rowsRead,
      source:
        fetched.source
    },

    // Separate execution and quality status.
    executionSucceeded,
    quality,
    issuesFound,

    // Convenience summary values.
    boundaryGapCount:
      gapCheck.boundaryGapCount ?? 0,

    boundaryMissingCandleCount:
      gapCheck.boundaryMissingCandleCount ?? 0,

    duplicateCount:
      gapCheck.duplicateCount ?? 0,

    missingCandleCount:
      gapCheck.missingCandleCount ?? 0,

    irregularIntervalCount:
      gapCheck.irregularIntervalCount ?? 0,

    offSessionCount:
      gapCheck.offSessionCount ?? 0,

    gapCheck,

    error:
      executionSucceeded
        ? null
        : gapCheck.error ||
          "Gap analysis execution failed."
  };
}

// ------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------

export const INTRADAY_GAP_API_RUNNER_CONFIG = {
  apiBaseUrl: DEFAULT_API_BASE,
  index: "NIFTY",
  timeframe: "15m",
  pageSize: DEFAULT_PAGE_SIZE,
  maxPageSize: MAX_PAGE_SIZE,
  maxPages: MAX_PAGES,
  timezone: "Asia/Kolkata",
  source: "D1_HISTORICAL_STORAGE",
  automaticSessionBoundaryCheck: true,
  globalChronologicalSorting: true,
  separateExecutionAndQualityStatus: true
};
