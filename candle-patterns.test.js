
import assert from "node:assert/strict";
import { analyzeCandlePatterns } from "./candle-patterns.js";

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

function baseCandles() {
  return Array.from({ length: 5 }, (_, i) =>
    candle(i, 100, 102, 98, 101)
  );
}

function hasPattern(candles, name) {
  return analyzeCandlePatterns(candles)
    .patterns.some(p => p.name === name);
}

// 1. General analysis
const general = Array.from({ length: 100 }, (_, i) => {
  const close = 25000 + i * 2;
  return candle(i, close - 5, close + 15, close - 15, close);
});

const result = analyzeCandlePatterns(general);

assert.equal(result.status, "OK");
assert.equal(result.version, "12.0");
assert.equal(result.dataType, "HISTORICAL_ONLY");
assert.equal(result.summary.candleCount, 100);
assert.ok(Array.isArray(result.patterns));

console.log("PASS: General analysis");

// 2. Doji
{
  const c = baseCandles();
  c[2] = candle(2, 100, 105, 95, 100.2);
  assert.ok(hasPattern(c, "DOJI"));
}

console.log("PASS: Doji detection");

// 3. Hammer
{
  const c = baseCandles();
  c[2] = candle(2, 100, 103, 93, 102);
  assert.ok(hasPattern(c, "HAMMER"));
}

console.log("PASS: Hammer detection");

// 4. Shooting Star
{
  const c = baseCandles();
  c[2] = candle(2, 102, 109, 99, 100);
  assert.ok(hasPattern(c, "SHOOTING_STAR"));
}

console.log("PASS: Shooting Star detection");

// 5. Zero-body candle must not be Hammer
{
  const c = baseCandles();
  c[2] = candle(2, 100, 100, 90, 100);
  assert.ok(!hasPattern(c, "HAMMER"));
}

console.log("PASS: Zero-body Hammer rejection");

// 6. Bullish Engulfing
{
  const c = baseCandles();
  c[1] = candle(1, 105, 106, 99, 100);
  c[2] = candle(2, 99, 108, 98, 107);
  assert.ok(hasPattern(c, "BULLISH_ENGULFING"));
}

console.log("PASS: Bullish Engulfing");

// 7. Bearish Engulfing
{
  const c = baseCandles();
  c[1] = candle(1, 100, 106, 99, 105);
  c[2] = candle(2, 106, 107, 97, 98);
  assert.ok(hasPattern(c, "BEARISH_ENGULFING"));
}

console.log("PASS: Bearish Engulfing");

// 8. Morning Star
{
  const c = baseCandles();
  c[1] = candle(1, 110, 111, 99, 100);
  c[2] = candle(2, 101, 103, 99, 102);
  c[3] = candle(3, 101, 109, 100, 108);
  assert.ok(hasPattern(c, "MORNING_STAR"));
}

console.log("PASS: Morning Star");

// 9. Evening Star
{
  const c = baseCandles();
  c[1] = candle(1, 100, 111, 99, 110);
  c[2] = candle(2, 109, 111, 107, 108);
  c[3] = candle(3, 109, 110, 99, 102);
  assert.ok(hasPattern(c, "EVENING_STAR"));
}

console.log("PASS: Evening Star");

// 10. Three White Soldiers
{
  const c = baseCandles();
  c[1] = candle(1, 100, 106, 99, 105);
  c[2] = candle(2, 103, 110, 102, 109);
  c[3] = candle(3, 107, 115, 106, 114);
  assert.ok(hasPattern(c, "THREE_WHITE_SOLDIERS"));
}

console.log("PASS: Three White Soldiers");

// 11. Three Black Crows
{
  const c = baseCandles();
  c[1] = candle(1, 110, 111, 104, 105);
  c[2] = candle(2, 107, 108, 100, 101);
  c[3] = candle(3, 103, 104, 95, 96);
  assert.ok(hasPattern(c, "THREE_BLACK_CROWS"));
}

console.log("PASS: Three Black Crows");

// 12. Maximum pattern output
{
  const c = baseCandles();
  c[2] = candle(2, 100, 105, 95, 100);

  const limited = analyzeCandlePatterns(c, {
    maxPatterns: 1
  });

  assert.ok(limited.patterns.length <= 1);
}

console.log("PASS: Pattern output limit");

// 13. Insufficient history
assert.throws(
  () => analyzeCandlePatterns(baseCandles().slice(0, 4)),
  /At least 5 historical candles/
);

console.log("PASS: Minimum history");

// 14. Invalid OHLC
{
  const c = baseCandles();
  c[2].high = c[2].low - 1;

  assert.throws(
    () => analyzeCandlePatterns(c),
    /Invalid OHLCV/
  );
}

console.log("PASS: OHLC validation");

// 15. Unordered timestamps
{
  const c = baseCandles();
  [c[2], c[3]] = [c[3], c[2]];

  assert.throws(
    () => analyzeCandlePatterns(c),
    /Invalid candle timestamp/
  );
}

console.log("PASS: Chronological validation");

// 16. Invalid configuration
assert.throws(
  () => analyzeCandlePatterns(baseCandles(), {
    dojiBodyRatio: 2
  }),
  /Invalid candle pattern configuration/
);

assert.throws(
  () => analyzeCandlePatterns(baseCandles(), {
    maxPatterns: 0
  }),
  /Invalid candle pattern configuration/
);

console.log("PASS: Configuration validation");

console.log("ALL CANDLE PATTERN QUALITY TESTS PASSED");
