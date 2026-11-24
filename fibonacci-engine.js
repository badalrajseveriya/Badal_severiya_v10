
// ======================================================
// BADAL SEVERIYA V12
// HISTORICAL FIBONACCI ENGINE
// Educational historical analysis only
// ======================================================

const DEFAULTS = {
  pivotLength: 5,
  maxLevels: 100
};

const RETRACEMENT_RATIOS = [
  0,
  0.236,
  0.382,
  0.5,
  0.618,
  0.786,
  1
];

const EXTENSION_RATIOS = [
  1.272,
  1.414,
  1.618,
  2,
  2.618
];

function validateCandles(candles) {
  if (!Array.isArray(candles) || candles.length < 30) {
    throw new Error("At least 30 historical candles are required");
  }

  let previousTime = -Infinity;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const time = Date.parse(c?.timestamp);

    if (!Number.isFinite(time) || time <= previousTime) {
      throw new Error(`Invalid candle timestamp at index ${i}`);
    }

    // OHLC is mandatory. Volume may be unavailable
    // for index data such as NIFTY 50.
    const values = [
      c.open,
      c.high,
      c.low,
      c.close
    ];

    const volumeMissing =
      c.volume === null ||
      c.volume === undefined ||
      c.volume === "";

    const invalidVolume =
      !volumeMissing &&
      (!Number.isFinite(c.volume) || c.volume < 0);

    if (
      !values.every(Number.isFinite) ||
      c.open <= 0 ||
      c.high <= 0 ||
      c.low <= 0 ||
      c.close <= 0 ||
      invalidVolume ||
      c.high < Math.max(c.open, c.close, c.low) ||
      c.low > Math.min(c.open, c.close, c.high)
    ) {
      throw new Error(`Invalid OHLCV at index ${i}`);
    }

    previousTime = time;
  }
}

function validateOptions(options) {
  if (
    !options ||
    typeof options !== "object" ||
    Array.isArray(options)
  ) {
    throw new Error("Invalid Fibonacci configuration");
  }

  const config = {
    ...DEFAULTS,
    ...options
  };

  if (
    !Number.isInteger(config.pivotLength) ||
    config.pivotLength < 2 ||
    !Number.isInteger(config.maxLevels) ||
    config.maxLevels < 1
  ) {
    throw new Error("Invalid Fibonacci configuration");
  }

  return config;
}

function findPivots(candles, length) {
  const highs = [];
  const lows = [];

  for (
    let i = length;
    i < candles.length - length;
    i++
  ) {
    let isHigh = true;
    let isLow = true;

    for (
      let j = i - length;
      j <= i + length;
      j++
    ) {
      if (j === i) continue;

      if (candles[j].high >= candles[i].high) {
        isHigh = false;
      }

      if (candles[j].low <= candles[i].low) {
        isLow = false;
      }
    }

    if (isHigh) {
      highs.push({
        price: candles[i].high,
        index: i,
        confirmedAt: i + length
      });
    }

    if (isLow) {
      lows.push({
        price: candles[i].low,
        index: i,
        confirmedAt: i + length
      });
    }
  }

  return { highs, lows };
}

function buildRetracement(start, end, direction) {
  const range = Math.abs(end.price - start.price);

  if (range <= 0) return [];

  return RETRACEMENT_RATIOS.map(ratio => {
    const price =
      direction === "BULLISH"
        ? end.price - range * ratio
        : end.price + range * ratio;

    return {
      ratio,
      percentage: ratio * 100,
      price,
      type: "RETRACEMENT"
    };
  });
}

// Measured-move extension:
// 1.272 = 27.2% beyond the swing endpoint.
// This is not an A-B-C pullback projection.

function buildExtensions(start, end, direction) {
  const range = Math.abs(end.price - start.price);

  if (range <= 0) return [];

  return EXTENSION_RATIOS.map(ratio => {
    const extraDistance = range * (ratio - 1);

    const price =
      direction === "BULLISH"
        ? end.price + extraDistance
        : end.price - extraDistance;

    return {
      ratio,
      percentage: ratio * 100,
      price,
      type: "EXTENSION"
    };
  });
}

function findLatestSwing(highs, lows) {
  const all = [
    ...highs.map(p => ({ ...p, type: "HIGH" })),
    ...lows.map(p => ({ ...p, type: "LOW" }))
  ].sort(
    (a, b) =>
      a.confirmedAt - b.confirmedAt ||
      a.index - b.index
  );

  if (all.length < 2) {
    throw new Error("Not enough confirmed swing points");
  }

  for (let i = all.length - 1; i > 0; i--) {
    const end = all[i];
    const start = all[i - 1];

    if (start.type === end.type) continue;

    if (
      start.type === "LOW" &&
      end.type === "HIGH"
    ) {
      return {
        start,
        end,
        direction: "BULLISH"
      };
    }

    if (
      start.type === "HIGH" &&
      end.type === "LOW"
    ) {
      return {
        start,
        end,
        direction: "BEARISH"
      };
    }
  }

  throw new Error("No alternating confirmed swing pair found");
}

export function analyzeFibonacci(candles, options = {}) {
  validateCandles(candles);

  const config = validateOptions(options);

  const pivots = findPivots(
    candles,
    config.pivotLength
  );

  const swing = findLatestSwing(
    pivots.highs,
    pivots.lows
  );

  const retracement = buildRetracement(
    swing.start,
    swing.end,
    swing.direction
  );

  const extensions = buildExtensions(
    swing.start,
    swing.end,
    swing.direction
  );

  return {
    version: "12.0",
    module: "HISTORICAL_FIBONACCI",
    status: "OK",
    dataType: "HISTORICAL_ONLY",

    settings: config,

    swing: {
      direction: swing.direction,
      startPrice: swing.start.price,
      endPrice: swing.end.price,
      startIndex: swing.start.index,
      endIndex: swing.end.index,
      startConfirmedAt: swing.start.confirmedAt,
      endConfirmedAt: swing.end.confirmedAt
    },

    summary: {
      candleCount: candles.length,
      confirmedHighs: pivots.highs.length,
      confirmedLows: pivots.lows.length,
      retracementLevels: retracement.length,
      extensionLevels: extensions.length
    },

    retracement: retracement.slice(
      0,
      config.maxLevels
    ),

    extensions: extensions.slice(
      0,
      config.maxLevels
    ),

    note:
      "Historical Fibonacci levels use a measured-move extension method. They are mathematical reference levels, not forecasts or trading recommendations."
  };
}
