
/**
 * BADAL SEVERIYA V12
 * Historical Candle Merge Engine
 *
 * Merge historical candle arrays by timestamp.
 * New input takes precedence on duplicate timestamps.
 * Educational historical data only.
 */

function normalizeTimestamp(value) {
  if (value === undefined || value === null || value === "") {
    throw new Error("Candle timestamp is missing.");
  }

  const ms = typeof value === "number"
    ? (value < 1e12 ? value * 1000 : value)
    : Date.parse(String(value));

  if (!Number.isFinite(ms)) {
    throw new Error(`Invalid candle timestamp: ${value}`);
  }

  return new Date(ms).toISOString();
}

function validateCandle(candle, rowNumber) {
  if (!candle || typeof candle !== "object") {
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
    open <= 0 || high <= 0 || low <= 0 || close <= 0 ||
    high < Math.max(open, close, low) ||
    low > Math.min(open, close, high)
  ) {
    throw new Error(`Invalid OHLC range at row ${rowNumber}.`);
  }

  const volume = candle.volume === undefined ||
    candle.volume === null ||
    candle.volume === ""
    ? null
    : Number(candle.volume);

  if (volume !== null && (!Number.isFinite(volume) || volume < 0)) {
    throw new Error(`Invalid volume at row ${rowNumber}.`);
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
 * Merge candles.
 * Existing candles are loaded first; incoming candles overwrite duplicates.
 * Returns chronological, unique, validated candles.
 */
export function mergeHistoricalCandles(
  existingCandles = [],
  incomingCandles = []
) {
  if (!Array.isArray(existingCandles) ||
      !Array.isArray(incomingCandles)) {
    throw new Error("Both candle inputs must be arrays.");
  }

  const byTimestamp = new Map();

  existingCandles.forEach((item, index) => {
    const candle = validateCandle(item, index + 1);
    byTimestamp.set(candle.timestamp, candle);
  });

  incomingCandles.forEach((item, index) => {
    const candle = validateCandle(item, index + 1);
    // Incoming file wins if the timestamp already exists.
    byTimestamp.set(candle.timestamp, candle);
  });

  return [...byTimestamp.values()]
    .sort((a, b) =>
      Date.parse(a.timestamp) - Date.parse(b.timestamp)
    );
}

/**
 * Merge multiple candle datasets in sequence.
 * Later datasets take priority over earlier ones.
 */
export function mergeCandleDatasets(...datasets) {
  return datasets.reduce(
    (merged, dataset) =>
      mergeHistoricalCandles(merged, dataset),
    []
  );
}
