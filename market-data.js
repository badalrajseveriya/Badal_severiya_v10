
/*
BADAL SEVERIYA V10
MARKET DATA ENGINE
Improved Educational Analysis Module
*/

// ==================================================
// 1. HELPER: VALIDATE NUMBER
// ==================================================

function isValidNumber(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;

  return (
    (typeof value === "number" || typeof value === "string") &&
    Number.isFinite(Number(value))
  );
}

// ==================================================
// 2. EMA CALCULATION
// ==================================================

export function calculateEMA(values, period) {
  if (
    !Array.isArray(values) ||
    !Number.isInteger(period) ||
    period <= 0 ||
    values.length < period ||
    !values.every(isValidNumber)
  ) {
    return [];
  }

  const result = new Array(values.length).fill(null);
  const multiplier = 2 / (period + 1);

  let sum = 0;

  for (let i = 0; i < period; i++) {
    sum += Number(values[i]);
  }

  let previousEMA = sum / period;
  result[period - 1] = previousEMA;

  for (let i = period; i < values.length; i++) {
    const price = Number(values[i]);

    previousEMA =
      (price - previousEMA) * multiplier + previousEMA;

    result[i] = previousEMA;
  }

  return result;
}

// ==================================================
// 3. RSI CALCULATION
// ==================================================

export function calculateRSI(values, period = 14) {
  if (
    !Array.isArray(values) ||
    !Number.isInteger(period) ||
    period <= 0 ||
    values.length <= period ||
    !values.every(isValidNumber)
  ) {
    return [];
  }

  const result = new Array(values.length).fill(null);

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change =
      Number(values[i]) - Number(values[i - 1]);

    if (change > 0) gains += change;
    if (change < 0) losses += Math.abs(change);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;

  function getRSI(gain, loss) {
    if (gain === 0 && loss === 0) return 50;
    if (loss === 0) return 100;
    if (gain === 0) return 0;

    const rs = gain / loss;
    return 100 - (100 / (1 + rs));
  }

  result[period] = getRSI(
    averageGain,
    averageLoss
  );

  for (let i = period + 1; i < values.length; i++) {
    const change =
      Number(values[i]) - Number(values[i - 1]);

    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    averageGain =
      ((averageGain * (period - 1)) + gain) / period;

    averageLoss =
      ((averageLoss * (period - 1)) + loss) / period;

    result[i] = getRSI(
      averageGain,
      averageLoss
    );
  }

  return result;
}

// ==================================================
// 4. VWAP CALCULATION
// Resets automatically when valid timestamps
// move to a new calendar day.
// Without timestamps, uses the supplied series.
// ==================================================

export function calculateVWAP(candles) {
  if (!Array.isArray(candles)) return [];

  let totalPriceVolume = 0;
  let totalVolume = 0;
  let previousDay = null;

  return candles.map(candle => {
    if (!candle || typeof candle !== "object") {
      return null;
    }

    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);
    const volume = Number(candle.volume);

    if (
      !isValidNumber(candle.high) ||
      !isValidNumber(candle.low) ||
      !isValidNumber(candle.close) ||
      !isValidNumber(candle.volume) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      !Number.isFinite(volume) ||
      volume < 0 ||
      high < low ||
      high < close ||
      low > close
    ) {
      return null;
    }

    const timestamp = candle.timestamp ?? candle.time;

    if (timestamp !== undefined && timestamp !== null) {
      const date = new Date(timestamp);

      if (!Number.isFinite(date.getTime())) {
        return null;
      }

      const day = date.toISOString().slice(0, 10);

      if (previousDay !== null && day !== previousDay) {
        totalPriceVolume = 0;
        totalVolume = 0;
      }

      previousDay = day;
    }

    const typicalPrice = (high + low + close) / 3;

    totalPriceVolume += typicalPrice * volume;
    totalVolume += volume;

    return totalVolume > 0
      ? totalPriceVolume / totalVolume
      : null;
  });
}

// ==================================================
// 5. CANDLE DATA VALIDATION
// ==================================================

