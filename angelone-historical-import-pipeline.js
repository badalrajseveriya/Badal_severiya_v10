
/**
 * BADAL SEVERIYA V12
 * Angel One -> Historical D1 Import Pipeline
 *
 * Flow:
 * 1. Fetch existing D1 candles (all pages).
 * 2. Convert Angel One response.
 * 3. Validate, merge and deduplicate.
 * 4. Prepare safe upload batches.
 * 5. Sequentially upload batches to D1.
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
    throw new Error(
      "API base URL must use HTTPS."
    );
  }

  return parsed.href.replace(/\/+$/, "");
}

function validateFetch(fetchImpl) {
  if (typeof fetchImpl !== "function") {
    throw new Error(
      "Fetch implementation is unavailable."
    );
  }
}

async function readJsonResponse(response, label) {
  if (
    !response ||
    typeof response.json !== "function"
  ) {
    throw new Error(
      `${label}: invalid HTTP response.`
    );
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
    throw new Error(
      `${label}: invalid JSON response.`
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    throw new Error(
      `${label}: response body is invalid.`
    );
  }

  return body;
}

/**
 * Fetches all existing D1 candle pages.
 *
 * D1 API uses limit and offset pagination.
 * Results are later normalized and sorted by
 * the historical candle merge engine.
 */
export async function fetchExistingHistoricalCandles({
  apiBaseUrl,
  index,
  timeframe,
  fetchImpl = globalThis.fetch,
  pageSize = MAX_PAGE_SIZE
} = {}) {
  const baseUrl =
    validateApiBaseUrl(apiBaseUrl);

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

  const normalizedIndex =
    index.trim().toUpperCase();

  const normalizedTimeframe =
    timeframe.trim();

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
      `${baseUrl}/api/data/candles?` +
      params.toString();

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

    if (typeof body.hasMore !== "boolean") {
      throw new Error(
        `Invalid D1 pagination flag at offset ${offset}.`
      );
    }

    if (
      body.candles.length === 0 &&
      body.hasMore === true
    ) {
      throw new Error(
        "D1 returned an empty page while hasMore is true."
      );
    }

    allCandles.push(...body.candles);
    pageCount++;

    if (body.hasMore === false) {
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
    `D1 pagination exceeded ${MAX_PAGES} pages.`
  );
}

/**
 * Full Angel One historical import pipeline.
 *
 * Required:
 * - response
 * - apiBaseUrl
 * - token
 *
 * Optional:
 * - index
 * - timeframe
 * - batchSize
 * - pageSize
 * - fetchImpl (testing)
 * - onProgress
 *
 * Ingest token is runtime-only.
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
  const baseUrl =
    validateApiBaseUrl(apiBaseUrl);

  validateFetch(fetchImpl);

  if (
    typeof token !== "string" ||
    !token.trim()
  ) {
    throw new Error(
      "Ingest token is required."
    );
  }

  if (
    !["15m", "1d"].includes(timeframe)
  ) {
    throw new Error(
      "Timeframe must be 15m or 1d."
    );
  }

  if (
    typeof index !== "string" ||
    !index.trim()
  ) {
    throw new Error("Index is required.");
  }

  // Step 1: Read the complete existing D1 dataset.
  const existingResult =
    await fetchExistingHistoricalCandles({
      apiBaseUrl: baseUrl,
      index,
      timeframe,
      fetchImpl,
      pageSize
    });

  // Step 2: Convert, validate, merge and batch.
  const preparedImport =
    prepareAngelOneHistoricalImport({
      response,
      index,
      timeframe,
      existingCandles:
        existingResult.candles,
      batchSize
    });

  // Step 3: Upload sequentially.
  // Upload helper stops after the first failure.
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
      pageCount:
        existingResult.pageCount,

      candleCount:
        existingResult.candleCount
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
