
import assert from "node:assert/strict";
import { analyzeMarketStructure } from "./market-structure.js";

function makeCandles(count = 250) {
  const candles = [];
  const start = Date.UTC(2026, 0, 1, 3, 45);

  for (let i = 0; i < count; i++) {
    const close = 25000 + Math.sin(i / 4) * 100 + i * 0.5;

    candles.push({
      timestamp: new Date(
        start + i * 15 * 60 * 1000
      ).toISOString(),
      open: close - 5,
      high: close + 15,
      low: close - 15,
      close,
      volume: 1000 + i * 2
    });
  }

  return candles;
}

// Test 1: Valid historical analysis
const candles = makeCandles();
const result = analyzeMarketStructure(candles);

assert.equal(result.status, "OK");
assert.equal(result.version, "12.0");
assert.equal(result.summary.candleCount, 250);
assert.ok(Array.isArray(result.pivots.highs));
assert.ok(Array.isArray(result.pivots.lows));
assert.ok(Array.isArray(result.fairValueGaps));
assert.ok(Array.isArray(result.orderBlocks));
assert.ok(Array.isArray(result.liquidity));

console.log("PASS: Historical structure analysis");

// Test 2: Insufficient data
assert.throws(
  () => analyzeMarketStructure(makeCandles(20)),
  /At least 30 historical candles/
);

console.log("PASS: Minimum candle validation");

// Test 3: Invalid OHLC
const invalid = makeCandles();
invalid[10].high = invalid[10].low - 1;

assert.throws(
  () => analyzeMarketStructure(invalid),
  /Invalid OHLCV/
);

console.log("PASS: OHLC validation");

// Test 4: Out-of-order timestamps
const unordered = makeCandles();
[unordered[10], unordered[11]] =
  [unordered[11], unordered[10]];

assert.throws(
  () => analyzeMarketStructure(unordered),
  /Invalid candle timestamp/
);

console.log("PASS: Chronological validation");

// Test 5: Invalid configuration
assert.throws(
  () => analyzeMarketStructure(makeCandles(), {
    pivotLength: 0
  }),
  /Invalid market structure configuration/
);

console.log("PASS: Configuration validation");

console.log("ALL MARKET STRUCTURE TESTS PASSED");
