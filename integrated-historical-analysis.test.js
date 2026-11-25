
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

function makeResult() {
  return analyzeHistoricalIntegrated({
    candles: makeCandles(300),
    timeframe: "15m"
  });
}

// 1. Complete integration test
{
  const result = makeResult();

  assert.equal(result.status, "OK");
  assert.equal(result.version, "12.0");
  assert.equal(result.dataType, "HISTORICAL_ONLY");
  assert.equal(result.timeframe, "15m");
  assert.equal(result.candleCount, 300);
  assert.equal(result.maxCandlesAllowed, 5000);

  console.log("PASS: Complete integration");
}

// 2. All six engines present
{
  const result = makeResult();

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
  const result = makeResult();

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

  const result = analyzeHistoricalIntegrated({ candles });

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /Timestamp is required/);

  console.log("PASS: Missing timestamp validation");
}

// 6. Invalid timestamp validation
{
  const candles = makeCandles(300);
  candles[10].timestamp = "invalid-date";

  const result = analyzeHistoricalIntegrated({ candles });

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /Invalid timestamp/);

  console.log("PASS: Invalid timestamp validation");
}

// 7. Chronological order validation
{
  const candles = makeCandles(300);

  [candles[10], candles[11]] =
    [candles[11], candles[10]];

  const result = analyzeHistoricalIntegrated({ candles });

  assert.equal(result.status, "ERROR");

  console.log("PASS: Chronological validation");
}

// 8. Invalid OHLC validation
{
  const candles = makeCandles(300);
  candles[10].high = candles[10].low - 1;

  const result = analyzeHistoricalIntegrated({ candles });

  assert.equal(result.status, "ERROR");

  console.log("PASS: Invalid OHLC validation");
}

// 9. Duplicate timestamp validation
{
  const candles = makeCandles(300);
  candles[11].timestamp = candles[10].timestamp;

  const result = analyzeHistoricalIntegrated({ candles });

  assert.equal(result.status, "ERROR");

  console.log("PASS: Duplicate timestamp validation");
}

// 10. Invalid volume validation
{
  const candles = makeCandles(300);
  candles[10].volume = -100;

  const result = analyzeHistoricalIntegrated({ candles });

  assert.equal(result.status, "ERROR");

  console.log("PASS: Invalid volume validation");
}

// 11. Empty input validation
{
  const result = analyzeHistoricalIntegrated(null);

  assert.equal(result.status, "ERROR");

  console.log("PASS: Empty input validation");
}

// 12. Market data output structure
{
  const result = makeResult();
  const marketData = result.modules.marketData;

  assert.ok(
    marketData.indicators &&
    typeof marketData.indicators === "object"
  );

  assert.ok(
    Object.keys(marketData.indicators).length > 0
  );

  console.log("PASS: Market data output structure");
}

// 13. Market structure output structure
{
  const result = makeResult();
  const structure = result.modules.marketStructure;

  assert.ok(Array.isArray(structure.pivots.highs));
  assert.ok(Array.isArray(structure.pivots.lows));
  assert.ok(Array.isArray(structure.structureEvents));
  assert.ok(Array.isArray(structure.liquidity));
  assert.ok(Array.isArray(structure.fairValueGaps));
  assert.ok(Array.isArray(structure.orderBlocks));

  console.log("PASS: Market structure output structure");
}

// 14. Support and resistance output structure
{
  const result = makeResult();
  const supportResistance = result.modules.supportResistance;

  assert.ok(Array.isArray(supportResistance.supports));
  assert.ok(Array.isArray(supportResistance.resistances));

  console.log("PASS: Support resistance output structure");
}

// 15. Fibonacci output structure
{
  const result = makeResult();
  const fibonacci = result.modules.fibonacci;

  assert.ok(Array.isArray(fibonacci.retracement));
  assert.ok(Array.isArray(fibonacci.extensions));

  console.log("PASS: Fibonacci output structure");
}

// 16. Candle pattern output structure
{
  const result = makeResult();
  const patterns = result.modules.candlePatterns;

  assert.ok(Array.isArray(patterns.patterns));
  assert.ok(patterns.summary);
  assert.ok(
    typeof patterns.summary.totalPatterns === "number"
  );

  console.log("PASS: Candle pattern output structure");
}

