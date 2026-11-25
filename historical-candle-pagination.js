
const DEFAULT_PAGE_SIZE = 5000;
const DEFAULT_MAX_CANDLES = 25000;
const ABSOLUTE_MAX_CANDLES = 10000000;

async function requestCandlePage({
  apiBase,
  timeframe,
  index,
  limit,
  offset,
  fetchImpl
}) {
  const url = new URL("/api/data/candles", apiBase);

  url.searchParams.set("index", index);
  url.searchParams.set("timeframe", timeframe);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));

  const response = await fetchImpl(url.toString(), {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Historical API error: HTTP ${response.status}`);
  }

  const result = await response.json();

  if (
    !result ||
    result.app !== "BADAL SEVERIYA DATA V11" ||
    !Array.isArray(result.candles)
  ) {
    throw new Error("Invalid historical API response.");
  }

  if (result.candles.length > limit) {
    throw new Error("API returned more candles than requested.");
  }

  return result;
}

function validateChronologicalCandles(candles) {
  let previousTime = -Infinity;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const timestamp = Date.parse(candle?.timestamp);

    if (!Number.isFinite(timestamp)) {
      throw new Error(`Invalid candle timestamp at position ${i}.`);
    }

    if (timestamp <= previousTime) {
      throw new Error(
        "Duplicate or out-of-order candles detected in historical pages."
      );
    }

    previousTime = timestamp;
  }
}

export async function fetchHistoricalCandlePages({
  apiBase,
  timeframe,
  index = "NIFTY",
  maxCandles = DEFAULT_MAX_CANDLES,
  pageSize = DEFAULT_PAGE_SIZE,
  fetchImpl = globalThis.fetch
} = {}) {
  try {
    if (
      typeof apiBase !== "string" ||
      !apiBase.trim()
    ) {
      throw new Error("API base URL is required.");
    }

    if (!["1d", "15m"].includes(timeframe)) {
      throw new Error("Unsupported timeframe.");
    }

    if (
      typeof index !== "string" ||
      !index.trim()
    ) {
      throw new Error("Invalid index.");
    }

    if (
      !Number.isSafeInteger(maxCandles) ||
      maxCandles < 1 ||
      maxCandles > ABSOLUTE_MAX_CANDLES
    ) {
      throw new Error("Invalid maximum candle limit.");
    }

    if (
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > DEFAULT_PAGE_SIZE
    ) {
      throw new Error("Invalid page size.");
    }

    if (typeof fetchImpl !== "function") {
      throw new Error("Fetch implementation is unavailable.");
    }

    const pages = [];
    let offset = 0;
    let totalFetched = 0;
    let hasMore = false;

    while (totalFetched < maxCandles) {
      const remaining = maxCandles - totalFetched;
      const limit = Math.min(pageSize, remaining);

      const result = await requestCandlePage({
        apiBase,
        timeframe,
        index,
        limit,
        offset,
        fetchImpl
      });

      if (result.candles.length === 0) {
        hasMore = false;
        break;
      }

      pages.push(result.candles);
      totalFetched += result.candles.length;

      hasMore =
        typeof result.hasMore === "boolean"
          ? result.hasMore
          : result.candles.length === limit;

      if (!hasMore) {
        break;
      }

      offset += result.candles.length;
    }

    // If the dashboard limit is reached, verify whether
    // another database candle actually exists.
    if (totalFetched >= maxCandles && hasMore) {
      const probe = await requestCandlePage({
        apiBase,
        timeframe,
        index,
        limit: 1,
        offset: totalFetched,
        fetchImpl
      });

      hasMore = probe.candles.length > 0;
    }

    // API returns the newest page first.
    // Each page itself is already in ascending order.
    // Reverse only the page order to restore chronology.
    const candles = pages
      .reverse()
      .flat();

    // Never silently accept duplicate or unordered candles.
    validateChronologicalCandles(candles);

    return {
      status: "OK",
      dataType: "HISTORICAL_ONLY",
      timeframe,
      index,
      candleCount: candles.length,
      pageCount: pages.length,
      maxCandlesAllowed: maxCandles,
      hasMore,
      truncated: hasMore,
      candles,
      note: hasMore
        ? "Dashboard candle limit reached. Older database candles remain available."
        : "All available historical pages were fetched."
    };

  } catch (error) {
    return {
      status: "ERROR",
      dataType: "HISTORICAL_ONLY",
      error: error.message,
      candles: [],
      candleCount: 0
    };
  }
}