export function validateCandles(candles) {
  if (!Array.isArray(candles)) {
    return {
      valid: false,
      error: "Candle data must be an array"
    };
  }

  if (candles.length === 0) {
    return {
      valid: false,
      error: "Candle data is empty"
    };
  }

  let timestampMode = null;
  let previousTimestamp = null;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];

    if (!c || typeof c !== "object" || Array.isArray(c)) {
      return {
        valid: false,
        error: "Invalid candle object at index " + i
      };
    }

    const rawValues = [
      c.open,
      c.high,
      c.low,
      c.close,
      c.volume
    ];

    if (!rawValues.every(isValidNumber)) {
      return {
        valid: false,
        error: "Missing or invalid OHLCV data at index " + i
      };
    }

    const [open, high, low, close, volume] =
      rawValues.map(Number);

    if (
      high < low ||
      high < open ||
      high < close ||
      low > open ||
      low > close ||
      volume < 0
    ) {
      return {
        valid: false,
        error: "Invalid OHLCV values at index " + i
      };
    }

    const hasTimestamp =
      c.timestamp !== undefined && c.timestamp !== null;

    const hasTime =
      c.time !== undefined && c.time !== null;

    const hasDate = hasTimestamp || hasTime;

    if (timestampMode === null) {
      timestampMode = hasDate;
    } else if (timestampMode !== hasDate) {
      return {
        valid: false,
        error: "Timestamp missing in some candles"
      };
    }

    if (hasDate) {
      const rawTime = hasTimestamp ? c.timestamp : c.time;
      const currentTimestamp = new Date(rawTime).getTime();

      if (!Number.isFinite(currentTimestamp)) {
        return {
          valid: false,
          error: "Invalid timestamp at index " + i
        };
      }

      if (
        previousTimestamp !== null &&
        currentTimestamp <= previousTimestamp
      ) {
        return {
          valid: false,
          error: "Candles are not in chronological order at index " + i
        };
      }

      previousTimestamp = currentTimestamp;
    }
  }

  return {
    valid: true,
    count: candles.length,
    hasTimestamps: timestampMode === true
  };
}

// ==================================================
// 6. MARKET INDICATOR ANALYSIS
// Educational historical-data analysis only.
// ==================================================

export function analyzeMarket(candles) {
  const validation = validateCandles(candles);

  if (!validation.valid) {
    return {
      status: "INVALID_DATA",
      error: validation.error
    };
  }

  if (candles.length < 200) {
    return {
      status: "INSUFFICIENT_DATA",
      requiredCandles: 200,
      availableCandles: candles.length
    };
  }

  const closes = candles.map(c => Number(c.close));

  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);

  const rsi14 = calculateRSI(closes, 14);
  const vwap = calculateVWAP(candles);

  const last = candles.length - 1;

  const values = {
    close: closes[last],
    ema20: ema20[last],
    ema50: ema50[last],
    ema200: ema200[last],
    rsi14: rsi14[last],
    vwap: vwap[last]
  };

  if (
    Object.values(values).some(
      value => !Number.isFinite(value)
    )
  ) {
    return {
      status: "INDICATOR_ERROR",
      error: "Unable to calculate one or more indicators"
    };
  }

  let score = 0;

  if (values.close > values.ema20) score++;
  else if (values.close < values.ema20) score--;

  if (values.ema20 > values.ema50) score++;
  else if (values.ema20 < values.ema50) score--;

  if (values.ema50 > values.ema200) score++;
  else if (values.ema50 < values.ema200) score--;

  if (values.close > values.vwap) score++;
  else if (values.close < values.vwap) score--;

  if (values.rsi14 > 55) score++;
  else if (values.rsi14 < 45) score--;

  let bias = "SIDEWAYS";

  if (score >= 3) {
    bias = "UPWARD_BIAS";
  } else if (score <= -3) {
    bias = "DOWNWARD_BIAS";
  }

  return {
    status: "OK",
    timeframe: "15m",
    bias,
    score,
    indicators: values,
    dataInfo: {
      candleCount: candles.length,
      timestampAvailable: validation.hasTimestamps,
      vwapMethod: validation.hasTimestamps
        ? "Session reset by calendar date"
        : "Cumulative supplied data; timestamps unavailable"
    },
    note: "Historical indicator analysis for education only. Not a forecast or trading recommendation."
  };
}