// 17. Candle count consistency between modules
{
  const result = makeResult();

  const structureCount =
    result.modules.marketStructure.summary.candleCount;

  const supportCount =
    result.modules.supportResistance.summary.candleCount;

  assert.equal(structureCount, result.candleCount);
  assert.equal(supportCount, result.candleCount);
  assert.equal(structureCount, supportCount);

  console.log("PASS: Module candle count consistency");
}

// 18. Support/resistance pivot index boundaries
{
  const result = makeResult();
  const count = result.candleCount;

  const zones = [
    ...result.modules.supportResistance.supports,
    ...result.modules.supportResistance.resistances
  ];

  for (const zone of zones) {
    assert.ok(Array.isArray(zone.pivotIndices));
    assert.ok(zone.pivotIndices.length > 0);

    for (const index of zone.pivotIndices) {
      assert.ok(Number.isInteger(index));
      assert.ok(index >= 0);
      assert.ok(index < count);
    }

    assert.ok(zone.firstConfirmedAt >= 0);
    assert.ok(zone.lastConfirmedAt < count);
    assert.ok(
      zone.firstConfirmedAt <= zone.lastConfirmedAt
    );
  }

  console.log("PASS: Support resistance pivot index boundaries");
}

// 19. Cross-module pivot consistency
{
  const result = makeResult();

  const structure = result.modules.marketStructure;
  const supportResistance = result.modules.supportResistance;

  const highPivotIndices = new Set(
    structure.pivots.highs.map(pivot => pivot.pivotIndex)
  );

  const lowPivotIndices = new Set(
    structure.pivots.lows.map(pivot => pivot.pivotIndex)
  );

  for (const zone of supportResistance.resistances) {
    for (const index of zone.pivotIndices) {
      assert.ok(
        highPivotIndices.has(index),
        `Resistance pivot ${index} is missing from market structure`
      );
    }
  }

  for (const zone of supportResistance.supports) {
    for (const index of zone.pivotIndices) {
      assert.ok(
        lowPivotIndices.has(index),
        `Support pivot ${index} is missing from market structure`
      );
    }
  }

  console.log("PASS: Cross-module pivot consistency");
}

// 20. Default limit rejects more than 5000 candles
{
  const result = analyzeHistoricalIntegrated({
    candles: makeCandles(5500),
    timeframe: "15m"
  });

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /Maximum 5000 candles/);

  console.log("PASS: Default candle limit enforcement");
}

// 21. Custom limit accepts 5500 candles
{
  const result = analyzeHistoricalIntegrated(
    {
      candles: makeCandles(5500),
      timeframe: "15m"
    },
    {
      maxCandles: 5500
    }
  );

  assert.equal(result.status, "OK");
  assert.equal(result.candleCount, 5500);
  assert.equal(result.maxCandlesAllowed, 5500);
  assert.equal(result.modules.dataQuality.status, "OK");
  assert.equal(result.modules.marketData.status, "OK");

  console.log("PASS: Custom 5500 candle integration");
}

// 22. Custom limit accepts 12345 candles
{
  const result = analyzeHistoricalIntegrated(
    {
      candles: makeCandles(12345),
      timeframe: "15m"
    },
    {
      maxCandles: 12345
    }
  );

  assert.equal(result.status, "OK");
  assert.equal(result.candleCount, 12345);
  assert.equal(result.maxCandlesAllowed, 12345);
  assert.equal(result.modules.dataQuality.status, "OK");
  assert.equal(result.modules.marketData.status, "OK");

  console.log("PASS: Custom 12345 candle integration");
}

// 23. Custom limit rejects candle count above configured limit
{
  const result = analyzeHistoricalIntegrated(
    {
      candles: makeCandles(5500),
      timeframe: "15m"
    },
    {
      maxCandles: 5000
    }
  );

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /Maximum 5000 candles/);

  console.log("PASS: Custom limit enforcement");
}

// 24. Invalid custom limit rejected
{
  const result = analyzeHistoricalIntegrated(
    {
      candles: makeCandles(300),
      timeframe: "15m"
    },
    {
      maxCandles: 123.5
    }
  );

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /maxCandles must be an integer/);

  console.log("PASS: Invalid custom limit validation");
}

// 25. Maximum allowed limit validation
{
  const result = analyzeHistoricalIntegrated(
    {
      candles: makeCandles(300),
      timeframe: "15m"
    },
    {
      maxCandles: 100001
    }
  );

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /maxCandles must be an integer/);

  console.log("PASS: Absolute maximum limit validation");
}

console.log("ALL 25 INTEGRATION TESTS PASSED");
