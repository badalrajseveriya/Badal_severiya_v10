
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

// 2. All five engines present
{
  const result = analyzeHistoricalIntegrated({
    candles: makeCandles(300)
  });

  assert.ok(result.modules);

  assert.equal(result.modules.marketData.status, "OK");
  assert.equal(result.modules.marketStructure.status, "OK");
  assert.equal(result.modules.supportResistance.status, "OK");
  assert.equal(result.modules.fibonacci.status, "OK");
  assert.equal(result.modules.candlePatterns.status, "OK");

  console.log("PASS: All five engines connected");
}

// 3. Minimum candle validation
{
  const result = analyzeHistoricalIntegrated({
    candles: makeCandles(100)
  });

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /At least 200/);

  console.log("PASS: Minimum candle validation");
}

// 4. Missing timestamp validation
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

// 5. Invalid timestamp validation
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

// 6. Chronological order validation
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

// 7. Invalid OHLC validation
{
  const candles = makeCandles(300);
  candles[10].high = candles[10].low - 1;

  const result = analyzeHistoricalIntegrated({
    candles
  });

  assert.equal(result.status, "ERROR");

  console.log("PASS: Invalid OHLC validation");
}

// 8. Empty input validation
{
  const result = analyzeHistoricalIntegrated(null);

  assert.equal(result.status, "ERROR");

  console.log("PASS: Empty input validation");
}

console.log("ALL INTEGRATION TESTS PASSED");
