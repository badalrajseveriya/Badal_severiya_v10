
import assert from "node:assert/strict";
import { analyzeCandlePatterns } from "./candle-patterns.js";

function makeCandles(count = 100) {
  const candles = [];
  const start = Date.UTC(2026, 0, 1, 3, 45);

  for (let i = 0; i < count; i++) {
    const close = 25000 + i * 2;

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

// Test 1: Valid analysis
const result = analyzeCandlePatterns(makeCandles());

assert.equal(result.status, "OK");
assert.equal(result.version, "12.0");
assert.equal(result.dataType, "HISTORICAL_ONLY");
assert.ok(Array.isArray(result.patterns));
assert.ok(result.summary.candleCount === 100);

console.log("PASS: Candle pattern analysis");

// Test 2: Insufficient history
assert.throws(
  () => analyzeCandlePatterns(makeCandles(4)),
  /At least 5 historical candles/
);

console.log("PASS: Minimum history validation");

// Test 3: Invalid OHLC
const invalid = makeCandles();
invalid[10].high = invalid[10].low - 1;

assert.throws(
  () => analyzeCandlePatterns(invalid),
  /Invalid OHLCV/
);

console.log("PASS: OHLC validation");

// Test 4: Unordered timestamps
const unordered = makeCandles();
[unordered[10], unordered[11]] =
  [unordered[11], unordered[10]];

assert.throws(
  () => analyzeCandlePatterns(unordered),
  /Invalid candle timestamp/
);

console.log("PASS: Chronological validation");

// Test 5: Invalid configuration
assert.throws(
  () => analyzeCandlePatterns(makeCandles(), {
    dojiBodyRatio: 2
  }),
  /Invalid candle pattern configuration/
);

console.log("PASS: Configuration validation");

console.log("ALL CANDLE PATTERN TESTS PASSED");
