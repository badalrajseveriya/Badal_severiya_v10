
import { analyzeMarket } from "./market-data.js";
import assert from "node:assert/strict";

function makeHistoricalCandles(count = 250) {
  const candles = [];
  const start = Date.UTC(2026, 0, 1, 3, 45);

  for (let i = 0; i < count; i++) {
    const close = 25000 + i * 2 + Math.sin(i / 5) * 20;

    candles.push({
      timestamp: new Date(start + i * 15 * 60 * 1000).toISOString(),
      open: close - 5,
      high: close + 10,
      low: close - 10,
      close,
      volume: 1000 + i * 5
    });
  }

  return candles;
}

// Test 1: Analysis result structure
const result = analyzeMarket({
  index: "NIFTY",
  timeframe: "15m",
  candles: makeHistoricalCandles()
});

assert.equal(result.status, "OK");
assert.equal(result.version, "11.1");
assert.equal(result.dataInfo.candleCount, 250);
assert.equal(result.dataInfo.chronologicalOrderValidated, true);
assert.ok(Number.isFinite(result.indicators.ema200));
assert.ok(Number.isFinite(result.indicators.rsi14));
assert.ok(Number.isFinite(result.indicators.atr14));

console.log("PASS: Historical indicator calculations");

// Test 2: Volume baseline excludes current candle
assert.equal(result.indicators.volume.baselineCandles, 20);
assert.equal(result.indicators.volume.available, true);

console.log("PASS: Relative volume baseline");

// Test 3: Insufficient history
const shortResult = analyzeMarket(makeHistoricalCandles(100));

assert.equal(shortResult.status, "ERROR");

console.log("PASS: Minimum candle validation");

// Test 4: Invalid OHLC
const invalidCandles = makeHistoricalCandles();
invalidCandles[10].high = invalidCandles[10].low - 1;

const invalidResult = analyzeMarket(invalidCandles);

assert.equal(invalidResult.status, "ERROR");

console.log("PASS: Invalid OHLC validation");

// Test 5: Out-of-order timestamps
const unorderedCandles = makeHistoricalCandles();
[unorderedCandles[10], unorderedCandles[11]] =
  [unorderedCandles[11], unorderedCandles[10]];

const unorderedResult = analyzeMarket(unorderedCandles);

assert.equal(unorderedResult.status, "ERROR");

console.log("PASS: Chronological order validation");

console.log("ALL MARKET DATA TESTS PASSED");
