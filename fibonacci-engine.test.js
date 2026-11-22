
import assert from "node:assert/strict";
import { analyzeFibonacci } from "./fibonacci-engine.js";

function makeCandles(count = 250) {
  const candles = [];
  const start = Date.UTC(2026, 0, 1, 3, 45);

  for (let i = 0; i < count; i++) {
    const close =
      25000 + Math.sin(i / 4) * 100 + i * 0.5;

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

// Test 1: Valid Fibonacci analysis
const result = analyzeFibonacci(makeCandles());

assert.equal(result.status, "OK");
assert.equal(result.version, "12.0");
assert.equal(result.dataType, "HISTORICAL_ONLY");
assert.ok(
  ["BULLISH", "BEARISH"].includes(result.swing.direction)
);
assert.equal(result.retracement.length, 7);
assert.equal(result.extensions.length, 5);

console.log("PASS: Fibonacci analysis");

// Test 2: Insufficient history
assert.throws(
  () => analyzeFibonacci(makeCandles(20)),
  /At least 30 historical candles/
);

console.log("PASS: Minimum history validation");

// Test 3: Invalid OHLC
const invalid = makeCandles();
invalid[10].high = invalid[10].low - 1;

assert.throws(
  () => analyzeFibonacci(invalid),
  /Invalid OHLCV/
);

console.log("PASS: OHLC validation");

// Test 4: Unordered timestamps
const unordered = makeCandles();
[unordered[10], unordered[11]] =
  [unordered[11], unordered[10]];

assert.throws(
  () => analyzeFibonacci(unordered),
  /Invalid candle timestamp/
);

console.log("PASS: Chronological validation");

// Test 5: Invalid configuration
assert.throws(
  () => analyzeFibonacci(makeCandles(), {
    pivotLength: 0
  }),
  /Invalid Fibonacci configuration/
);

console.log("PASS: Configuration validation");

console.log("ALL FIBONACCI TESTS PASSED");
