
import assert from "node:assert/strict";

import {
  analyzeMarketStructure
} from "./market-structure.js";

// ------------------------------------------------------
// HISTORICAL TEST DATA
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
unorderedCandles[10].timestamp =
  unorderedCandles[11].timestamp;
unorderedCandles[11].timestamp = temp;

assert.throws(
  () => analyzeMarketStructure(unorderedCandles),
  /Invalid candle timestamp/
);

console.log("All market structure tests passed.");
