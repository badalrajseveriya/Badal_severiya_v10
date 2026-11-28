
// ======================================================
// BADAL SEVERIYA V12
// HISTORICAL MARKET STRUCTURE ENGINE
// Educational analysis only
// No forecasts, probabilities or trading signals
// ======================================================

const DEFAULTS = {
  pivotLength: 5,
  equalLevelTolerance: 0.001,
  orderBlockLookback: 20,
  maxZones: 100
};

// ------------------------------------------------------
// VALIDATION
// ------------------------------------------------------

function validateCandles(candles) {
  if (!Array.isArray(candles) || candles.length < 30) {
    throw new Error("At least 30 historical candles are required");
  }

  let previousTime = -Infinity;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];

    if (!c || typeof c !== "object") {
      throw new Error(`Invalid candle at index ${i}`);
    }

    const time = Date.parse(c.timestamp);
    const values = [c.open, c.high, c.low, c.close];

    const volumeMissing =
      c.volume === null ||
      c.volume === undefined ||
      c.volume === "";

    const invalidVolume =
      !volumeMissing &&
      (!Number.isFinite(c.volume) || c.volume < 0);

    if (!Number.isFinite(time) || time <= previousTime) {
      throw new Error(`Invalid candle timestamp at index ${i}`);
    }

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

function validateConfig(config) {
  if (
    !Number.isInteger(config.pivotLength) ||
    config.pivotLength < 2 ||
    config.pivotLength > 50 ||
    !Number.isFinite(config.equalLevelTolerance) ||
    config.equalLevelTolerance < 0 ||
    config.equalLevelTolerance > 0.05 ||
    !Number.isInteger(config.orderBlockLookback) ||
    config.orderBlockLookback < 1 ||
    config.orderBlockLookback > 500 ||
    !Number.isInteger(config.maxZones) ||
    config.maxZones < 1 ||
    config.maxZones > 1000
  ) {
    throw new Error("Invalid market structure configuration");
  }
}

// ------------------------------------------------------
// CONFIRMED PIVOTS
// ------------------------------------------------------

function findConfirmedPivots(candles, length) {
  const highs = [];
  const lows = [];

  for (let i = length; i < candles.length - length; i++) {
    const current = candles[i];

    let isHigh = true;
    let isLow = true;

    for (let j = i - length; j <= i + length; j++) {
      if (j === i) continue;

      if (candles[j].high >= current.high) {
        isHigh = false;
      }

      if (candles[j].low <= current.low) {
        isLow = false;
      }

      if (!isHigh && !isLow) break;
    }

    const confirmedAt = i + length;

    if (isHigh) {
      highs.push({
        type: "HIGH",
        price: current.high,
        pivotIndex: i,
        confirmedAt,
        timestamp: current.timestamp
      });
    }

    if (isLow) {
      lows.push({
        type: "LOW",
        price: current.low,
        pivotIndex: i,
        confirmedAt,
        timestamp: current.timestamp
      });
    }
  }

  return { highs, lows };
}

// ------------------------------------------------------
// EQUAL HIGH / LOW LIQUIDITY CLUSTERS
// ------------------------------------------------------

function clusterPivots(pivots, type, tolerance, maxZones) {
  const sorted = [...pivots].sort(
    (a, b) => a.confirmedAt - b.confirmedAt
  );

  const clusters = [];

  for (const pivot of sorted) {
    let matched = null;

    for (const cluster of clusters) {
      const difference =
        Math.abs(cluster.price - pivot.price) /
        cluster.price;

      if (difference <= tolerance) {
        matched = cluster;
        break;
      }
    }

    if (matched) {
      matched.members.push(pivot);

      matched.price =
        matched.members.reduce(
          (sum, item) => sum + item.price,
          0
        ) / matched.members.length;

      matched.lastConfirmedAt = pivot.confirmedAt;
    } else {
      clusters.push({
        type,
        price: pivot.price,
        members: [pivot],
        firstConfirmedAt: pivot.confirmedAt,
        lastConfirmedAt: pivot.confirmedAt
      });
    }
  }

  return clusters
    .filter(cluster => cluster.members.length >= 2)
    .slice(-maxZones)
    .map(cluster => ({
      type: cluster.type,
      price: cluster.price,
      touches: cluster.members.length,
      firstConfirmedAt: cluster.firstConfirmedAt,
      lastConfirmedAt: cluster.lastConfirmedAt
    }));
}

