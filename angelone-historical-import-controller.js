
/**
 * BADAL SEVERIYA V12
 * Angel One Historical Import Controller
 *
 * Angel One response
 * -> converter
 * -> merge/deduplicate
 * -> validation
 * -> safe-size batches
 *
 * Historical data only.
 * No trading, order placement or database writes here.
 */

import {
  convertAngelOneCandles
} from "./angelone-converter.js";

import {
  prepareHistoricalCandleBatchImport
} from "./historical-candle-batch-import.js";

// ------------------------------------------------------
// Configuration
// ------------------------------------------------------

const ALLOWED_TIMEFRAMES = Object.freeze([
  "15m",
  "1d"
]);

const INDIA_TIMEZONE_OFFSET = "+05:30";

// ------------------------------------------------------
// Timestamp normalization for duplicate comparison
// Matches the historical merge engine's conventions.
// ------------------------------------------------------

function normalizeTimestampForComparison(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    throw new Error(
      "Existing candle timestamp is missing."
    );
  }

  let milliseconds;

  // Unix timestamp seconds or milliseconds.
  if (typeof value === "number") {
    milliseconds =
      value < 1e12
        ? value * 1000
        : value;
  } else {
    let text = String(value).trim();

    if (!text) {
      throw new Error(
        "Existing candle timestamp is empty."
      );
    }

    // Normalize common date/time format.
    text = text.replace(
      /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)/,
      "$1T$2"
    );

    // Assume IST if timezone is not supplied.
    const hasTimezone =
      /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);

    if (!hasTimezone) {
      text += INDIA_TIMEZONE_OFFSET;
    }

    milliseconds = Date.parse(text);
  }

  if (!Number.isFinite(milliseconds)) {
    throw new Error(
      `Invalid existing candle timestamp: ${value}`
    );
  }

  return new Date(milliseconds).toISOString();
}

// ------------------------------------------------------
// Prepare historical import
// ------------------------------------------------------

/**
 * Converts Angel One historical response and prepares
 * merged candles and batches.
 *
 * No database upload is performed here.
 */
export function prepareAngelOneHistoricalImport({
  response,
  index = "NIFTY",
  timeframe = "15m",
  existingCandles = [],
  batchSize = 5000
} = {}) {
  if (!ALLOWED_TIMEFRAMES.includes(timeframe)) {
    throw new Error(
      "Angel One import timeframe must be 15m or 1d."
    );
  }

  if (!Array.isArray(existingCandles)) {
    throw new Error(
      "Existing historical candles must be an array."
    );
  }

  // Convert and validate the Angel One response.
  const converted = convertAngelOneCandles(
    response,
    index,
    timeframe
  );

  // Prepare merged, validated and deduplicated data.
  const prepared =
    prepareHistoricalCandleBatchImport({
      existingCandles,
      incomingCandles: converted.candles,
      batchSize
    });

  // Normalize existing timestamps consistently.
  const existingTimestampSet = new Set(
    existingCandles.map(candle =>
      normalizeTimestampForComparison(
        candle.timestamp ??
        candle.time ??
        candle.date
      )
    )
  );

  // Incoming converter timestamps are already normalized
  // to ISO UTC strings.
  const incomingDuplicateCount =
    converted.candles.filter(candle =>
      existingTimestampSet.has(candle.timestamp)
    ).length;

  return {
    status: "prepared",
    dataType: "REAL_HISTORICAL",

    source: converted.source,
    index: converted.index,
    timeframe: converted.timeframe,
    exchange: converted.exchange,
    symbolToken: converted.symbolToken,

    incomingCandleCount:
      converted.candles.length,

    existingCandleCount:
      existingCandles.length,

    duplicateAgainstExisting:
      incomingDuplicateCount,

    finalUniqueCandleCount:
      prepared.stats.uniqueCount,

    batchSize: prepared.batchSize,
    batchCount: prepared.batchCount,
    batches: prepared.batches,

    mergeStats: prepared.stats,

    note:
      "Prepared only. Database upload is not performed."
  };
}

// ------------------------------------------------------
// Sequential upload wrapper
// ------------------------------------------------------

/**
 * Uploads prepared batches sequentially.
 *
 * The caller supplies the uploader function.
 * This controller performs no network request itself.
 *
 * On failure, upload stops immediately.
 */
export async function runAngelOneHistoricalImport(
  preparedImport,
  uploader
) {
  if (
    !preparedImport ||
    preparedImport.status !== "prepared" ||
    !Array.isArray(preparedImport.batches)
  ) {
    throw new Error(
      "A prepared Angel One historical import is required."
    );
  }

  if (typeof uploader !== "function") {
    throw new Error(
      "A database uploader function is required."
    );
  }

  const declaredBatchCount =
    preparedImport.batchCount;

  if (
    !Number.isInteger(declaredBatchCount) ||
    declaredBatchCount < 0 ||
    declaredBatchCount !==
      preparedImport.batches.length
  ) {
    throw new Error(
      "Prepared import batch count is invalid."
    );
  }

  let uploadedBatchCount = 0;
  let uploadedCandleCount = 0;

  for (const batch of preparedImport.batches) {
    try {
      await uploader(batch);

      uploadedBatchCount++;
      uploadedCandleCount += batch.candleCount;
    } catch (error) {
      return {
        status: "failed",

        uploadedBatchCount,
        uploadedCandleCount,

        failedBatchNumber:
          batch.batchNumber,

        remainingBatchCount:
          declaredBatchCount -
          uploadedBatchCount -
          1,

        error:
          error?.message ?? String(error)
      };
    }
  }

  return {
    status: "completed",

    uploadedBatchCount,
    uploadedCandleCount,

    failedBatchNumber: null,
    remainingBatchCount: 0,

    source: preparedImport.source,
    index: preparedImport.index,
    timeframe: preparedImport.timeframe,

    stats: preparedImport.mergeStats
  };
}
