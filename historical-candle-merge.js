/**
 * BADAL SEVERIYA V12
 * Historical Candle Merge Engine
 *
 * Features:
 * - Merge multiple historical candle datasets
 * - Normalize timestamps consistently
 * - Remove duplicate candles by timestamp
 * - Later input takes precedence on duplicate timestamps
 * - Validate OHLC and volume
 * - Return sorted chronological candles
 *
 * Historical educational data processing only.
 */

const INDIA_TIMEZONE_OFFSET = "+05:30";

function normalizeTimestamp(value) {
  if (value === undefined || value === null || value === "") {
    throw new Error("Candle timestamp is missing.");
  }

  let milliseconds;

  // Unix timestamp: seconds or milliseconds
  if (typeof value === "number") {
    milliseconds = value < 1e12
      ? value * 1000
      : value;
  } else {
    let text = String(value).trim();

    if (!text) {
      throw new Error("Candle timestamp is empty.");
    }

    // Convert "YYYY-MM-DD HH:mm:ss" into ISO-like format
    text = text.replace(
      /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)/,
      "$1T$2"
    );

    // If timezone is absent, assume Indian Standard Time.
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);

    if (!hasTimezone) {
      text += INDIA_TIMEZONE_OFFSET;
    }

    milliseconds = Date.parse(text);
  }

  if (!Number.isFinite(milliseconds)) {
    throw new Error(`Invalid candle timestamp: ${value}`);
  }

  return new Date(milliseconds).toISOString();
}

function validateCandle(candle, rowNumber) {
  if (
    !candle ||
    typeof candle !== "object" ||
    Array.isArray(candle)
  ) {
    throw new Error(`Invalid candle at row ${rowNumber}.`);
  }

  const timestamp = normalizeTimestamp(
    candle.timestamp ?? candle.time ?? candle.date
  );

  const open = Number(candle.open);
  const high = Number(candle.high);
  const low = Number(candle.low);
  const close = Number(candle.close);

  if (![open, high, low, close].every(Number.isFinite)) {
    throw new Error(`Invalid OHLC values at row ${rowNumber}.`);
  }

  if (
    open <= 0 ||
    high <= 0 ||
    low <= 0 ||
    close <= 0
  ) {
    throw new Error(`OHLC values must be positive at row ${rowNumber}.`);
  }

  // Proper candle range validation
  if (
    high < open ||
    high < close ||
    high < low ||
    low > open ||
    low > close
  ) {
    throw new Error(`Invalid OHLC range at row ${rowNumber}.`);
  }

  let volume = null;

  if (
    candle.volume !== undefined &&
    candle.volume !== null &&
    candle.volume !== ""
  ) {
    volume = Number(candle.volume);

    if (!Number.isFinite(volume) || volume < 0) {
      throw new Error(`Invalid volume at row ${rowNumber}.`);
    }
  }

  return {
    timestamp,
    open,
    high,
    low,
    close,
    volume
  };
}

/**
 * Merge two historical candle arrays.
 *
 * Existing data is processed first.
 * Incoming data replaces existing data at duplicate timestamps.
 *
 * Returns:
 * - Validated candles
 * - Unique timestamps
 * - Chronological order
 */
export function mergeHistoricalCandles(
  existingCandles = [],
  incomingCandles = []
) {
  if (
    !Array.isArray(existingCandles) ||
    !Array.isArray(incomingCandles)
  ) {
    throw new Error("Both candle inputs must be arrays.");
  }

  const byTimestamp = new Map();

  existingCandles.forEach((item, index) => {
    const candle = validateCandle(item, index + 1);

    byTimestamp.set(candle.timestamp, candle);
  });

  incomingCandles.forEach((item, index) => {
    const candle = validateCandle(item, index + 1);

    // New incoming data wins on duplicate timestamps.
    byTimestamp.set(candle.timestamp, candle);
  });

  return Array.from(byTimestamp.values()).sort(
    (a, b) =>
      Date.parse(a.timestamp) - Date.parse(b.timestamp)
  );
}

/**
 * Merge multiple datasets sequentially.
 *
 * Dataset order matters:
 * Later datasets take priority over earlier datasets
 * when duplicate timestamps exist.
 */
export function mergeCandleDatasets(...datasets) {
  return datasets.reduce((merged, dataset) => {
    if (!Array.isArray(dataset)) {
      throw new Error("Each candle dataset must be an array.");
    }

    return mergeHistoricalCandles(merged, dataset);
  }, []);
}

/**
 * Return basic merge statistics.
 */
export function getCandleMergeStats(
  originalCount,
  mergedCandles
) {
  if (!Array.isArray(mergedCandles)) {
    throw new Error("Merged candles must be an array.");
  }

  return {
    inputCount: originalCount,
    uniqueCount: mergedCandles.length,
    duplicateCount: Math.max(
      0,
      originalCount - mergedCandles.length
    ),
    firstTimestamp:
      mergedCandles[0]?.timestamp ?? null,
    lastTimestamp:
      mergedCandles.at(-1)?.timestamp ?? null
  };
}
