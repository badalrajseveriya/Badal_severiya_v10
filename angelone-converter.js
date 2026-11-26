// ======================================================
// BADAL SEVERIYA V12
// ANGEL ONE SMARTAPI HISTORICAL CANDLE CONVERTER
// Verified Index Token Mapping
// Historical data conversion only — no trading/orders
// ======================================================

export const ANGEL_ONE_INDEX_TOKENS = Object.freeze({
  NIFTY: "99926000",
  NIFTY50: "99926000",

  BANKNIFTY: "99926009",
  NIFTYBANK: "99926009",

  FINNIFTY: "99926037",
  MIDCPNIFTY: "99926074",

  NIFTYIT: "99926008",
  NIFTYAUTO: "99926029",
  NIFTYFMCG: "99926021",
  NIFTYPHARMA: "99926023",
  NIFTYMETAL: "99926030",
  NIFTYREALTY: "99926018",
  NIFTYENERGY: "99926020",
  NIFTYINFRA: "99926019",
  NIFTYMEDIA: "99926031",
  NIFTYPSUBANK: "99926025"
});

// ------------------------------------------------------
// Numeric validation
// ------------------------------------------------------

function numericValue(value, field, rowIndex, nullable = false) {
  if (value === null || value === undefined || value === "") {
    if (nullable) return null;
    throw new Error(`Missing ${field} at row ${rowIndex}`);
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new Error(`Invalid ${field} at row ${rowIndex}`);
  }

  return number;
}

// ------------------------------------------------------
// Resolve index token
// ------------------------------------------------------

export function getAngelOneIndexToken(index = "NIFTY") {
  const normalizedIndex = String(index).trim().toUpperCase();

  const token = ANGEL_ONE_INDEX_TOKENS[normalizedIndex];

  if (!token) {
    throw new Error(
      `Unsupported Angel One index: ${normalizedIndex}`
    );
  }

  return token;
}

// ------------------------------------------------------
// Convert Angel One Historical Candles
// ------------------------------------------------------

export function convertAngelOneCandles(
  response,
  index = "NIFTY",
  timeframe = "15m"
) {
  const normalizedIndex = String(index).trim().toUpperCase();

  // Compatibility: unknown index is returned with null token.
  const symbolToken =
    ANGEL_ONE_INDEX_TOKENS[normalizedIndex] || null;

  if (!response || response.status !== true) {
    throw new Error("Angel One response is not successful");
  }

  if (!Array.isArray(response.data) || response.data.length === 0) {
    throw new Error("Historical candle data is missing");
  }

  const candles = response.data.map((row, i) => {
    if (!Array.isArray(row) || row.length < 6) {
      throw new Error(`Invalid candle row: ${i}`);
    }

    const [
      rawTimestamp,
      rawOpen,
      rawHigh,
      rawLow,
      rawClose,
      rawVolume
    ] = row;

    const parsedTime = Date.parse(rawTimestamp);

    if (!Number.isFinite(parsedTime)) {
      throw new Error(`Invalid timestamp at row ${i}`);
    }

    const candle = {
      timestamp: new Date(parsedTime).toISOString(),
      open: numericValue(rawOpen, "open", i),
      high: numericValue(rawHigh, "high", i),
      low: numericValue(rawLow, "low", i),
      close: numericValue(rawClose, "close", i),
      volume: numericValue(rawVolume, "volume", i, true)
    };

    // NIFTY index aliases: zero volume means unavailable.
    if (
      (normalizedIndex === "NIFTY" ||
        normalizedIndex === "NIFTY50") &&
      candle.volume === 0
    ) {
      candle.volume = null;
    }

    // Validate OHLCV values.
    if (
      candle.open <= 0 ||
      candle.high <= 0 ||
      candle.low <= 0 ||
      candle.close <= 0 ||
      (candle.volume !== null && candle.volume < 0) ||
      candle.high < Math.max(
        candle.open,
        candle.close,
        candle.low
      ) ||
      candle.low > Math.min(
        candle.open,
        candle.close,
        candle.high
      )
    ) {
      throw new Error(`Invalid OHLCV data at row ${i}`);
    }

    return candle;
  });

  // Sort oldest to newest.
  candles.sort(
    (a, b) =>
      Date.parse(a.timestamp) - Date.parse(b.timestamp)
  );

  // Reject duplicate candle timestamps.
  for (let i = 1; i < candles.length; i++) {
    if (
      candles[i].timestamp === candles[i - 1].timestamp
    ) {
      throw new Error(
        `Duplicate candle timestamp: ${candles[i].timestamp}`
      );
    }
  }

  return {
    index: normalizedIndex,
    timeframe,
    exchange: "NSE",
    symbolToken,
    source: "ANGEL_ONE_SMARTAPI",
    dataType: "REAL_HISTORICAL",
    candles,
    note:
      "NIFTY and NIFTY50 zero volume is stored as null."
  };
}

// ------------------------------------------------------
// Validate Mapping Table
// ------------------------------------------------------

export function validateAngelOneIndexMapping() {
  const entries = Object.entries(ANGEL_ONE_INDEX_TOKENS);

  const uniqueTokens = new Set(
    entries.map(([, token]) => token)
  );

  return {
    totalBackendKeys: entries.length,
    uniqueInstruments: uniqueTokens.size,
    aliases: {
      NIFTY50: "NIFTY",
      NIFTYBANK: "BANKNIFTY"
    },
    valid: entries.every(
      ([index, token]) =>
        typeof index === "string" &&
        typeof token === "string" &&
        /^\d+$/.test(token)
    )
  };
}