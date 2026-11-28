
import assert from "node:assert/strict";

import {
  analyzeMarketStructure
} from "./market-structure.js";

// ------------------------------------------------------
// TEST DATA HELPERS
// ------------------------------------------------------

function makeCandles(count = 100) {
  const candles = [];
  const start = Date.UTC(2026, 0, 1, 3, 45);

  for (let i = 0; i < count; i++) {
    const close = 25000 + Math.sin(i / 4) * 30 + i * 0.5;
    const open = close - Math.sin(i) * 5;

    candles.push({
      timestamp: new Date(
        start + i * 15 * 60 * 1000
      ).toISOString(),
      open,
      high: Math.max(open, close) + 8,
      low: Math.min(open, close) - 8,
      close,
      volume: 1000 + i * 10
    });
  }

  return candles;
}

function makeTrendCandles(closes) {
  const start = Date.UTC(2026, 0, 1);

  return closes.map((close, i) => ({
    timestamp: new Date(
      start + i * 24 * 60 * 60 * 1000
    ).toISOString(),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000
  }));
}

function makeFvgCandles(direction, fillType) {
  const start = Date.UTC(2026, 0, 1);

  const candles = Array.from(
    { length: 30 },
    (_, i) => ({
      timestamp: new Date(
        start + i * 15 * 60 * 1000
      ).toISOString(),
      open: 108,
      high: 110,
      low: 106,
      close: 108,
      volume: 1000
    })
  );

  if (direction === "BULLISH") {
    candles[0] = {
      ...candles[0],
      open: 98,
      high: 100,
      low: 97,
      close: 99
    };

    candles[1] = {
      ...candles[1],
      open: 102,
      high: 103,
      low: 101,
      close: 102
    };

    candles[2] = {
      ...candles[2],
      open: 108,
      high: 110,
      low: 105,
      close: 109
    };

    if (fillType === "PARTIAL") {
      candles[3] = {
        ...candles[3],
        open: 108,
        high: 110,
        low: 102,
        close: 106
      };
    }

    if (fillType === "FULL") {
      candles[3] = {
        ...candles[3],
        open: 108,
        high: 110,
        low: 99,
        close: 101
      };
    }
  }

  if (direction === "BEARISH") {
    candles[0] = {
      ...candles[0],
      open: 108,
      high: 110,
      low: 106,
      close: 108
    };

    candles[1] = {
      ...candles[1],
      open: 104,
      high: 105,
      low: 103,
      close: 104
    };

    candles[2] = {
      ...candles[2],
      open: 99,
      high: 100,
      low: 97,
      close: 98
    };

    if (fillType === "PARTIAL") {
      candles[3] = {
        ...candles[3],
        open: 99,
        high: 103,
        low: 97,
        close: 101
      };
    }

    if (fillType === "FULL") {
      candles[3] = {
        ...candles[3],
        open: 99,
        high: 111,
        low: 97,
        close: 108
      };
    }
  }

  return candles;
}

// ------------------------------------------------------
// TEST 1: BASIC ANALYSIS
// ------------------------------------------------------

const candles = makeCandles();
const result = analyzeMarketStructure(candles);

assert.equal(result.status, "OK");
assert.equal(result.version, "12.0");
assert.equal(result.dataType, "HISTORICAL_ONLY");
assert.equal(result.summary.candleCount, 100);

assert.ok(Array.isArray(result.pivots.highs));
assert.ok(Array.isArray(result.pivots.lows));
assert.ok(Array.isArray(result.structureEvents));
assert.ok(Array.isArray(result.liquidity));
assert.ok(Array.isArray(result.fairValueGaps));
assert.ok(Array.isArray(result.orderBlocks));

// ------------------------------------------------------
// TEST 2: CUSTOM SETTINGS
// ------------------------------------------------------

const customResult = analyzeMarketStructure(candles, {
  pivotLength: 4,
  maxZones: 20
});

assert.equal(customResult.settings.pivotLength, 4);
assert.equal(customResult.settings.maxZones, 20);

// ------------------------------------------------------
// TEST 3: INSUFFICIENT CANDLES
// ------------------------------------------------------

assert.throws(
  () => analyzeMarketStructure(makeCandles(20)),
  /At least 30 historical candles are required/
);

// ------------------------------------------------------
// TEST 4: INVALID TIMESTAMP
// ------------------------------------------------------

const invalidTimestamp = makeCandles();
invalidTimestamp[10].timestamp = "invalid-date";

assert.throws(
  () => analyzeMarketStructure(invalidTimestamp),
  /Invalid candle timestamp/
);

// ------------------------------------------------------
// TEST 5: INVALID OHLCV
// ------------------------------------------------------

const invalidOHLC = makeCandles();
invalidOHLC[10].high = 1;

assert.throws(
  () => analyzeMarketStructure(invalidOHLC),
  /Invalid OHLCV/
);

// ------------------------------------------------------
// TEST 6: INVALID CONFIGURATION
// ------------------------------------------------------

assert.throws(
  () => analyzeMarketStructure(candles, {
    pivotLength: 1
  }),
  /Invalid market structure configuration/
);

assert.throws(
  () => analyzeMarketStructure(candles, null),
  /Invalid market structure configuration/
);

// ------------------------------------------------------
// TEST 7: CHRONOLOGICAL ORDER
// ------------------------------------------------------

const unorderedCandles = makeCandles();

const temp = unorderedCandles[10].timestamp;
unorderedCandles[10].timestamp = unorderedCandles[11].timestamp;
unorderedCandles[11].timestamp = temp;

