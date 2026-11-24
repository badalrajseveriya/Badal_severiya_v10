
import assert from "node:assert/strict";

import {
  calculateHistoricalPeriodStability
} from "./historical-candle-stability.js";

function makeCandles(count = 100) {
  const candles = [];

  const start = Date.UTC(2026, 0, 1);

  for (let i = 0; i < count; i++) {
    const timestamp = new Date(
      start + i * 60 * 1000
    ).toISOString();

    let open;
    let high;
    let low;
    let close;

    if (i % 4 === 0) {
      open = 100;
      close = 110;
      high = 112;
      low = 98;
    } else if (i % 4 === 1) {
      open = 110;
      close = 100;
      high = 112;
      low = 98;
    } else if (i % 4 === 2) {
      open = 100;
      close = 101;
      high = 110;
      low = 90;
    } else {
      open = 100;
      close = 110;
      high = 112;
      low = 98;
    }

    candles.push({
      timestamp,
      open,
      high,
      low,
      close
    });
  }

  return candles;
}

// 1. Basic four-period calculation
{
  const result = calculateHistoricalPeriodStability(
    makeCandles()
  );

  assert.equal(result.status, "OK");
  assert.equal(result.segmentCount, 4);
  assert.equal(result.segments.length, 4);

  console.log("PASS: Four historical periods");
}

// 2. Each period has valid sample size
{
  const result = calculateHistoricalPeriodStability(
    makeCandles(100)
  );

  for (const period of result.segments) {
    assert.equal(period.sampleSize, 25);
  }

  console.log("PASS: Period sample sizes");
}

// 3. Period boundaries cover all candles
{
  const result = calculateHistoricalPeriodStability(
    makeCandles(100)
  );

  assert.equal(result.segments[0].startIndex, 0);
  assert.equal(result.segments[3].endIndex, 99);

  for (let i = 1; i < result.segments.length; i++) {
    assert.equal(
      result.segments[i].startIndex,
      result.segments[i - 1].endIndex + 1
    );
  }

  console.log("PASS: Continuous period boundaries");
}

// 4. Period percentages total 100
{
  const result = calculateHistoricalPeriodStability(
    makeCandles()
  );

  for (const period of result.segments) {
    const total =
      period.percentages.bullish +
      period.percentages.bearish +
      period.percentages.neutral;

    assert.equal(total, 100);
  }

  console.log("PASS: Each period percentage total");
}

// 5. Spread values are non-negative
{
  const result = calculateHistoricalPeriodStability(
    makeCandles()
  );

  for (const value of Object.values(
    result.percentageSpread
  )) {
    assert.ok(value >= 0);
  }

  console.log("PASS: Percentage spread validation");
}

// 6. Insufficient data
{
  const result = calculateHistoricalPeriodStability(
    makeCandles(60)
  );

  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(result.segments.length, 0);

  console.log("PASS: Insufficient data handling");
}

// 7. Invalid input
{
  assert.throws(
    () => calculateHistoricalPeriodStability(null),
    /must be an array/
  );

  console.log("PASS: Invalid input validation");
}

// 8. Invalid configuration
{
  assert.throws(
    () => calculateHistoricalPeriodStability(
      makeCandles(),
      { segments: 1 }
    ),
    /Invalid stability configuration/
  );

  console.log("PASS: Invalid configuration");
}

// 9. Invalid candle timestamp
{
  const candles = makeCandles();
  candles[10].timestamp = candles[9].timestamp;

  assert.throws(
    () => calculateHistoricalPeriodStability(candles),
    /Invalid timestamp/
  );

  console.log("PASS: Timestamp validation");
}

// 10. Invalid OHLC
{
  const candles = makeCandles();
  candles[10].high = 1;

  assert.throws(
    () => calculateHistoricalPeriodStability(candles),
    /Invalid OHLC/
  );

  console.log("PASS: OHLC validation");
}

// 11. Historical-only safety
{
  const result = calculateHistoricalPeriodStability(
    makeCandles()
  );

  assert.equal(result.dataType, "HISTORICAL_ONLY");
  assert.match(result.note, /past candle composition/);
  assert.match(result.note, /does not predict/);

  console.log("PASS: Historical-only safety");
}

console.log(
  "ALL 11 HISTORICAL STABILITY TESTS PASSED"
);
