
import assert from "node:assert/strict";

import {
  analyzeDataQuality
} from "./data-quality.js";

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

function makeCandles(count = 100) {
  return Array.from({ length: count }, (_, i) => {
    const close = 25000 + i * 2;

    return candle(
      i,
      close - 2,
      close + 5,
      close - 5,
      close,
      1000 + i
    );
  });
}

// 1. Valid historical data
{
  const result = analyzeDataQuality(makeCandles());

  assert.equal(result.status, "OK");
  assert.equal(result.version, "12.0");
  assert.equal(result.dataType, "HISTORICAL_ONLY");
  assert.equal(result.quality, "VALID");
  assert.equal(result.issueCount, 0);
  assert.equal(result.checks.candleCount, 100);

  console.log("PASS: Valid historical data");
}

// 2. Invalid OHLC
{
  const candles = makeCandles();
  candles[10].high = candles[10].low - 1;

  const result = analyzeDataQuality(candles);

  assert.equal(result.status, "OK");
  assert.equal(result.quality, "ISSUES_FOUND");
  assert.equal(result.checks.invalidOHLC, 1);

  console.log("PASS: Invalid OHLC detection");
}

// 3. Invalid volume
{
  const candles = makeCandles();
  candles[10].volume = -100;

  const result = analyzeDataQuality(candles);

  assert.equal(result.checks.invalidVolume, 1);
  assert.equal(result.quality, "ISSUES_FOUND");

  console.log("PASS: Invalid volume detection");
}

// 4. Missing timestamp
{
  const candles = makeCandles();
  delete candles[10].timestamp;

  const result = analyzeDataQuality(candles);

  assert.equal(result.checks.missingTimestamps, 1);

  console.log("PASS: Missing timestamp detection");
}

// 5. Invalid timestamp
{
  const candles = makeCandles();
  candles[10].timestamp = "invalid-date";

  const result = analyzeDataQuality(candles);

  assert.equal(result.checks.invalidTimestamps, 1);

  console.log("PASS: Invalid timestamp detection");
}

// 6. Duplicate timestamp
{
  const candles = makeCandles();
  candles[10].timestamp = candles[9].timestamp;

  const result = analyzeDataQuality(candles);

  assert.equal(result.checks.duplicateTimestamps, 1);

  console.log("PASS: Duplicate timestamp detection");
}

// 7. Unordered timestamp
{
  const candles = makeCandles();

  [candles[10], candles[11]] =
    [candles[11], candles[10]];

  const result = analyzeDataQuality(candles);

  assert.ok(result.checks.unorderedTimestamps > 0);

  console.log("PASS: Unordered timestamp detection");
}

// 8. Minimum candle validation
{
  const result = analyzeDataQuality(
    makeCandles(20),
    { minCandles: 30 }
  );

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /At least 30 candles/);

  console.log("PASS: Minimum candle validation");
}

// 9. Maximum candle validation
{
  const result = analyzeDataQuality(
    makeCandles(100),
    {
      minCandles: 30,
      maxCandles: 50
    }
  );

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /Maximum 50 candles/);

  console.log("PASS: Maximum candle validation");
}

// 10. Invalid configuration
{
  const result = analyzeDataQuality(
    makeCandles(),
    { minCandles: 0 }
  );

  assert.equal(result.status, "ERROR");

  console.log("PASS: Invalid configuration");
}

// 11. Empty input
{
  const result = analyzeDataQuality(null);

  assert.equal(result.status, "ERROR");

  console.log("PASS: Empty input validation");
}

console.log("ALL DATA QUALITY TESTS PASSED");
