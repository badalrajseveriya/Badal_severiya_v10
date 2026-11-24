
import assert from "node:assert/strict";

import {
  generateHistoricalReport
} from "./historical-analysis-report.js";

import {
  compareHistoricalTimeframes
} from "./timeframe-comparison.js";

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

function makeIntradayCandles(count = 300) {
  return Array.from({ length: count }, (_, i) =>
    makeCandle(i, START + i * 15 * 60 * 1000)
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

function makeDailyReport() {
  return generateHistoricalReport({
    candles: makeDailyCandles(),
    timeframe: "1d"
  });
}

function makeIntradayReport() {
  return generateHistoricalReport({
    candles: makeIntradayCandles(),
    timeframe: "15m"
  });
}

// TEST 1: Daily report valid
{
  const result = makeDailyReport();
  assert.equal(result.status, "OK");
  assert.equal(result.reportInfo.timeframe, "1d");
  console.log("PASS 1: Daily report validation");
}

// TEST 2: Intraday report valid
{
  const result = makeIntradayReport();
  assert.equal(result.status, "OK");
  assert.equal(result.reportInfo.timeframe, "15m");
  console.log("PASS 2: Intraday report validation");
}

// TEST 3: 15M data waiting state
{
  const result = compareHistoricalTimeframes(
    makeDailyReport(),
    null
  );

  assert.equal(result.status, "WAITING_FOR_DATA");
  assert.deepEqual(result.availableTimeframes, ["1D"]);
  assert.deepEqual(result.waitingTimeframes, ["15M"]);
  assert.equal(result.intraday, null);
  assert.equal(result.comparison, null);

  console.log("PASS 3: 15M waiting state");
}

// TEST 4: Both timeframes available
{
  const result = compareHistoricalTimeframes(
    makeDailyReport(),
    makeIntradayReport()
  );

  assert.equal(result.status, "OK");
  assert.deepEqual(
    result.availableTimeframes,
    ["1D", "15M"]
  );
  assert.deepEqual(result.waitingTimeframes, []);

  console.log("PASS 4: Both timeframes available");
}

// TEST 5: Daily candle count
{
  const result = compareHistoricalTimeframes(
    makeDailyReport(),
    null
  );

  assert.equal(result.daily.candleCount, 220);
  assert.equal(result.daily.timeframe, "1D");

  console.log("PASS 5: Daily snapshot");
}

// TEST 6: Intraday candle count
{
  const result = compareHistoricalTimeframes(
    makeDailyReport(),
    makeIntradayReport()
  );

  assert.equal(result.intraday.candleCount, 300);
  assert.equal(result.intraday.timeframe, "15M");

  console.log("PASS 6: Intraday snapshot");
}

// TEST 7: Comparison fields
{
  const result = compareHistoricalTimeframes(
    makeDailyReport(),
    makeIntradayReport()
  );

  assert.equal(
    typeof result.comparison.trendClassificationMatches,
    "boolean"
  );

  assert.equal(
    typeof result.comparison.dataQualityMatches,
    "boolean"
  );

  assert.equal(result.comparison.candleCounts.daily, 220);
  assert.equal(result.comparison.candleCounts.intraday, 300);

  console.log("PASS 7: Comparison fields");
}

// TEST 8: Invalid daily report rejected
{
  const result = compareHistoricalTimeframes(
    null,
    makeIntradayReport()
  );

  assert.equal(result.status, "ERROR");

  console.log("PASS 8: Invalid daily report");
}

// TEST 9: Wrong intraday timeframe rejected
{
  const wrongReport = generateHistoricalReport({
    candles: makeIntradayCandles(),
    timeframe: "1d"
  });

  const result = compareHistoricalTimeframes(
    makeDailyReport(),
    wrongReport
  );

  assert.equal(result.status, "ERROR");

  console.log("PASS 9: Wrong intraday timeframe");
}

// TEST 10: Historical-only safety
{
  const result = compareHistoricalTimeframes(
    makeDailyReport(),
    makeIntradayReport()
  );

  assert.equal(result.dataType, "HISTORICAL_ONLY");
  assert.match(result.note, /Historical comparison only/);

  assert.equal(
    Object.hasOwn(result, "prediction"),
    false
  );

  assert.equal(
    Object.hasOwn(result, "probability"),
    false
  );

  console.log("PASS 10: Historical-only safety");
}

// TEST 11: Support and resistance arrays reach snapshot
{
  const dailyReport = makeDailyReport();

  const result = compareHistoricalTimeframes(
    dailyReport,
    null
  );

  assert.equal(result.status, "WAITING_FOR_DATA");

  assert.deepEqual(
    result.daily.supportResistance.supports,
    dailyReport.sections.supportResistance.supports
  );

  assert.deepEqual(
    result.daily.supportResistance.resistances,
    dailyReport.sections.supportResistance.resistances
  );

  console.log("PASS 11: Support and resistance details preserved");
}

// TEST 12: Support and resistance counts match details
{
  const result = compareHistoricalTimeframes(
    makeDailyReport(),
    null
  );

  assert.equal(
    result.daily.supportResistance.supportCount,
    result.daily.supportResistance.supports.length
  );

  assert.equal(
    result.daily.supportResistance.resistanceCount,
    result.daily.supportResistance.resistances.length
  );

  console.log("PASS 12: Support and resistance count consistency");
}

console.log("ALL 12 TIMEFRAME COMPARISON TESTS PASSED");
