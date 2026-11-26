/**
 * BADAL SEVERIYA V12
 * Angel One -> Historical D1 Automatic Import Pipeline
 *
 * Angel One response
 * -> conversion/validation
 * -> fetch existing D1 history (paginated)
 * -> merge/deduplicate
 * -> batches
 * -> sequential D1 upload
 *
 * Historical data only.
 * No trading or order placement.
 */

import {
  prepareAngelOneHistoricalImport
} from "./angelone-historical-import-controller.js";

import {
  runHistoricalCandleApiUpload
} from "./historical-candle-api-uploader.js";

const MAX_PAGE_SIZE = 5000;
const MAX_PAGES = 2000;

function validateApiBaseUrl(apiBaseUrl) {
  if (
    typeof apiBaseUrl !== "string" ||
    !apiBaseUrl.trim()
  ) {
    throw new Error("API base URL is required.");
  }

  let parsed;

  try {
    parsed = new URL(apiBaseUrl.trim());
  } catch {
    throw new Error("Invalid API base URL.");
  }

  if (
    parsed.protocol !== "https:" &&
    parsed.hostname !== "localhost"
  ) {
    throw new Error("API base URL must use HTTPS.");
  }

  return parsed.href.replace(/\/+$/, "");
}

function validateFetch(fetchImpl) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch implementation is unavailable.");
  }
}

async function readJsonResponse(response, label) {
  if (!response || typeof response.json !== "function") {
    throw new Error(`${label}: invalid HTTP response.`);
  }

  if (!response.ok) {
    throw new Error(
      `${label}: HTTP ${response.status}.`
    );
  }

  let body;

  try {
    body = await response.json();
  } catch {
    throw new Error(`${label}: invalid JSON response.`);
  }

  if (!body || typeof body !== "object") {
    throw new Error(`${label}: response body is invalid.`);
  }

  return body;
}

/**
 * Read the existing dataset from D1 using API pagination.
 *
 * API offset 0 returns the newest page.
 * Higher offsets return older pages.
 *
 * All pages are combined. The merge engine subsequently
 * normalizes and sorts the combined candle dataset.
 */
export async function fetchExistingHistoricalCandles({
  apiBaseUrl,
  index,
  timeframe,
  fetchImpl = globalThis.fetch,
  pageSize = MAX_PAGE_SIZE
} = {}) {
  const baseUrl = validateApiBaseUrl(apiBaseUrl);
  validateFetch(fetchImpl);

  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > MAX_PAGE_SIZE
  ) {
    throw new Error(
      "Page size must be between 1 and 5000."
    );
  }

  if (
    typeof index !== "string" ||
    !index.trim()
  ) {
    throw new Error("Index is required.");
  }

  if (
    typeof timeframe !== "string" ||
    !timeframe.trim()
  ) {
    throw new Error("Timeframe is required.");
  }

  const normalizedIndex = index.trim().toUpperCase();
  const normalizedTimeframe = timeframe.trim();

  const allCandles = [];
  let offset = 0;
  let pageCount = 0;

  while (pageCount < MAX_PAGES) {
    const params = new URLSearchParams({
      index: normalizedIndex,
      timeframe: normalizedTimeframe,
      limit: String(pageSize),
      offset: String(offset)
    });

    const url =
      `${baseUrl}/api/data/candles?${params.toString()}`;

    let response;

    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/json"
        }
      });
    } catch (error) {
      throw new Error(
        `D1 historical fetch failed at offset ${offset}: ` +
        (error?.message ?? String(error))
      );
    }

    const body = await readJsonResponse(
      response,
      `D1 historical fetch at offset ${offset}`
    );

    if (
      !Array.isArray(body.candles) ||
      !Number.isInteger(body.count) ||
      body.count !== body.candles.length
    ) {
      throw new Error(
        `Invalid D1 candle page at offset ${offset}.`
      );
    }

    if (
      body.index !== normalizedIndex ||
      body.timeframe !== normalizedTimeframe
    ) {
      throw new Error(
        `D1 returned unexpected index/timeframe at offset ${offset}.`
      );
    }

    if (
      body.candles.length === 0 &&
      body.hasMore === true
    ) {
      throw new Error(
        "D1 pagination returned an empty page while hasMore is true."
      );
    }

    allCandles.push(...body.candles);
    pageCount++;

    if (body.hasMore !== true) {
      return {
        status: "completed",
        index: normalizedIndex,
        timeframe: normalizedTimeframe,
        pageCount,
        candleCount: allCandles.length,
        candles: allCandles
      };
    }

    offset += pageSize;
  }

  throw new Error(
    `D1 pagination exceeded the maximum of ${MAX_PAGES} pages.`
  );
}

/**
 * Complete Angel One historical import.
 *
 * Required runtime options:
 * - response: Angel One historical API response
 * - apiBaseUrl: D1 Worker base URL
 * - token: ingest token (runtime only)
 * - index: NIFTY etc.
 * - timeframe: 15m or 1d
 *
 * fetchImpl may be injected for testing.
 */
export async function runAngelOneHistoricalImportPipeline({
  response,
  apiBaseUrl,
  token,
  index = "NIFTY",
  timeframe = "15m",
  batchSize = MAX_PAGE_SIZE,
  pageSize = MAX_PAGE_SIZE,
  fetchImpl = globalThis.fetch,
  onProgress
} = {}) {
  const baseUrl = validateApiBaseUrl(apiBaseUrl);
  validateFetch(fetchImpl);

  if (
    typeof token !== "string" ||
    !token.trim()
  ) {
    throw new Error("Ingest token is required.");
  }

  if (
    !["15m", "1d"].includes(timeframe)
  ) {
    throw new Error(
      "Timeframe must be 15m or 1d."
    );
  }

  // Step 1: Fetch every existing D1 page.
  const existingResult =
    await fetchExistingHistoricalCandles({
      apiBaseUrl: baseUrl,
      index,
      timeframe,
      fetchImpl,
      pageSize
    });

  // Step 2: Convert, validate, merge and prepare batches.
  const preparedImport =
    prepareAngelOneHistoricalImport({
      response,
      index,
      timeframe,
      existingCandles: existingResult.candles,
      batchSize
    });

  // Step 3: Sequentially upload batches to D1.
  const uploadResult =
    await runHistoricalCandleApiUpload(
      preparedImport,
      {
        apiBaseUrl: baseUrl,
        token,
        index,
        timeframe,
        fetchImpl,
        onProgress
      }
    );

  return {
    status: uploadResult.status,

    dataType: "HISTORICAL_ONLY",
    source: "ANGEL_ONE_SMARTAPI",

    index,
    timeframe,

    existingFetch: {
      pageCount: existingResult.pageCount,
      candleCount: existingResult.candleCount
    },

    preparation: {
      incomingCandleCount:
        preparedImport.incomingCandleCount,

      duplicateAgainstExisting:
        preparedImport.duplicateAgainstExisting,

      finalUniqueCandleCount:
        preparedImport.finalUniqueCandleCount,

      batchSize:
        preparedImport.batchSize,

      batchCount:
        preparedImport.batchCount
    },

    upload: uploadResult,

    note:
      "Historical import only. No trading or order placement."
  };
}