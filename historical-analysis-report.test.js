
import assert from "node:assert/strict";

import {
  generateHistoricalReport
} from "./historical-analysis-report.js";

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

// 1. Complete report
{
  const result = generateHistoricalReport({
    candles: makeCandles(300),
    timeframe: "15m"
  });

  assert.equal(result.status, "OK");
  assert.equal(result.version, "12.0");
  assert.equal(result.dataType, "HISTORICAL_ONLY");
  assert.equal(result.reportInfo.timeframe, "15m");
  assert.equal(result.reportInfo.candleCount, 300);

  console.log("PASS: Complete historical report");
}

// 2. All six report sections
{
  const result = generateHistoricalReport({
    candles: makeCandles(300)
  });

  assert.ok(result.sections);
  assert.ok(result.sections.dataQuality);
  assert.ok(result.sections.marketIndicators);
  assert.ok(result.sections.marketStructure);
  assert.ok(result.sections.supportResistance);
  assert.ok(result.sections.fibonacci);
  assert.ok(result.sections.candlePatterns);

  console.log("PASS: All six report sections");
}

// 3. Data quality summary
{
  const result = generateHistoricalReport({
    candles: makeCandles(300)
  });

  assert.equal(result.sections.dataQuality.status, "OK");
  assert.equal(result.sections.dataQuality.quality, "VALID");
  assert.equal(result.sections.dataQuality.issueCount, 0);

  console.log("PASS: Data quality summary");
}

// 4. Market indicator summary
{
  const result = generateHistoricalReport({
    candles: makeCandles(300)
  });

  assert.ok(
    Object.keys(result.sections.marketIndicators).length > 0
  );

  console.log("PASS: Market indicators summary");
}

// 5. Market structure summary
{
  const result = generateHistoricalReport({
    candles: makeCandles(300)
  });

  assert.ok(
    result.sections.marketStructure.structureEventCount >= 0
  );

  assert.ok(
    result.sections.marketStructure.pivotHighCount >= 0
  );

  console.log("PASS: Market structure summary");
}

// 6. Support and resistance summary
{
  const result = generateHistoricalReport({
    candles: makeCandles(300)
  });

  assert.ok(
    Array.isArray(result.sections.supportResistance.supports)
  );

  assert.ok(
    Array.isArray(result.sections.supportResistance.resistances)
  );

  console.log("PASS: Support resistance summary");
}

// 7. Fibonacci summary
{
  const result = generateHistoricalReport({
    candles: makeCandles(300)
  });

  assert.ok(
    Array.isArray(result.sections.fibonacci.retracement)
  );

  assert.ok(
    Array.isArray(result.sections.fibonacci.extensions)
  );

  console.log("PASS: Fibonacci summary");
}

// 8. Candle pattern summary
{
  const result = generateHistoricalReport({
    candles: makeCandles(300)
  });

  assert.ok(
    Array.isArray(result.sections.candlePatterns.patterns)
  );

  assert.ok(
    result.sections.candlePatterns.totalPatterns >= 0
  );

  console.log("PASS: Candle pattern summary");
}

// 9. Minimum candle validation
{
  const result = generateHistoricalReport({
    candles: makeCandles(100)
  });

  assert.equal(result.status, "ERROR");

  console.log("PASS: Minimum candle validation");
}

// 10. Missing timestamp validation
{
  const candles = makeCandles(300);
  delete candles[10].timestamp;

  const result = generateHistoricalReport({
    candles
  });

  assert.equal(result.status, "ERROR");

  console.log("PASS: Missing timestamp validation");
}

// 11. Invalid OHLC validation
{
  const candles = makeCandles(300);
  candles[10].high = candles[10].low - 1;

  const result = generateHistoricalReport({
    candles
  });

  assert.equal(result.status, "ERROR");

  console.log("PASS: Invalid OHLC validation");
}

// 12. Empty input validation
{
  const result = generateHistoricalReport(null);

  assert.equal(result.status, "ERROR");

  console.log("PASS: Empty input validation");
}

// 13. Report validation metadata
{
  const result = generateHistoricalReport({
    candles: makeCandles(300)
  });

  assert.equal(result.validation.status, "OK");
  assert.equal(result.validation.valid, true);
  assert.equal(result.validation.checkedModules, 6);
  assert.deepEqual(result.validation.errors, []);

  console.log("PASS: Report validation metadata");
}

// 14. Report section count
{
  const result = generateHistoricalReport({
    candles: makeCandles(300)
  });

  assert.equal(result.reportInfo.sectionCount, 6);

  console.log("PASS: Report section count");
}

// 15. Report summary metadata
{
  const result = generateHistoricalReport({
    candles: makeCandles(300)
  });

  assert.equal(result.summary.dataQuality, "VALID");
  assert.equal(result.summary.dataQualityIssues, 0);

  assert.ok(
    result.summary.totalCandlePatterns >= 0
  );

  assert.ok(
    result.summary.supportZones >= 0
  );

  assert.ok(
    result.summary.resistanceZones >= 0
  );

  console.log("PASS: Report summary metadata");
}

// 16. Report note validation
{
  const result = generateHistoricalReport({
    candles: makeCandles(300)
  });

  assert.match(
    result.note,
    /Historical educational analysis only/
  );

  assert.match(
    result.note,
    /No forecasts/
  );

  console.log("PASS: Educational report note");
}

// 17. Default timeframe handling
{
  const result = generateHistoricalReport({
    candles: makeCandles(300),
    timeframe: ""
  });

  assert.equal(result.status, "OK");
  assert.equal(result.reportInfo.timeframe, "15m");

  console.log("PASS: Default timeframe handling");
}

console.log("ALL HISTORICAL REPORT TESTS PASSED");
