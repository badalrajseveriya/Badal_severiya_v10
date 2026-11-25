/**
 * BADAL SEVERIYA V12
 * Historical Data Import Controller
 *
 * CSV/JSON files -> validation -> merge/dedupe -> batch preparation.
 * Historical dataset processing only.
 * No live trading or order execution.
 */

import {
  parseHistoricalDataText
} from "./historical-data-import.js";

import {
  mergeHistoricalCandles
} from "./historical-candle-merge.js";

import {
  prepareHistoricalCandleBatchImport
} from "./historical-candle-batch-import.js";

const ALLOWED_TIMEFRAMES = [
  "1m", "3m", "5m", "10m",
  "15m", "30m", "1h", "1d"
];

const MAX_FILES = 100;
const MAX_CANDLES_PER_FILE = 5000;

/**
 * Validate input file collection.
 */
function validateFiles(files) {
  if (!Array.isArray(files)) {
    throw new Error("Files must be supplied as an array.");
  }

  if (files.length < 1) {
    throw new Error("Select at least one historical file.");
  }

  if (files.length > MAX_FILES) {
    throw new Error(
      `Maximum ${MAX_FILES} files allowed per import.`
    );
  }

  for (const file of files) {
    if (
      !file ||
      typeof file !== "object" ||
      typeof file.text !== "string"
    ) {
      throw new Error(
        "Each file must include filename and text content."
      );
    }

    if (!String(file.name || "").trim()) {
      throw new Error("Every file must have a filename.");
    }
  }
}

/**
 * Parse and validate one file.
 *
 * The existing parser has a 200-candle minimum for 15m
 * analysis imports. For ingestion, use its 1d parsing mode
 * to validate file format and candle rows without imposing
 * that analysis minimum on smaller split files.
 *
 * The selected timeframe is retained by the controller.
 */
function parseOneFile(file, fileNumber) {
  const parsed = parseHistoricalDataText(
    file.text,
    file.name,
    "1d"
  );

  if (parsed.status !== "OK") {
    throw new Error(
      `File #${fileNumber} (${file.name}): ${parsed.error}`
    );
  }

  if (
    parsed.candleCount >
    MAX_CANDLES_PER_FILE
  ) {
    throw new Error(
      `File #${fileNumber} (${file.name}) exceeds ` +
      `${MAX_CANDLES_PER_FILE} candles.`
    );
  }

  return {
    name: file.name,
    rowCount: parsed.candleCount,
    candles: parsed.candles
  };
}

/**
 * Prepare a multi-file historical import.
 *
 * files:
 *   [{ name: "part.csv", text: "CSV contents" }]
 *
 * existingCandles:
 *   Existing historical dataset (optional)
 *
 * timeframe:
 *   Selected historical timeframe
 *
 * batchSize:
 *   Maximum candles per batch (1..5000)
 *
 * This function does NOT upload or write to a database.
 */
export function prepareHistoricalDataImport({
  files = [],
  existingCandles = [],
  timeframe = "15m",
  batchSize = 5000
} = {}) {
  validateFiles(files);

  if (!ALLOWED_TIMEFRAMES.includes(timeframe)) {
    throw new Error("Unsupported timeframe.");
  }

  if (!Array.isArray(existingCandles)) {
    throw new Error(
      "Existing candles must be an array."
    );
  }

  // Parse every file first.
  // If any file fails, preparation stops completely.
  const parsedFiles = files.map(
    (file, index) =>
      parseOneFile(file, index + 1)
  );

  const fileCandleCount = parsedFiles.reduce(
    (sum, file) => sum + file.rowCount,
    0
  );

  // Combine all incoming file rows.
  const rawIncoming = parsedFiles.flatMap(
    file => file.candles
  );

  // Remove duplicates across incoming files.
  // Later files replace earlier candles at the same timestamp.
  const uniqueIncoming = mergeHistoricalCandles(
    [],
    rawIncoming
  );

  // Count incoming timestamps that already exist.
  const existingTimestampSet = new Set(
    existingCandles.map(candle =>
      new Date(
        candle.timestamp ??
        candle.time ??
        candle.date
      ).toISOString()
    )
  );

  const duplicateAgainstExisting =
    uniqueIncoming.filter(candle =>
      existingTimestampSet.has(candle.timestamp)
    ).length;

  // Prepare merged dataset and safe-size batches.
  const prepared = prepareHistoricalCandleBatchImport({
    existingCandles,
    incomingCandles: uniqueIncoming,
    batchSize
  });

  return {
    status: "prepared",
    dataType: "HISTORICAL_ONLY",
    timeframe,

    fileCount: parsedFiles.length,

    files: parsedFiles.map(file => ({
      name: file.name,
      rowCount: file.rowCount
    })),

    stats: {
      fileCandleCount,

      uniqueIncomingCount:
        uniqueIncoming.length,

      duplicateWithinFiles:
        Math.max(
          0,
          fileCandleCount -
          uniqueIncoming.length
        ),

      existingCandleCount:
        existingCandles.length,

      duplicateAgainstExisting,

      finalUniqueCandleCount:
        prepared.stats.uniqueCount
    },

    batches: prepared.batches,
    batchCount: prepared.batchCount,
    batchSize: prepared.batchSize,

    mergeStats: prepared.stats,

    note:
      "Prepared only. No upload or database write performed."
  };
}