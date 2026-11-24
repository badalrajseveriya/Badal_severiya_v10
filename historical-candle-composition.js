
// ======================================================
// BADAL SEVERIYA V12
// HISTORICAL CANDLE COMPOSITION
// Retrospective description only
// No forecasts, probabilities or trading signals
// ======================================================

const DEFAULTS = {
  minCandles: 20,
  dojiBodyRatio: 0.10
};

export function calculateHistoricalCandleComposition(
  candles,
  options = {}
) {
  if (!Array.isArray(candles)) {
    throw new Error("Historical candles must be an array.");
  }

  const config = {
    ...DEFAULTS,
    ...options
  };

  if (
    !Number.isInteger(config.minCandles) ||
    config.minCandles < 1 ||
    !Number.isFinite(config.dojiBodyRatio) ||
    config.dojiBodyRatio <= 0 ||
    config.dojiBodyRatio >= 1
  ) {
    throw new Error("Invalid composition configuration.");
  }

  if (candles.length < config.minCandles) {
    throw new Error(
      `At least ${config.minCandles} historical candles are required.`
    );
  }

  let previousTime = -Infinity;

  const counts = {
    bullish: 0,
    bearish: 0,
    neutral: 0
  };

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const timestamp = Date.parse(candle?.timestamp);

    if (
      !Number.isFinite(timestamp) ||
      timestamp <= previousTime
    ) {
      throw new Error(
        `Invalid timestamp at candle index ${i}.`
      );
    }

    previousTime = timestamp;

    const values = [
      candle.open,
      candle.high,
      candle.low,
      candle.close
    ];

    if (
      !values.every(Number.isFinite) ||
      values.some(value => value <= 0) ||
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
      throw new Error(
        `Invalid OHLC values at candle index ${i}.`
      );
    }

    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;

    const isDoji =
      range === 0 ||
      body / range <= config.dojiBodyRatio;

    if (isDoji) {
      counts.neutral++;
    } else if (candle.close > candle.open) {
      counts.bullish++;
    } else if (candle.close < candle.open) {
      counts.bearish++;
    } else {
      counts.neutral++;
    }
  }

  const total = candles.length;

  function percentage(count) {
    return Number(
      ((count / total) * 100).toFixed(1)
    );
  }

  const result = {
    status: "OK",
    dataType: "HISTORICAL_ONLY",
    timeframe: options.timeframe ?? "UNKNOWN",
    sampleSize: total,

    counts: {
      bullish: counts.bullish,
      bearish: counts.bearish,
      neutral: counts.neutral
    },

    percentages: {
      bullish: percentage(counts.bullish),
      bearish: percentage(counts.bearish),
      neutral: percentage(counts.neutral)
    },

    note:
      "These percentages describe the composition of past candles only. They are not future probabilities, forecasts or trading signals."
  };

  return result;
}
