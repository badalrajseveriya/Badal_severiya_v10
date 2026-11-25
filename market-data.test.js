
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
assert.equal(result.dataInfo.maxCandlesAllowed, 5000);
assert.equal(result.dataInfo.chronologicalOrderValidated, true);
assert.ok(Number.isFinite(result.indicators.ema200));
assert.ok(Number.isFinite(result.indicators.rsi14));
assert.ok(Number.isFinite(result.indicators.atr14));

console.log("PASS: Historical indicator calculations");

// Test 2: Volume baseline
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

// Test 6: Default limit rejects more than 5000
const overDefaultLimit = analyzeMarket(makeHistoricalCandles(5500));
assert.equal(overDefaultLimit.status, "ERROR");

console.log("PASS: Default 5000 candle limit");

// Test 7: Custom limit accepts 5500 candles
const custom5500 = analyzeMarket(
  makeHistoricalCandles(5500),
  { maxCandles: 6000 }
);

assert.equal(custom5500.status, "OK");
assert.equal(custom5500.dataInfo.candleCount, 5500);
assert.equal(custom5500.dataInfo.maxCandlesAllowed, 6000);

console.log("PASS: Custom 5500 candle analysis");

// Test 8: Custom limit accepts 12345 candles
const custom12345 = analyzeMarket(
  makeHistoricalCandles(12345),
  { maxCandles: 15000 }
);

assert.equal(custom12345.status, "OK");
assert.equal(custom12345.dataInfo.candleCount, 12345);
assert.equal(custom12345.dataInfo.maxCandlesAllowed, 15000);

console.log("PASS: Custom 12345 candle analysis");

// Test 9: Custom limit enforcement
const rejectedCustomLimit = analyzeMarket(
  makeHistoricalCandles(6001),
  { maxCandles: 6000 }
);

assert.equal(rejectedCustomLimit.status, "ERROR");

console.log("PASS: Custom limit enforcement");

// Test 10: Exactly 200 candles with minimum custom limit
const minimumLimit = analyzeMarket(
  makeHistoricalCandles(200),
  { maxCandles: 200 }
);

assert.equal(minimumLimit.status, "OK");
assert.equal(minimumLimit.dataInfo.candleCount, 200);
assert.equal(minimumLimit.dataInfo.maxCandlesAllowed, 200);

console.log("PASS: Minimum custom limit");

// Test 11: Reject limit below minimum
const belowMinimum = analyzeMarket(
  makeHistoricalCandles(250),
  { maxCandles: 199 }
);

assert.equal(belowMinimum.status, "ERROR");

console.log("PASS: Reject limit below 200");

// Test 12: Reject zero limit
const zeroLimit = analyzeMarket(
  makeHistoricalCandles(250),
  { maxCandles: 0 }
);

assert.equal(zeroLimit.status, "ERROR");

console.log("PASS: Reject zero limit");

// Test 13: Reject limit above absolute maximum
const aboveAbsolute = analyzeMarket(
  makeHistoricalCandles(250),
  { maxCandles: 100001 }
);

assert.equal(aboveAbsolute.status, "ERROR");

console.log("PASS: Absolute maximum validation");

// Test 14: Reject decimal limit
const decimalLimit = analyzeMarket(
  makeHistoricalCandles(250),
  { maxCandles: 500.5 }
);

assert.equal(decimalLimit.status, "ERROR");

console.log("PASS: Integer limit validation");

// Test 15: Reject invalid options
const invalidOptions = analyzeMarket(
  makeHistoricalCandles(250),
  null
);

assert.equal(invalidOptions.status, "ERROR");

console.log("PASS: Invalid options validation");

// Test 16: Object input with custom limit
const objectInput = analyzeMarket(
  {
    index: "NIFTY",
    timeframe: "15m",
    candles: makeHistoricalCandles(5500)
  },
  { maxCandles: 6000 }
);

assert.equal(objectInput.status, "OK");
assert.equal(objectInput.dataInfo.candleCount, 5500);

console.log("PASS: Object input with custom limit");

console.log("ALL MARKET DATA TESTS PASSED");