function detectLiquidity(pivots, tolerance, maxZones) {
  const highs = clusterPivots(
    pivots.highs,
    "EQUAL_HIGHS",
    tolerance,
    maxZones
  );

  const lows = clusterPivots(
    pivots.lows,
    "EQUAL_LOWS",
    tolerance,
    maxZones
  );

  return [...highs, ...lows]
    .sort(
      (a, b) => a.lastConfirmedAt - b.lastConfirmedAt
    )
    .slice(-maxZones);
}

// ------------------------------------------------------
// FAIR VALUE GAPS AND HISTORICAL MITIGATION
// ------------------------------------------------------

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function detectBullishFVG(candles, index) {
  const first = candles[index - 2];
  const current = candles[index];

  const lower = first.high;
  const upper = current.low;
  const width = upper - lower;

  let firstMitigatedAt = null;
  let mitigatedAt = null;
  let mitigationPercent = 0;

  for (let j = index + 1; j < candles.length; j++) {
    const penetration =
      clamp(
        ((upper - candles[j].low) / width) * 100,
        0,
        100
      );

    mitigationPercent = Math.max(
      mitigationPercent,
      penetration
    );

    if (
      firstMitigatedAt === null &&
      candles[j].low <= upper
    ) {
      firstMitigatedAt = j;
    }

    if (candles[j].low <= lower) {
      mitigatedAt = j;
      mitigationPercent = 100;
      break;
    }
  }

  const mitigationStatus =
    mitigatedAt !== null
      ? "MITIGATED"
      : firstMitigatedAt !== null
        ? "PARTIALLY_MITIGATED"
        : "UNMITIGATED_IN_AVAILABLE_HISTORY";

  return {
    type: "BULLISH_FVG",
    lower,
    upper,
    createdAt: index,
    timestamp: current.timestamp,

    // Backward-compatible status.
    // UNMITIGATED means not fully filled.
    status: mitigatedAt === null
      ? "UNMITIGATED_IN_AVAILABLE_HISTORY"
      : "MITIGATED",

    mitigationStatus,
    firstMitigatedAt,
    mitigatedAt,
    mitigationPercent: Number(
      mitigationPercent.toFixed(2)
    )
  };
}

function detectBearishFVG(candles, index) {
  const first = candles[index - 2];
  const current = candles[index];

  const lower = current.high;
  const upper = first.low;
  const width = upper - lower;

  let firstMitigatedAt = null;
  let mitigatedAt = null;
  let mitigationPercent = 0;

  for (let j = index + 1; j < candles.length; j++) {
    const penetration =
      clamp(
        ((candles[j].high - lower) / width) * 100,
        0,
        100
      );

    mitigationPercent = Math.max(
      mitigationPercent,
      penetration
    );

    if (
      firstMitigatedAt === null &&
      candles[j].high >= lower
    ) {
      firstMitigatedAt = j;
    }

    if (candles[j].high >= upper) {
      mitigatedAt = j;
      mitigationPercent = 100;
      break;
    }
  }

  const mitigationStatus =
    mitigatedAt !== null
      ? "MITIGATED"
      : firstMitigatedAt !== null
        ? "PARTIALLY_MITIGATED"
        : "UNMITIGATED_IN_AVAILABLE_HISTORY";

  return {
    type: "BEARISH_FVG",
    lower,
    upper,
    createdAt: index,
    timestamp: current.timestamp,

    // Backward-compatible status.
    status: mitigatedAt === null
      ? "UNMITIGATED_IN_AVAILABLE_HISTORY"
      : "MITIGATED",

    mitigationStatus,
    firstMitigatedAt,
    mitigatedAt,
    mitigationPercent: Number(
      mitigationPercent.toFixed(2)
    )
  };
}

function detectFVG(candles, maxZones) {
  const zones = [];

  for (let i = 2; i < candles.length; i++) {
    const first = candles[i - 2];
    const current = candles[i];

    if (current.low > first.high) {
      zones.push(detectBullishFVG(candles, i));
    }

    if (current.high < first.low) {
      zones.push(detectBearishFVG(candles, i));
    }
  }

  return zones.slice(-maxZones);
}

// ------------------------------------------------------
// STRUCTURE BREAKS: BOS / CHOCH
// ------------------------------------------------------

