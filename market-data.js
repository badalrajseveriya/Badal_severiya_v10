
/*
  BADAL SEVERIYA V10
  MARKET DATA ENGINE
  Educational analysis module
*/

// 1. EMA CALCULATION
export function calculateEMA(values, period) {
  if (!Array.isArray(values) || values.length < period) {
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

// 2. RSI CALCULATION
export function calculateRSI(values, period = 14) {
  if (!Array.isArray(values) || values.length <= period) {
    return [];
  }

  const result = new Array(values.length).fill(null);

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = Number(values[i]) - Number(values[i - 1]);

    if (change > 0) gains += change;
    if (change < 0) losses += Math.abs(change);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;

  function getRSI(gain, loss) {
    if (gain === 0 && loss === 0) return 50;
    if (loss === 0) return 100;

    const rs = gain / loss;
    return 100 - (100 / (1 + rs));
  }

  result[period] = getRSI(averageGain, averageLoss);

  for (let i = period + 1; i < values.length; i++) {
    const change = Number(values[i]) - Number(values[i - 1]);

    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    averageGain =
      ((averageGain * (period - 1)) + gain) / period;

    averageLoss =
      ((averageLoss * (period - 1)) + loss) / period;

    result[i] = getRSI(averageGain, averageLoss);
  }

  return result;
}

// 3. VWAP CALCULATION
// Input candles should belong to one trading session.
export function calculateVWAP(candles) {
  if (!Array.isArray(candles)) return [];

  let totalPriceVolume = 0;
  let totalVolume = 0;

  return candles.map(candle => {
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);
    const volume = Number(candle.volume);

    if (
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      !Number.isFinite(volume) ||
      volume < 0
    ) {
      return null;
    }

    const typicalPrice = (high + low + close) / 3;

    totalPriceVolume += typicalPrice * volume;
    totalVolume += volume;

    return totalVolume > 0
      ? totalPriceVolume / totalVolume
      : null;
  });
}

// 4. VALIDATE CANDLE DATA
export function validateCandles(candles) {
  if (!Array.isArray(candles)) {
    return {
      valid: false,
      error: "Candle data must be an array"
    };
  }

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];

    const values = [
      c.open,
      c.high,
      c.low,
      c.close,
      c.volume
    ].map(Number);

    if (!values.every(Number.isFinite)) {
      return {
        valid: false,
        error: "Invalid candle at index " + i
      };
    }

    const [open, high, low, close, volume] = values;

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
  }

  return {
    valid: true,
    count: candles.length
  };
}

// 5. MARKET INDICATOR ANALYSIS
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

  const close = closes[last];

  const values = {
    close,
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
      status: "INDICATOR_ERROR"
    };
  }

  let score = 0;

  if (close > values.ema20) score++;
  else score--;

  if (values.ema20 > values.ema50) score++;
  else score--;

  if (values.ema50 > values.ema200) score++;
  else score--;

  if (close > values.vwap) score++;
  else score--;

  if (values.rsi14 > 55) score++;
  else if (values.rsi14 < 45) score--;

  let bias = "SIDEWAYS";

  if (score >= 3) bias = "UPWARD_BIAS";
  if (score <= -3) bias = "DOWNWARD_BIAS";

  return {
    status: "OK",
    timeframe: "15m",
    bias,
    score,
    indicators: values,
    note: "Indicator-based educational analysis, not a forecast."
  };
}
