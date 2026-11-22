
 // ======================================================
 // BADAL SEVERIYA V12
 // HISTORICAL SUPPORT & RESISTANCE ENGINE
 // Educational analysis only
 // ======================================================

const DEFAULTS = {
  pivotLength: 5,
  tolerancePercent: 0.15,
  maxZones: 100,
  minimumTouches: 2
};

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

function findPivots(candles, length) {
  const pivots = [];

  for (let i = length; i < candles.length - length; i++) {
    let highPivot = true;
    let lowPivot = true;

    for (let j = i - length; j <= i + length; j++) {
      if (j === i) continue;

      if (candles[j].high >= candles[i].high) highPivot = false;
      if (candles[j].low <= candles[i].low) lowPivot = false;
    }

    const confirmedAt = i + length;

    if (highPivot) {
      pivots.push({
        type: "RESISTANCE",
        price: candles[i].high,
        pivotIndex: i,
        confirmedAt
      });
    }

    if (lowPivot) {
      pivots.push({
        type: "SUPPORT",
        price: candles[i].low,
        pivotIndex: i,
        confirmedAt
      });
    }
  }

  return pivots.sort((a, b) => a.confirmedAt - b.confirmedAt);
}

function buildZones(pivots, candles, config) {
  const zones = [];

  for (const pivot of pivots) {
    let zone = null;

    for (const candidate of zones) {
      if (candidate.type !== pivot.type) continue;

      const difference =
        Math.abs(candidate.price - pivot.price) /
        candidate.price * 100;

      if (difference <= config.tolerancePercent) {
        zone = candidate;
        break;
      }
    }

    if (!zone) {
      zones.push({
        type: pivot.type,
        price: pivot.price,
        touches: 1,
        firstConfirmedAt: pivot.confirmedAt,
        lastConfirmedAt: pivot.confirmedAt,
        pivotIndices: [pivot.pivotIndex]
      });
    } else {
      zone.touches++;
      zone.lastConfirmedAt = pivot.confirmedAt;
      zone.pivotIndices.push(pivot.pivotIndex);

      zone.price =
        zone.pivotIndices.reduce(
          (sum, index) => sum +
            (pivot.type === "SUPPORT"
              ? candles[index].low
              : candles[index].high),
          0
        ) / zone.pivotIndices.length;
    }
  }

  return zones
    .filter(z => z.touches >= config.minimumTouches)
    .map(z => ({
      type: z.type,
      lower: z.price * (1 - config.tolerancePercent / 200),
      upper: z.price * (1 + config.tolerancePercent / 200),
      price: z.price,
      touches: z.touches,
      firstConfirmedAt: z.firstConfirmedAt,
      lastConfirmedAt: z.lastConfirmedAt,
      strengthScore: Math.min(100, z.touches * 20),
      classification:
        z.touches >= 4 ? "REPEATEDLY_TESTED" : "TESTED"
    }))
    .sort((a, b) => b.touches - a.touches)
    .slice(0, config.maxZones);
}

export function analyzeSupportResistance(candles, options = {}) {
  validateCandles(candles);

  const config = {
    ...DEFAULTS,
    ...options
  };

  if (
    !Number.isInteger(config.pivotLength) ||
    config.pivotLength < 2 ||
    !Number.isFinite(config.tolerancePercent) ||
    config.tolerancePercent <= 0 ||
    config.tolerancePercent > 5 ||
    !Number.isInteger(config.maxZones) ||
    config.maxZones < 1 ||
    !Number.isInteger(config.minimumTouches) ||
    config.minimumTouches < 1
  ) {
    throw new Error("Invalid support/resistance configuration");
  }

  const pivots = findPivots(candles, config.pivotLength);
  const zones = buildZones(pivots, candles, config);

  const supports = zones.filter(z => z.type === "SUPPORT");
  const resistances = zones.filter(z => z.type === "RESISTANCE");

  return {
    version: "12.0",
    module: "HISTORICAL_SUPPORT_RESISTANCE",
    status: "OK",
    dataType: "HISTORICAL_ONLY",

    settings: config,

    summary: {
      candleCount: candles.length,
      confirmedPivots: pivots.length,
      supportZones: supports.length,
      resistanceZones: resistances.length
    },

    supports,
    resistances,

    note:
      "Historical zones and strength scores are descriptive measurements, not forecasts or trading recommendations."
  };
}