function detectStructure(candles, pivots) {
  const events = [];

  let latestHigh = null;
  let latestLow = null;
  let trend = "UNKNOWN";

  const highMap = new Map();
  const lowMap = new Map();

  for (const pivot of pivots.highs) {
    highMap.set(pivot.confirmedAt, pivot);
  }

  for (const pivot of pivots.lows) {
    lowMap.set(pivot.confirmedAt, pivot);
  }

  for (let i = 0; i < candles.length; i++) {
    if (highMap.has(i)) {
      latestHigh = highMap.get(i);
    }

    if (lowMap.has(i)) {
      latestLow = lowMap.get(i);
    }

    const c = candles[i];

    if (
      latestHigh &&
      i > latestHigh.confirmedAt &&
      c.close > latestHigh.price
    ) {
      events.push({
        type: trend === "BEARISH" ? "CHOCH" : "BOS",
        direction: "BULLISH",
        index: i,
        brokenLevel: latestHigh.price,
        timestamp: c.timestamp
      });

      latestHigh = null;
      trend = "BULLISH";
    }

    if (
      latestLow &&
      i > latestLow.confirmedAt &&
      c.close < latestLow.price
    ) {
      events.push({
        type: trend === "BULLISH" ? "CHOCH" : "BOS",
        direction: "BEARISH",
        index: i,
        brokenLevel: latestLow.price,
        timestamp: c.timestamp
      });

      latestLow = null;
      trend = "BEARISH";
    }
  }

  return { events, trend };
}

// ------------------------------------------------------
// HISTORICAL ORDER BLOCK ZONES
// ------------------------------------------------------

function detectOrderBlocks(
  candles,
  breaks,
  lookback,
  maxZones
) {
  const zones = [];
  const usedSourceIndices = new Set();

  for (const event of breaks) {
    const start = Math.max(0, event.index - lookback);
    let found = null;

    for (let i = event.index - 1; i >= start; i--) {
      if (usedSourceIndices.has(i)) continue;

      const c = candles[i];

      const isOpposite =
        event.direction === "BULLISH"
          ? c.close < c.open
          : c.close > c.open;

      if (!isOpposite) continue;

      found = {
        type: event.direction === "BULLISH"
          ? "BULLISH_ORDER_BLOCK"
          : "BEARISH_ORDER_BLOCK",
        lower: c.low,
        upper: c.high,
        sourceIndex: i,
        createdAt: event.index,
        timestamp: c.timestamp
      };

      usedSourceIndices.add(i);
      break;
    }

    if (found) zones.push(found);
  }

  return zones.slice(-maxZones);
}

// ------------------------------------------------------
// MAIN ANALYSIS
// ------------------------------------------------------

export function analyzeMarketStructure(
  candles,
  options = {}
) {
  validateCandles(candles);

  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options)
  ) {
    throw new Error("Invalid market structure configuration");
  }

  const config = {
    ...DEFAULTS,
    ...options
  };

  validateConfig(config);

  const pivots = findConfirmedPivots(
    candles,
    config.pivotLength
  );

  const structure = detectStructure(candles, pivots);

  const liquidity = detectLiquidity(
    pivots,
    config.equalLevelTolerance,
    config.maxZones
  );

  const fvg = detectFVG(
    candles,
    config.maxZones
  );

  const orderBlocks = detectOrderBlocks(
    candles,
    structure.events,
    config.orderBlockLookback,
    config.maxZones
  );

  return {
    version: "12.0",
    module: "HISTORICAL_MARKET_STRUCTURE",
    status: "OK",
    dataType: "HISTORICAL_ONLY",

    settings: config,

    summary: {
      candleCount: candles.length,
      confirmedSwingHighs: pivots.highs.length,
      confirmedSwingLows: pivots.lows.length,
      structureEvents: structure.events.length,

      bullishFVGs: fvg.filter(
        zone => zone.type === "BULLISH_FVG"
      ).length,

      bearishFVGs: fvg.filter(
        zone => zone.type === "BEARISH_FVG"
      ).length,

      mitigatedFVGs: fvg.filter(
        zone => zone.mitigationStatus === "MITIGATED"
      ).length,

      partiallyMitigatedFVGs: fvg.filter(
        zone => zone.mitigationStatus === "PARTIALLY_MITIGATED"
      ).length,

      unmitigatedFVGs: fvg.filter(
        zone =>
          zone.mitigationStatus ===
          "UNMITIGATED_IN_AVAILABLE_HISTORY"
      ).length,

      orderBlocks: orderBlocks.length,
      liquidityPools: liquidity.length,
      historicalTrendClassification: structure.trend
    },

    pivots,
    structureEvents: structure.events,
    liquidity,
    fairValueGaps: fvg,
    orderBlocks,

    note:
      "Historical educational analysis only. Zones and classifications are not forecasts, probabilities, or trading recommendations."
  };
}
