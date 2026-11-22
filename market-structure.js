
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
    const values = [c.open, c.high, c.low, c.close, c.volume];

    if (!Number.isFinite(time) || time <= previousTime) {
      throw new Error(`Invalid candle timestamp at index ${i}`);
    }

    if (
      !values.every(Number.isFinite) ||
      c.open <= 0 ||
      c.high <= 0 ||
      c.low <= 0 ||
      c.close <= 0 ||
      c.volume < 0 ||
      c.high < Math.max(c.open, c.close, c.low) ||
      c.low > Math.min(c.open, c.close, c.high)
    ) {
      throw new Error(`Invalid OHLCV at index ${i}`);
    }

    previousTime = time;
  }
}

function averageRange(candles, end, length = 14) {
  const start = Math.max(0, end - length + 1);
  let total = 0;
  let count = 0;

  for (let i = start; i <= end; i++) {
    total += candles[i].high - candles[i].low;
    count++;
  }

  return count ? total / count : 0;
}

function findConfirmedPivots(candles, length) {
  const highs = [];
  const lows = [];

  for (let i = length; i < candles.length - length; i++) {
    const current = candles[i];

    let isHigh = true;
    let isLow = true;

    for (let j = i - length; j <= i + length; j++) {
      if (j === i) continue;

      if (candles[j].high >= current.high) isHigh = false;
      if (candles[j].low <= current.low) isLow = false;
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

function detectLiquidity(pivots, tolerance, maxZones) {
  const pools = [];

  for (const pivot of pivots) {
    let matched = null;

    for (const pool of pools) {
      const difference =
        Math.abs(pool.price - pivot.price) / pool.price;

      if (difference <= tolerance) {
        matched = pool;
        break;
      }
    }

    if (matched) {
      matched.touches++;
      matched.lastConfirmedAt = pivot.confirmedAt;
      matched.members.push(pivot);
      matched.price =
        matched.members.reduce((sum, p) => sum + p.price, 0) /
        matched.members.length;
    } else {
      pools.push({
        type: pivot.type === "HIGH" ? "EQUAL_HIGHS" : "EQUAL_LOWS",
        price: pivot.price,
        touches: 1,
        firstConfirmedAt: pivot.confirmedAt,
        lastConfirmedAt: pivot.confirmedAt,
        members: [pivot]
      });
    }
  }

  return pools
    .filter(pool => pool.touches >= 2)
    .slice(-maxZones)
    .map(pool => ({
      type: pool.type,
      price: pool.price,
      touches: pool.touches,
      firstConfirmedAt: pool.firstConfirmedAt,
      lastConfirmedAt: pool.lastConfirmedAt
    }));
}

function detectFVG(candles, maxZones) {
  const zones = [];

  for (let i = 2; i < candles.length; i++) {
    const first = candles[i - 2];
    const current = candles[i];

    // Three-candle bullish gap
    if (current.low > first.high) {
      zones.push({
        type: "BULLISH_FVG",
        lower: first.high,
        upper: current.low,
        createdAt: i,
        timestamp: current.timestamp,
        status: "HISTORICAL_ZONE"
      });
    }

    // Three-candle bearish gap
    if (current.high < first.low) {
      zones.push({
        type: "BEARISH_FVG",
        lower: current.high,
        upper: first.low,
        createdAt: i,
        timestamp: current.timestamp,
        status: "HISTORICAL_ZONE"
      });
    }
  }

  return zones.slice(-maxZones);
}

function detectOrderBlocks(candles, breaks, lookback, maxZones) {
  const zones = [];

  for (const event of breaks) {
    const start = Math.max(0, event.index - lookback);
    let found = null;

    for (let i = event.index - 1; i >= start; i--) {
      const c = candles[i];

      if (event.direction === "BULLISH" && c.close < c.open) {
        found = {
          type: "BULLISH_ORDER_BLOCK",
          lower: c.low,
          upper: c.high,
          sourceIndex: i,
          createdAt: event.index,
          timestamp: c.timestamp
        };
        break;
      }

      if (event.direction === "BEARISH" && c.close > c.open) {
        found = {
          type: "BEARISH_ORDER_BLOCK",
          lower: c.low,
          upper: c.high,
          sourceIndex: i,
          createdAt: event.index,
          timestamp: c.timestamp
        };
        break;
      }
    }

    if (found) zones.push(found);
  }

  return zones.slice(-maxZones);
}

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
    // Pivots become usable only after confirmation.
    if (highMap.has(i)) latestHigh = highMap.get(i);
    if (lowMap.has(i)) latestLow = lowMap.get(i);

    const c = candles[i];

    if (latestHigh && i > latestHigh.confirmedAt &&
        c.close > latestHigh.price) {
      const type = trend === "BEARISH" ? "CHOCH" : "BOS";

      events.push({
        type,
        direction: "BULLISH",
        index: i,
        brokenLevel: latestHigh.price,
        timestamp: c.timestamp
      });

      latestHigh = null;
      trend = "BULLISH";
    }

    if (latestLow && i > latestLow.confirmedAt &&
        c.close < latestLow.price) {
      const type = trend === "BULLISH" ? "CHOCH" : "BOS";

      events.push({
        type,
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

export function analyzeMarketStructure(
  candles,
  options = {}
) {
  validateCandles(candles);

  const config = {
    ...DEFAULTS,
    ...options
  };

  if (
    !Number.isInteger(config.pivotLength) ||
    config.pivotLength < 2 ||
    !Number.isInteger(config.orderBlockLookback) ||
    config.orderBlockLookback < 1 ||
    !Number.isFinite(config.equalLevelTolerance) ||
    config.equalLevelTolerance < 0 ||
    !Number.isInteger(config.maxZones) ||
    config.maxZones < 1
  ) {
    throw new Error("Invalid market structure configuration");
  }

  const pivots = findConfirmedPivots(
    candles,
    config.pivotLength
  );

  const structure = detectStructure(candles, pivots);

  const liquidity = detectLiquidity(
    [...pivots.highs, ...pivots.lows].sort(
      (a, b) => a.confirmedAt - b.confirmedAt
    ),
    config.equalLevelTolerance,
    config.maxZones
  );

  const fvg = detectFVG(candles, config.maxZones);

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
        z => z.type === "BULLISH_FVG"
      ).length,
      bearishFVGs: fvg.filter(
        z => z.type === "BEARISH_FVG"
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
