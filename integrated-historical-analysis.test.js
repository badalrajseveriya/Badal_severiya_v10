
import assert from "node:assert/strict";

import {
  analyzeHistoricalIntegrated
} from "./integrated-historical-analysis.js";

const START = Date.UTC(2026, 0, 1, 3, 45);

function makeCandles(count = 300) {
  return Array.from({ length: count }, (_, i) => {
    const close =
      25000 +
      Math.sin(i / 5) * 100 +
      i * 0.5;

    return {
      timestamp: new Date(
        START + i * 15 * 60 * 1000
      ).toISOString(),

      open: close - 5,
      high: close + 15,
      low: close - 15,
      close,
      volume: 1000 + i * 2
    };
  });
}

// 1. Complete integration test
{
  const result = analyzeHistoricalIntegrated({
    candles: makeCandles(300),
    timeframe: "15m"
  });

  assert.equal(result.status, "OK");
  assert.equal(result.version, "12.0");
  assert.equal(result.dataType, "HISTORICAL_ONLY");
  assert.equal(result.timeframe, "15m");
  assert.equal(result.candleCount, 300);

  console.log("PASS: Complete integration");
}

// 2. All six engines present
{
  const result = analyzeHistoricalIntegrated({
    candles: makeCandles(300)
  });

  assert.ok(result.modules);

  assert.equal(result.modules.dataQuality.status, "OK");
  assert.equal(result.modules.dataQuality.quality, "VALID");

  assert.equal(result.modules.marketData.status, "OK");
  assert.equal(result.modules.marketStructure.status, "OK");
  assert.equal(result.modules.supportResistance.status, "OK");
  assert.equal(result.modules.fibonacci.status, "OK");
  assert.equal(result.modules.candlePatterns.status, "OK");

  console.log("PASS: All six engines connected");
}

// 3. Data quality report validation
{
  const result = analyzeHistoricalIntegrated({
    candles: makeCandles(300)
  });

  assert.equal(result.modules.dataQuality.issueCount, 0);
  assert.equal(result.modules.dataQuality.checks.invalidOHLC, 0);
  assert.equal(result.modules.dataQuality.checks.invalidVolume, 0);
  assert.equal(result.modules.dataQuality.checks.missingTimestamps, 0);

  console.log("PASS: Data quality report validation");
}

// 4. Minimum candle validation
{
  const result = analyzeHistoricalIntegrated({
    candles: makeCandles(100)
  });

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /At least 200/);

  console.log("PASS: Minimum candle validation");
}

// 5. Missing timestamp validation
{
  const candles = makeCandles(300);
  delete candles[10].timestamp;

  const result = analyzeHistoricalIntegrated({
    candles
  });

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /Timestamp is required/);

  console.log("PASS: Missing timestamp validation");
}

// 6. Invalid timestamp validation
{
  const candles = makeCandles(300);
  candles[10].timestamp = "invalid-date";

  const result = analyzeHistoricalIntegrated({
    candles
  });

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /Invalid timestamp/);

  console.log("PASS: Invalid timestamp validation");
}

// 7. Chronological order validation
{
  const candles = makeCandles(300);

  [candles[10], candles[11]] =
    [candles[11], candles[10]];

  const result = analyzeHistoricalIntegrated({
    candles
  });

  assert.equal(result.status, "ERROR");

  console.log("PASS: Chronological validation");
}

// 8. Invalid OHLC validation
{
  const candles = makeCandles(300);
  candles[10].high = candles[10].low - 1;

  const result = analyzeHistoricalIntegrated({
    candles
  });

  assert.equal(result.status, "ERROR");

  console.log("PASS: Invalid OHLC validation");
}

// 9. Duplicate timestamp validation
{
  const candles = makeCandles(300);
  candles[11].timestamp = candles[10].timestamp;

  const result = analyzeHistoricalIntegrated({
    candles
  });

  assert.equal(result.status, "ERROR");

  console.log("PASS: Duplicate timestamp validation");
}

// 10. Invalid volume validation
{
  const candles = makeCandles(300);
  candles[10].volume = -100;

  const result = analyzeHistoricalIntegrated({
    candles
  });

  assert.equal(result.status, "ERROR");

  console.log("PASS: Invalid volume validation");
}

// 11. Empty input validation
{
  const result = analyzeHistoricalIntegrated(null);

  assert.equal(result.status, "ERROR");

  console.log("PASS: Empty input validation");
}

console.log("ALL INTEGRATION TESTS PASSED");
