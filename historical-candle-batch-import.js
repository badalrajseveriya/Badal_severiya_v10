/**
 * BADAL SEVERIYA V12
 * Historical Candle Batch Import Engine
 * Historical data processing only.
 */

import {
  mergeHistoricalCandles
} from "./historical-candle-merge.js";

export const MAX_CANDLES_PER_BATCH = 5000;

function validateBatchSize(size) {
  if (
    !Number.isInteger(size) ||
    size < 1 ||
    size > MAX_CANDLES_PER_BATCH
  ) {
    throw new Error(
      "Batch size must be between 1 and 5000."
    );
  }
}

export function splitHistoricalCandlesIntoBatches(
  candles,
  batchSize = MAX_CANDLES_PER_BATCH
) {
  if (!Array.isArray(candles)) {
    throw new Error("Candles must be an array.");
  }

  validateBatchSize(batchSize);

  const batches = [];

  for (let i = 0; i < candles.length; i += batchSize) {
    batches.push(candles.slice(i, i + batchSize));
  }

  return batches;
}

export function prepareHistoricalCandleBatchImport({
  existingCandles = [],
  incomingCandles = [],
  batchSize = MAX_CANDLES_PER_BATCH
} = {}) {
  if (
    !Array.isArray(existingCandles) ||
    !Array.isArray(incomingCandles)
  ) {
    throw new Error("Candle datasets must be arrays.");
  }

  validateBatchSize(batchSize);

  const merged = mergeHistoricalCandles(
    existingCandles,
    incomingCandles
  );

  const chunks = splitHistoricalCandlesIntoBatches(
    merged,
    batchSize
  );

  const inputCount =
    existingCandles.length + incomingCandles.length;

  return {
    status: "prepared",
    batchSize,
    batchCount: chunks.length,

    batches: chunks.map((candles, index) => ({
      batchNumber: index + 1,
      totalBatches: chunks.length,
      candleCount: candles.length,
      candles
    })),

    stats: {
      existingCount: existingCandles.length,
      incomingCount: incomingCandles.length,
      inputCount,
      uniqueCount: merged.length,
      duplicateCount: Math.max(
        0,
        inputCount - merged.length
      ),
      firstTimestamp: merged[0]?.timestamp ?? null,
      lastTimestamp: merged.at(-1)?.timestamp ?? null
    }
  };
}

/**
 * Sequential batch upload runner.
 * Network upload is provided separately by uploader().
 */
export async function runHistoricalCandleBatchImport(
  preparedImport,
  uploader
) {
  if (
    !preparedImport ||
    !Array.isArray(preparedImport.batches)
  ) {
    throw new Error("Prepared import is required.");
  }

  if (typeof uploader !== "function") {
    throw new Error("Uploader function is required.");
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
    stats: preparedImport.stats
  };
}