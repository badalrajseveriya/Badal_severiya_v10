
 // ======================================================
// BADAL SEVERIYA V12
// HISTORICAL CANDLE PATTERN ENGINE
// Educational analysis only
// ======================================================

const DEFAULTS = {
  dojiBodyRatio: 0.10,
  wickBodyRatio: 2,
  maxPatterns: 500
};

function validateCandles(candles) {
  if (!Array.isArray(candles) || candles.length < 5) {
    throw new Error("At least 5 historical candles are required");
  }

  let previousTime = -Infinity;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const time = Date.parse(c?.timestamp);

    if (!Number.isFinite(time) || time <= previousTime) {
      throw new Error(`Invalid candle timestamp at index ${i}`);
    }

    const values = [c.open, c.high, c.low, c.close, c.volume];

    if (
      !values.every(Number.isFinite) ||
      c.open <= 0 || c.high <= 0 ||
      c.low <= 0 || c.close <= 0 ||
      c.volume < 0 ||
      c.high < Math.max(c.open, c.close, c.low) ||
      c.low > Math.min(c.open, c.close, c.high)
    ) {
      throw new Error(`Invalid OHLCV at index ${i}`);
    }

    previousTime = time;
  }
}

function candleInfo(c) {
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;

  return {
    body,
    range,
    upperWick: c.high - Math.max(c.open, c.close),
    lowerWick: Math.min(c.open, c.close) - c.low,
    bullish: c.close > c.open,
    bearish: c.close < c.open
  };
}

function detectSingle(c, i, config) {
  const info = candleInfo(c);
  const patterns = [];

  if (info.range === 0) return patterns;

  const bodyRatio = info.body / info.range;

  if (bodyRatio <= config.dojiBodyRatio) {
    patterns.push({
      name: "DOJI",
      direction: "NEUTRAL",
      index: i,
      timestamp: c.timestamp
    });
  }

  if (
    info.lowerWick >= info.body * config.wickBodyRatio &&
    info.upperWick <= info.range * 0.15 &&
    bodyRatio <= 0.40
  ) {
    patterns.push({
      name: "HAMMER",
      direction: "BULLISH_CONTEXT",
      index: i,
      timestamp: c.timestamp
    });
  }

  if (
    info.upperWick >= info.body * config.wickBodyRatio &&
    info.lowerWick <= info.range * 0.15 &&
    bodyRatio <= 0.40
  ) {
    patterns.push({
      name: "SHOOTING_STAR",
      direction: "BEARISH_CONTEXT",
      index: i,
      timestamp: c.timestamp
    });
  }

  return patterns;
}

function detectEngulfing(previous, current, index) {
  const a = candleInfo(previous);
  const b = candleInfo(current);

  if (
    a.bearish &&
    b.bullish &&
    current.open <= previous.close &&
    current.close >= previous.open
  ) {
    return {
      name: "BULLISH_ENGULFING",
      direction: "BULLISH_CONTEXT",
      index,
      timestamp: current.timestamp
    };
  }

  if (
    a.bullish &&
    b.bearish &&
    current.open >= previous.close &&
    current.close <= previous.open
  ) {
    return {
      name: "BEARISH_ENGULFING",
      direction: "BEARISH_CONTEXT",
      index,
      timestamp: current.timestamp
    };
  }

  return null;
}

function detectStars(a, b, c, index) {
  const x = candleInfo(a);
  const y = candleInfo(b);
  const z = candleInfo(c);

  const patterns = [];

  const middleSmall = y.body < x.body * 0.5 &&
    y.body < z.body * 0.5;

  if (
    x.bearish &&
    middleSmall &&
    z.bullish &&
    c.close > (a.open + a.close) / 2
  ) {
    patterns.push({
      name: "MORNING_STAR",
      direction: "BULLISH_CONTEXT",
      index,
      timestamp: c.timestamp
    });
  }

  if (
    x.bullish &&
    middleSmall &&
    z.bearish &&
    c.close < (a.open + a.close) / 2
  ) {
    patterns.push({
      name: "EVENING_STAR",
      direction: "BEARISH_CONTEXT",
      index,
      timestamp: c.timestamp
    });
  }

  return patterns;
}

function detectThreeCandleRuns(a, b, c, index) {
  const patterns = [];

  const bullish = [a, b, c].every(
    candle => candle.close > candle.open
  );

  const bearish = [a, b, c].every(
    candle => candle.close < candle.open
  );

  if (bullish && a.close < b.close && b.close < c.close) {
    patterns.push({
      name: "THREE_WHITE_SOLDIERS",
      direction: "BULLISH_CONTEXT",
      index,
      timestamp: c.timestamp
    });
  }

  if (bearish && a.close > b.close && b.close > c.close) {
    patterns.push({
      name: "THREE_BLACK_CROWS",
      direction: "BEARISH_CONTEXT",
      index,
      timestamp: c.timestamp
    });
  }

  return patterns;
}

export function analyzeCandlePatterns(candles, options = {}) {
  validateCandles(candles);

  const config = {
    ...DEFAULTS,
    ...options
  };

  if (
    !Number.isFinite(config.dojiBodyRatio) ||
    config.dojiBodyRatio <= 0 ||
    config.dojiBodyRatio >= 1 ||
    !Number.isFinite(config.wickBodyRatio) ||
    config.wickBodyRatio <= 0 ||
    !Number.isInteger(config.maxPatterns) ||
    config.maxPatterns < 1
  ) {
    throw new Error("Invalid candle pattern configuration");
  }

  const patterns = [];

  for (let i = 0; i < candles.length; i++) {
    patterns.push(
      ...detectSingle(candles[i], i, config)
    );

    if (i >= 1) {
      const engulfing = detectEngulfing(
        candles[i - 1],
        candles[i],
        i
      );

      if (engulfing) patterns.push(engulfing);
    }

    if (i >= 2) {
      patterns.push(
        ...detectStars(
          candles[i - 2],
          candles[i - 1],
          candles[i],
          i
        )
      );

      patterns.push(
        ...detectThreeCandleRuns(
          candles[i - 2],
          candles[i - 1],
          candles[i],
          i
        )
      );
    }
  }

  const counts = {};

  for (const pattern of patterns) {
    counts[pattern.name] =
      (counts[pattern.name] || 0) + 1;
  }

  return {
    version: "12.0",
    module: "HISTORICAL_CANDLE_PATTERNS",
    status: "OK",
    dataType: "HISTORICAL_ONLY",

    summary: {
      candleCount: candles.length,
      totalPatterns: patterns.length,
      patternCounts: counts
    },

    patterns: patterns.slice(-config.maxPatterns),

    note:
      "Candle patterns are descriptive historical classifications. They do not predict future price movements."
  };
}
