
// ==================================================
// BADAL SEVERIYA V10.6
// HISTORICAL MARKET INDICATOR ENGINE
// Educational analysis only
// ==================================================

const MIN_CANDLES = 200;
const MAX_CANDLES = 5000;

const NOTE =
  "Historical indicator analysis for education only. Not a forecast or trading recommendation.";

// --------------------------------------------------
// Convert and validate candle data
// --------------------------------------------------

function normalizeCandles(input) {
  let source = input;

  if (!Array.isArray(source)) {
    if (Array.isArray(input?.candles)) {
      source = input.candles;
    } else if (Array.isArray(input?.data)) {
      source = input.data;
    } else {
      throw new Error("Candle data must be an array.");
    }
  }

  if (source.length < MIN_CANDLES) {
    throw new Error(
      `At least ${MIN_CANDLES} candles are required. Received ${source.length}.`
    );
  }

  if (source.length > MAX_CANDLES) {
    throw new Error(
      `Maximum ${MAX_CANDLES} candles are allowed.`
    );
  }

  const candles = source.map((item, index) => {
    const open = Number(item.open ?? item.Open);
    const high = Number(item.high ?? item.High);
    const low = Number(item.low ?? item.Low);
    const close = Number(item.close ?? item.Close);
    const volume = Number(item.volume ?? item.Volume ?? 0);

    const values = [open, high, low, close, volume];

    if (!values.every(Number.isFinite)) {
      throw new Error(`Invalid numeric data at candle ${index + 1}.`);
    }

    if (
      open <= 0 ||
      high <= 0 ||
      low <= 0 ||
      close <= 0 ||
      volume < 0
    ) {
      throw new Error(`Invalid price or volume at candle ${index + 1}.`);
    }

    if (
      high < low ||
      high < open ||
      high < close ||
      low > open ||
      low > close
    ) {
      throw new Error(`Invalid OHLC values at candle ${index + 1}.`);
    }

    const timestamp =
      item.timestamp ??
      item.time ??
      item.date ??
      item.datetime ??
      null;

    return {
      open,
      high,
      low,
      close,
      volume,
      timestamp
    };
  });

  return candles;
}

// --------------------------------------------------
// Exponential Moving Average
// --------------------------------------------------

function calculateEMA(values, period) {
  if (values.length < period) {
    return null;
  }

  const multiplier = 2 / (period + 1);

  let ema = 0;

  for (let i = 0; i < period; i++) {
    ema += values[i];
  }

  ema /= period;

  for (let i = period; i < values.length; i++) {
    ema =
      (values[i] - ema) * multiplier +
      ema;
  }

  return ema;
}

// --------------------------------------------------
// Relative Strength Index - Wilder method
// --------------------------------------------------

function calculateRSI(values, period = 14) {
  if (values.length <= period) {
    return null;
  }

  let averageGain = 0;
  let averageLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];

    if (change > 0) {
      averageGain += change;
    } else {
      averageLoss += Math.abs(change);
    }
  }

  averageGain /= period;
  averageLoss /= period;

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];

    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    averageGain =
      ((averageGain * (period - 1)) + gain) / period;

    averageLoss =
      ((averageLoss * (period - 1)) + loss) / period;
  }

  if (averageLoss === 0) {
    return averageGain === 0 ? 50 : 100;
  }

  const relativeStrength = averageGain / averageLoss;

  return 100 - (100 / (1 + relativeStrength));
}

// --------------------------------------------------
// Cumulative Volume Weighted Average Price
// --------------------------------------------------

function calculateVWAP(candles) {
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;

  for (const candle of candles) {
    const typicalPrice =
      (candle.high + candle.low + candle.close) / 3;

    cumulativePriceVolume +=
      typicalPrice * candle.volume;

    cumulativeVolume += candle.volume;
  }

  if (cumulativeVolume === 0) {
    return null;
  }

  return cumulativePriceVolume / cumulativeVolume;
}

// --------------------------------------------------
// Data quality information
// --------------------------------------------------

function getDataInfo(candles) {
  const timestamps = candles
    .map(candle => candle.timestamp)
    .filter(value => value !== null && value !== undefined);

  const timestampAvailable =
    timestamps.length === candles.length;

  return {
    candleCount: candles.length,
    timestampAvailable,
    vwapMethod: "Cumulative supplied data VWAP",
    volumeAvailable: candles.some(candle => candle.volume > 0),
    dataType: "Supplied historical OHLCV data"
  };
}

// --------------------------------------------------
// Main analysis function
// --------------------------------------------------

export function analyzeMarket(input) {
  try {
    const candles = normalizeCandles(input);

    const closes = candles.map(candle => candle.close);

    const ema20 = calculateEMA(closes, 20);
    const ema50 = calculateEMA(closes, 50);
    const ema200 = calculateEMA(closes, 200);

    const rsi14 = calculateRSI(closes, 14);
    const vwap = calculateVWAP(candles);

    const latest = candles[candles.length - 1];
    const close = latest.close;

    if (
      ema20 === null ||
      ema50 === null ||
      ema200 === null ||
      rsi14 === null
    ) {
      throw new Error("Insufficient data for indicator calculation.");
    }

    // ----------------------------------------------
    // Educational historical trend classification
    // ----------------------------------------------

    let score = 0;

    if (close > ema20) score++;
    else if (close < ema20) score--;

    if (ema20 > ema50) score++;
    else if (ema20 < ema50) score--;

    if (ema50 > ema200) score++;
    else if (ema50 < ema200) score--;

    if (vwap !== null) {
      if (close > vwap) score++;
      else if (close < vwap) score--;
    }

    let bias = "NEUTRAL";

    if (score >= 2) {
      bias = "UPWARD_BIAS";
    } else if (score <= -2) {
      bias = "DOWNWARD_BIAS";
    }

    // ----------------------------------------------
    // Result
    // ----------------------------------------------

    return {
      status: "OK",
      timeframe: input?.timeframe || "15m",
      bias,
      score,

      indicators: {
        close: Number(close.toFixed(2)),
        ema20: Number(ema20.toFixed(2)),
        ema50: Number(ema50.toFixed(2)),
        ema200: Number(ema200.toFixed(2)),
        rsi14: Number(rsi14.toFixed(2)),
        vwap: vwap === null
          ? null
          : Number(vwap.toFixed(2))
      },

      dataInfo: getDataInfo(candles),

      note: NOTE
    };

  } catch (error) {
    return {
      status: "ERROR",
      error: error.message,
      note: NOTE
    };
  }
}