assert.throws(
  () => analyzeMarketStructure(unorderedCandles),
  /Invalid candle timestamp/
);

// ------------------------------------------------------
// TEST 8: DETERMINISTIC TREND CLASSIFICATION
// ------------------------------------------------------

const neutralCloses = [
  100, 102, 104, 102, 100, 98,
  100, 102, 104, 102, 100, 98,
  100, 102, 104, 102, 100, 98,
  100, 102, 104, 102, 100, 98,
  100, 102, 104, 102, 100, 98
];

const bearishBreakCloses = [
  100, 102, 104, 102, 100, 98,
  100, 102, 104, 102, 100, 98,
  100, 102, 104, 102, 100, 98,
  100, 102, 106, 105, 104, 103,
  102, 101, 100, 99, 98, 97, 96
];

const neutralTrend = analyzeMarketStructure(
  makeTrendCandles(neutralCloses)
);

assert.equal(
  neutralTrend.summary.historicalTrendClassification,
  "UNKNOWN"
);

const bullishTrend = analyzeMarketStructure(
  makeTrendCandles(
    bearishBreakCloses.map(value => 200 - value)
  )
);

assert.equal(
  bullishTrend.summary.historicalTrendClassification,
  "BULLISH"
);

const bearishTrend = analyzeMarketStructure(
  makeTrendCandles(bearishBreakCloses)
);

assert.equal(
  bearishTrend.summary.historicalTrendClassification,
  "BEARISH"
);

for (const analysis of [
  neutralTrend,
  bullishTrend,
  bearishTrend
]) {
  assert.ok(
    ["UNKNOWN", "BULLISH", "BEARISH"].includes(
      analysis.summary.historicalTrendClassification
    )
  );
}

// ------------------------------------------------------
// TEST 9: BULLISH FVG PARTIAL MITIGATION
// ------------------------------------------------------

{
  const result = analyzeMarketStructure(
    makeFvgCandles("BULLISH", "PARTIAL")
  );

  const zone = result.fairValueGaps.find(
    item => item.type === "BULLISH_FVG"
  );

  assert.ok(zone);
  assert.equal(zone.lower, 100);
  assert.equal(zone.upper, 105);
  assert.equal(zone.status, "UNMITIGATED_IN_AVAILABLE_HISTORY");
  assert.equal(zone.mitigationStatus, "PARTIALLY_MITIGATED");
  assert.equal(zone.firstMitigatedAt, 3);
  assert.equal(zone.mitigatedAt, null);
  assert.equal(zone.mitigationPercent, 60);
}

// ------------------------------------------------------
// TEST 10: BULLISH FVG FULL MITIGATION
// ------------------------------------------------------

{
  const result = analyzeMarketStructure(
    makeFvgCandles("BULLISH", "FULL")
  );

  const zone = result.fairValueGaps.find(
    item => item.type === "BULLISH_FVG"
  );

  assert.ok(zone);
  assert.equal(zone.mitigationStatus, "MITIGATED");
  assert.equal(zone.firstMitigatedAt, 3);
  assert.equal(zone.mitigatedAt, 3);
  assert.equal(zone.mitigationPercent, 100);
  assert.equal(zone.status, "MITIGATED");
}

// ------------------------------------------------------
// TEST 11: BEARISH FVG PARTIAL MITIGATION
// ------------------------------------------------------

{
  const result = analyzeMarketStructure(
    makeFvgCandles("BEARISH", "PARTIAL")
  );

  const zone = result.fairValueGaps.find(
    item => item.type === "BEARISH_FVG"
  );

  assert.ok(zone);
  assert.equal(zone.lower, 100);
  assert.equal(zone.upper, 106);
  assert.equal(zone.mitigationStatus, "PARTIALLY_MITIGATED");
  assert.equal(zone.firstMitigatedAt, 3);
  assert.equal(zone.mitigatedAt, null);
  assert.equal(zone.mitigationPercent, 50);
}

// ------------------------------------------------------
// TEST 12: BEARISH FVG FULL MITIGATION
// ------------------------------------------------------

{
  const result = analyzeMarketStructure(
    makeFvgCandles("BEARISH", "FULL")
  );

  const zone = result.fairValueGaps.find(
    item => item.type === "BEARISH_FVG"
  );

  assert.ok(zone);
  assert.equal(zone.mitigationStatus, "MITIGATED");
  assert.equal(zone.firstMitigatedAt, 3);
  assert.equal(zone.mitigatedAt, 3);
  assert.equal(zone.mitigationPercent, 100);
}

// ------------------------------------------------------
// TEST 13: FVG SUMMARY COUNTS
// ------------------------------------------------------

{
  const result = analyzeMarketStructure(
    makeFvgCandles("BULLISH", "PARTIAL")
  );

  assert.equal(
    result.summary.partiallyMitigatedFVGs,
    1
  );

  assert.equal(
    result.summary.mitigatedFVGs,
    0
  );

  assert.equal(
    result.summary.unmitigatedFVGs,
    0
  );
}

// ------------------------------------------------------
// TEST 14: HISTORICAL ONLY SAFETY
// ------------------------------------------------------

assert.equal(result.dataType, "HISTORICAL_ONLY");

assert.match(
  result.note,
  /not forecasts|not trading recommendations/i
);

console.log("PASS: Basic market structure analysis");
console.log("PASS: Configuration and candle validation");
console.log("PASS: UNKNOWN, BULLISH and BEARISH classification");
console.log("PASS: Bullish and bearish FVG partial mitigation");
console.log("PASS: Bullish and bearish FVG full mitigation");
console.log("PASS: Historical FVG summary counts");
console.log("All market structure tests passed.");
