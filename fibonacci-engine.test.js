
import assert from "node:assert/strict";
import { analyzeFibonacci } from "./fibonacci-engine.js";

const START = Date.UTC(2026, 0, 1, 3, 45);

function candle(i, open, high, low, close, volume = 1000) {
  return {
    timestamp: new Date(
      START + i * 15 * 60 * 1000
    ).toISOString(),
    open,
    high,
    low,
    close,
    volume
  };
}

function makeBullishCandles() {
  const candles = Array.from(
    { length: 30 },
    (_, i) => candle(i, 102, 110, 95, 103)
  );

  candles[8] = candle(8, 100, 105, 90, 100);
  candles[14] = candle(14, 115, 130, 110, 120);

  return candles;
}

function makeBearishCandles() {
  const candles = Array.from(
    { length: 30 },
    (_, i) => candle(i, 115, 125, 105, 120)
  );

  candles[8] = candle(8, 115, 130, 110, 120);
  candles[14] = candle(14, 110, 115, 100, 105);

  return candles;
}

function closeTo(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${message}: expected ${expected}, received ${actual}`
  );
}

// 1. General analysis
{
  const candles = makeBullishCandles();
  const result = analyzeFibonacci(candles, {
    pivotLength: 2
  });

  assert.equal(result.status, "OK");
  assert.equal(result.version, "12.0");
  assert.equal(result.dataType, "HISTORICAL_ONLY");
  assert.equal(result.retracement.length, 7);
  assert.equal(result.extensions.length, 5);

  console.log("PASS: General analysis");
}

// 2. Bullish swing numeric tests
{
  const result = analyzeFibonacci(
    makeBullishCandles(),
    { pivotLength: 2 }
  );

  assert.equal(result.swing.direction, "BULLISH");
  assert.equal(result.swing.startPrice, 90);
  assert.equal(result.swing.endPrice, 130);

  closeTo(result.retracement[0].price, 130, "Bullish retracement 0");
  closeTo(result.retracement[1].price, 120.56, "Bullish retracement 0.236");
  closeTo(result.retracement[4].price, 105.28, "Bullish retracement 0.618");
  closeTo(result.retracement[6].price, 90, "Bullish retracement 1");

  closeTo(result.extensions[0].price, 140.88, "Bullish extension 1.272");
  closeTo(result.extensions[2].price, 154.72, "Bullish extension 1.618");

  console.log("PASS: Bullish Fibonacci numeric levels");
}

// 3. Bearish swing numeric tests
{
  const result = analyzeFibonacci(
    makeBearishCandles(),
    { pivotLength: 2 }
  );

  assert.equal(result.swing.direction, "BEARISH");
  assert.equal(result.swing.startPrice, 130);
  assert.equal(result.swing.endPrice, 100);

  closeTo(result.retracement[0].price, 100, "Bearish retracement 0");
  closeTo(result.retracement[1].price, 107.08, "Bearish retracement 0.236");
  closeTo(result.retracement[4].price, 118.54, "Bearish retracement 0.618");
  closeTo(result.retracement[6].price, 130, "Bearish retracement 1");

  closeTo(result.extensions[0].price, 91.84, "Bearish extension 1.272");
  closeTo(result.extensions[2].price, 81.46, "Bearish extension 1.618");

  console.log("PASS: Bearish Fibonacci numeric levels");
}

// 4. Minimum history validation
assert.throws(
  () => analyzeFibonacci(makeBullishCandles().slice(0, 20)),
  /At least 30 historical candles/
);

console.log("PASS: Minimum history validation");

// 5. Invalid OHLC
{
  const invalid = makeBullishCandles();
  invalid[10].high = invalid[10].low - 1;

  assert.throws(
    () => analyzeFibonacci(invalid, { pivotLength: 2 }),
    /Invalid OHLCV/
  );
}

console.log("PASS: OHLC validation");

// 6. Unordered timestamps
{
  const unordered = makeBullishCandles();

  [unordered[10], unordered[11]] =
    [unordered[11], unordered[10]];

  assert.throws(
    () => analyzeFibonacci(unordered, { pivotLength: 2 }),
    /Invalid candle timestamp/
  );
}

console.log("PASS: Chronological validation");

// 7. Invalid configuration
assert.throws(
  () => analyzeFibonacci(makeBullishCandles(), {
    pivotLength: 0
  }),
  /Invalid Fibonacci configuration/
);

assert.throws(
  () => analyzeFibonacci(makeBullishCandles(), {
    maxLevels: 0
  }),
  /Invalid Fibonacci configuration/
);

assert.throws(
  () => analyzeFibonacci(makeBullishCandles(), null),
  /Invalid Fibonacci configuration/
);

console.log("PASS: Configuration validation");

// 8. Output limit
{
  const result = analyzeFibonacci(
    makeBullishCandles(),
    {
      pivotLength: 2,
      maxLevels: 3
    }
  );

  assert.equal(result.retracement.length, 3);
  assert.equal(result.extensions.length, 3);

  console.log("PASS: Output limit");
}

console.log("ALL FIBONACCI QUALITY TESTS PASSED");
