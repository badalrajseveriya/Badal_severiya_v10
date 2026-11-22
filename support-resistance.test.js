
import assert from "node:assert/strict";
import {
  analyzeSupportResistance
} from "./support-resistance.js";

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

function makeCandles(count = 250) {
  return Array.from({ length: count }, (_, i) => {
    const close =
      25000 + Math.sin(i / 4) * 100 + i * 0.5;

    return candle(
      i,
      close - 5,
      close + 15,
      close - 15,
      close,
      1000 + i * 2
    );
  });
}

function makeZoneCandles() {
  const candles = Array.from(
    { length: 40 },
    (_, i) => candle(i, 100, 105, 95, 100)
  );

  // Two support pivots
  candles[8] = candle(8, 100, 105, 90, 100);
  candles[16] = candle(16, 100, 105, 90.5, 100);

  // Two resistance pivots
  candles[12] = candle(12, 100, 110, 95, 100);
  candles[24] = candle(24, 100, 110.5, 95, 100);

  return candles;
}

// 1. General analysis
{
  const result = analyzeSupportResistance(makeCandles());

  assert.equal(result.status, "OK");
  assert.equal(result.version, "12.0");
  assert.equal(result.dataType, "HISTORICAL_ONLY");
  assert.equal(result.summary.candleCount, 250);
  assert.ok(Array.isArray(result.supports));
  assert.ok(Array.isArray(result.resistances));

  console.log("PASS: General analysis");
}

// 2. Support zone numeric test
{
  const result = analyzeSupportResistance(
    makeZoneCandles(),
    {
      pivotLength: 2,
      tolerancePercent: 1,
      minimumTouches: 2
    }
  );

  assert.equal(result.supports.length, 1);

  const support = result.supports[0];

  assert.equal(support.touches, 2);
  assert.equal(support.type, "SUPPORT");
  assert.equal(support.pivotIndices.length, 2);

  assert.ok(
    Math.abs(support.price - 90.25) < 1e-9
  );

  assert.ok(support.lower < support.price);
  assert.ok(support.upper > support.price);

  console.log("PASS: Support zone numeric test");
}

// 3. Resistance zone numeric test
{
  const result = analyzeSupportResistance(
    makeZoneCandles(),
    {
      pivotLength: 2,
      tolerancePercent: 1,
      minimumTouches: 2
    }
  );

  assert.equal(result.resistances.length, 1);

  const resistance = result.resistances[0];

  assert.equal(resistance.touches, 2);
  assert.equal(resistance.type, "RESISTANCE");

  assert.ok(
    Math.abs(resistance.price - 110.25) < 1e-9
  );

  assert.ok(resistance.lower < resistance.price);
  assert.ok(resistance.upper > resistance.price);

  console.log("PASS: Resistance zone numeric test");
}

// 4. Minimum touches filter
{
  const result = analyzeSupportResistance(
    makeZoneCandles(),
    {
      pivotLength: 2,
      tolerancePercent: 1,
      minimumTouches: 3
    }
  );

  assert.equal(result.supports.length, 0);
  assert.equal(result.resistances.length, 0);

  console.log("PASS: Minimum touches filter");
}

// 5. Maximum zones limit
{
  const result = analyzeSupportResistance(
    makeZoneCandles(),
    {
      pivotLength: 2,
      tolerancePercent: 1,
      minimumTouches: 1,
      maxZones: 1
    }
  );

  assert.ok(
    result.supports.length + result.resistances.length <= 1
  );

  console.log("PASS: Maximum zones limit");
}

// 6. Insufficient history
assert.throws(
  () => analyzeSupportResistance(makeCandles(20)),
  /At least 30 historical candles/
);

console.log("PASS: Minimum history validation");

// 7. Invalid OHLC
{
  const invalid = makeCandles();
  invalid[10].high = invalid[10].low - 1;

  assert.throws(
    () => analyzeSupportResistance(invalid),
    /Invalid OHLCV/
  );
}

console.log("PASS: OHLC validation");

// 8. Unordered timestamps
{
  const unordered = makeCandles();

  [unordered[10], unordered[11]] =
    [unordered[11], unordered[10]];

  assert.throws(
    () => analyzeSupportResistance(unordered),
    /Invalid candle timestamp/
  );
}

console.log("PASS: Chronological validation");

// 9. Invalid configuration
assert.throws(
  () => analyzeSupportResistance(makeCandles(), {
    pivotLength: 0
  }),
  /Invalid support\/resistance configuration/
);

assert.throws(
  () => analyzeSupportResistance(makeCandles(), {
    tolerancePercent: 0
  }),
  /Invalid support\/resistance configuration/
);

assert.throws(
  () => analyzeSupportResistance(makeCandles(), {
    maxZones: 0
  }),
  /Invalid support\/resistance configuration/
);

assert.throws(
  () => analyzeSupportResistance(makeCandles(), {
    minimumTouches: 0
  }),
  /Invalid support\/resistance configuration/
);

assert.throws(
  () => analyzeSupportResistance(makeCandles(), null),
  /Invalid support\/resistance configuration/
);

console.log("PASS: Configuration validation");

console.log("ALL SUPPORT RESISTANCE QUALITY TESTS PASSED");
