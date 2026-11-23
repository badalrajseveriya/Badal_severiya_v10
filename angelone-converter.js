
// ======================================================
// BADAL SEVERIYA V12
// ANGEL ONE SMARTAPI HISTORICAL CANDLE CONVERTER
// Historical data handling only
// ======================================================

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

export function convertAngelOneCandles(
  response,
  index = "NIFTY",
  timeframe = "15m"
) {
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

    // NIFTY index volume of zero is treated as unavailable.
    if (
      String(index).toUpperCase() === "NIFTY" &&
      candle.volume === 0
    ) {
      candle.volume = null;
    }

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

  candles.sort(
    (a, b) =>
      Date.parse(a.timestamp) - Date.parse(b.timestamp)
  );

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
    index,
    timeframe,
    exchange: "NSE",
    symbolToken:
      String(index).toUpperCase() === "NIFTY"
        ? "99926000"
        : null,
    source: "ANGEL_ONE_SMARTAPI",
    dataType: "REAL_HISTORICAL",
    candles,
    note:
      "NIFTY index volume reported as zero is stored as null."
  };
}
