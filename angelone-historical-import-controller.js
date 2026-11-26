/**
 * BADAL SEVERIYA V12
 * Angel One Historical Import Controller
 *
 * Angel One response -> converter -> merge/dedupe
 * -> validation -> safe-size batches.
 *
 * Historical data only. No trading/order execution.
 */

import {
  convertAngelOneCandles
} from "./angelone-converter.js";

import {
  prepareHistoricalCandleBatchImport
} from "./historical-candle-batch-import.js";

const ALLOWED_TIMEFRAMES = ["15m", "1d"];

/**
 * Prepare Angel One API candles for historical import.
 *
 * Does not upload or write to the database.
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

  // Convert and validate Angel One API response.
  const converted = convertAngelOneCandles(
    response,
    index,
    timeframe
  );

  // Prepare merged dataset and safe-size batches.
  const prepared = prepareHistoricalCandleBatchImport({
    existingCandles,
    incomingCandles: converted.candles,
    batchSize
  });

  const existingTimestampSet = new Set(
    existingCandles.map(candle =>
      new Date(
        candle.timestamp ??
        candle.time ??
        candle.date
      ).toISOString()
    )
  );

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

/**
 * Sequential upload wrapper.
 *
 * Upload function is injected by the caller.
 * This controller does not make network requests.
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
        failedBatchNumber: batch.batchNumber,
        remainingBatchCount:
          preparedImport.batchCount -
          uploadedBatchCount -
          1,
        error: error?.message ?? String(error)
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