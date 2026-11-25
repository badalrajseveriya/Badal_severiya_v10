
import assert from "node:assert/strict";

import {
  generateHistoricalReport
} from "./historical-analysis-report.js";

const START = Date.UTC(2026, 0, 1, 3, 45);

function makeCandle(index, timestamp) {
  const close =
    25000 +
    Math.sin(index / 5) * 100 +
    index * 0.5;

  return {
    timestamp: new Date(timestamp).toISOString(),
    open: close - 5,
    high: close + 15,
    low: close - 15,
    close,
    volume: 1000 + index * 2
  };
}

function makeCandles(
  count = 300,
  intervalMs = 15 * 60 * 1000
) {
  return Array.from({ length: count }, (_, i) =>
    makeCandle(i, START + i * intervalMs)
  );
}

function makeDailyCandles(count = 220) {
  const candles = [];
  let timestamp = Date.UTC(2025, 0, 1, 10, 0);

  while (candles.length < count) {
    const day = new Date(timestamp).getUTCDay();

    if (day !== 0 && day !== 6) {
      candles.push(
        makeCandle(candles.length, timestamp)
      );
    }

    timestamp += 24 * 60 * 60 * 1000;
  }

  return candles;
}

function makeReport() {
  return generateHistoricalReport({
    candles: makeCandles(300),
    timeframe: "15m"
  });
}

// 1. Complete report
{
  const result = makeReport();

  assert.equal(result.status, "OK");
  assert.equal(result.version, "12.0");
  assert.equal(result.dataType, "HISTORICAL_ONLY");
  assert.equal(result.reportInfo.timeframe, "15m");
  assert.equal(result.reportInfo.candleCount, 300);

  console.log("PASS: Complete historical report");
}

// 2. All six report sections
{
  const result = makeReport();

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
  const result = makeReport();

  assert.equal(result.sections.dataQuality.status, "OK");
  assert.equal(result.sections.dataQuality.quality, "VALID");
  assert.equal(result.sections.dataQuality.issueCount, 0);

  console.log("PASS: Data quality summary");
}

// 4. Market indicator summary
{
  const result = makeReport();

  assert.ok(
    Object.keys(result.sections.marketIndicators).length > 0
  );

  console.log("PASS: Market indicators summary");
}

// 5. Market structure summary
{
  const result = makeReport();

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
  const result = makeReport();

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
  const result = makeReport();

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
  const result = makeReport();

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

  const result = generateHistoricalReport({ candles });

  assert.equal(result.status, "ERROR");

  console.log("PASS: Missing timestamp validation");
}

// 11. Invalid OHLC validation
{
  const candles = makeCandles(300);
  candles[10].high = candles[10].low - 1;

  const result = generateHistoricalReport({ candles });

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
  const result = makeReport();

  assert.equal(result.validation.status, "OK");
  assert.equal(result.validation.valid, true);
  assert.equal(result.validation.checkedModules, 6);
  assert.deepEqual(result.validation.errors, []);

  console.log("PASS: Report validation metadata");
}

// 14. Report section count
{
  const result = makeReport();

  assert.equal(result.reportInfo.sectionCount, 6);

  console.log("PASS: Report section count");
}

// 15. Report summary metadata
{
  const result = makeReport();

  assert.equal(result.summary.dataQuality, "VALID");
  assert.equal(result.summary.dataQualityIssues, 0);

  assert.ok(result.summary.totalCandlePatterns >= 0);
  assert.ok(result.summary.supportZones >= 0);
  assert.ok(result.summary.resistanceZones >= 0);

  console.log("PASS: Report summary metadata");
}

// 16. Report note validation
{
  const result = makeReport();

  assert.match(
    result.note,
    /Historical educational analysis only/
  );

  assert.match(result.note, /No forecasts/);

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

// 18. Section count matches actual sections
{
  const result = makeReport();

  assert.equal(
    result.reportInfo.sectionCount,
    Object.keys(result.sections).length
  );

  console.log("PASS: Section count consistency");
}

// 19. Support and resistance summary matches arrays
{
  const result = makeReport();

  assert.equal(
    result.summary.supportZones,
    result.sections.supportResistance.supports.length
  );

  assert.equal(
    result.summary.resistanceZones,
    result.sections.supportResistance.resistances.length
  );

  console.log("PASS: Support resistance count consistency");
}

// 20. Candle pattern summary matches pattern array
{
  const result = makeReport();

  assert.equal(
    result.summary.totalCandlePatterns,
    result.sections.candlePatterns.patterns.length
  );

  console.log("PASS: Candle pattern count consistency");
}

// 21. Generated timestamp validation
{
  const result = makeReport();

  assert.ok(result.reportInfo.generatedAt);

  assert.ok(
    Number.isFinite(
      Date.parse(result.reportInfo.generatedAt)
    )
  );

  console.log("PASS: Generated timestamp validation");
}

// 22. Daily historical report
{
  const result = generateHistoricalReport({
    candles: makeDailyCandles(220),
    timeframe: "1d"
  });

  assert.equal(result.status, "OK");
  assert.equal(result.reportInfo.timeframe, "1d");
  assert.equal(result.reportInfo.candleCount, 220);

  console.log("PASS: 1D historical report");
}

// 23. Daily data quality validation
{
  const result = generateHistoricalReport({
    candles: makeDailyCandles(220),
    timeframe: "1d"
  });

  assert.equal(result.status, "OK");
  assert.equal(result.sections.dataQuality.quality, "VALID");
  assert.equal(result.sections.dataQuality.issueCount, 0);

  console.log("PASS: 1D data quality");
}

// 24. Custom limit with 5500 candles
{
  const result = generateHistoricalReport(
    {
      candles: makeCandles(5500),
      timeframe: "15m"
    },
    {
      maxCandles: 6000
    }
  );

  assert.equal(result.status, "OK");
  assert.equal(result.reportInfo.candleCount, 5500);
  assert.equal(result.reportInfo.maxCandlesAllowed, 6000);

  console.log("PASS: Custom 5500 candle report");
}

// 25. Custom limit with 12345 candles
{
  const result = generateHistoricalReport(
    {
      candles: makeCandles(12345),
      timeframe: "15m"
    },
    {
      maxCandles: 15000
    }
  );

  assert.equal(result.status, "OK");
  assert.equal(result.reportInfo.candleCount, 12345);
  assert.equal(result.reportInfo.maxCandlesAllowed, 15000);

  console.log("PASS: Custom 12345 candle report");
}

// 26. Default limit rejects more than 5000 candles
{
  const result = generateHistoricalReport({
    candles: makeCandles(5500),
    timeframe: "15m"
  });

  assert.equal(result.status, "ERROR");

  console.log("PASS: Default 5000 candle limit");
}

// 27. Invalid custom limit below minimum
{
  const result = generateHistoricalReport(
    {
      candles: makeCandles(300),
      timeframe: "15m"
    },
    {
      maxCandles: 199
    }
  );

  assert.equal(result.status, "ERROR");

  console.log("PASS: Custom limit below minimum");
}

// 28. Invalid custom limit above maximum
{
  const result = generateHistoricalReport(
    {
      candles: makeCandles(300),
      timeframe: "15m"
    },
    {
      maxCandles: 100001
    }
  );

  assert.equal(result.status, "ERROR");

  console.log("PASS: Custom limit above maximum");
}

console.log("ALL 28 HISTORICAL REPORT TESTS PASSED");
