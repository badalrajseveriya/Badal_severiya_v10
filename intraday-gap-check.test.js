
import assert from "node:assert/strict";
import { analyzeIntradayGaps } from "./intraday-gap-check.js";

// ------------------------------------------------------
// TEST HELPERS
// ------------------------------------------------------

function istTimeToUTC(date, hour, minute) {
  return Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    hour - 5,
    minute - 30
  );
}

const date = {
  year: 2026,
  month: 11,
  day: 24
};

function candle(hour, minute, dateValue = date) {
  return {
    timestamp: istTimeToUTC(dateValue, hour, minute),
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: 1000
  };
}

function runTest(name, fn) {
  fn();
  console.log(`PASS: ${name}`);
}

// ------------------------------------------------------
// TEST 1: CONTINUOUS CANDLES
// ------------------------------------------------------

runTest("Continuous 15-minute candles have no gaps", () => {
  const result = analyzeIntradayGaps([
    candle(9, 15),
    candle(9, 30),
    candle(9, 45),
    candle(10, 0)
  ]);

  assert.equal(result.status, "OK");
  assert.equal(result.quality, "VALID");
  assert.equal(result.missingCandleCount, 0);
  assert.equal(result.gapCount, 0);
});

// ------------------------------------------------------
// TEST 2: ONE MISSING CANDLE
// ------------------------------------------------------

runTest("Detects one missing candle", () => {
  const result = analyzeIntradayGaps([
    candle(9, 15),
    candle(9, 30),
    candle(10, 0)
  ]);

  assert.equal(result.missingCandleCount, 1);
  assert.equal(result.gapCount, 1);
  assert.equal(result.gapsTotal, 1);
  assert.equal(result.quality, "ISSUES_FOUND");

  assert.equal(result.gaps[0].from, "09:30");
  assert.equal(result.gaps[0].to, "10:00");
});

// ------------------------------------------------------
// TEST 3: MULTIPLE MISSING CANDLES
// ------------------------------------------------------

runTest("Detects multiple missing candles", () => {
  const result = analyzeIntradayGaps([
    candle(9, 15),
    candle(10, 0)
  ]);

  assert.equal(result.missingCandleCount, 2);
  assert.equal(result.gapCount, 1);
  assert.equal(result.gaps[0].missingCandles, 2);
});

// ------------------------------------------------------
// TEST 4: OVERNIGHT GAP
// ------------------------------------------------------

runTest("Does not count overnight gaps", () => {
  const nextDay = {
    year: 2026,
    month: 11,
    day: 25
  };

  const result = analyzeIntradayGaps([
    candle(15, 15, date),
    candle(9, 15, nextDay)
  ]);

  assert.equal(result.missingCandleCount, 0);
  assert.equal(result.gapCount, 0);
  assert.equal(result.quality, "VALID");
});

// ------------------------------------------------------
// TEST 5: DUPLICATE TIMESTAMPS
// ------------------------------------------------------

runTest("Detects duplicate timestamps", () => {
  const result = analyzeIntradayGaps([
    candle(9, 15),
    candle(9, 30),
    candle(9, 30),
    candle(9, 45)
  ]);

  assert.equal(result.duplicateCount, 1);
  assert.equal(result.quality, "ISSUES_FOUND");
});

// ------------------------------------------------------
// TEST 6: OFF-SESSION CANDLES
// ------------------------------------------------------

runTest("Detects off-session candles", () => {
  const result = analyzeIntradayGaps([
    candle(8, 45),
    candle(9, 15)
  ]);

  assert.equal(result.offSessionCount, 1);
  assert.equal(result.quality, "ISSUES_FOUND");
  assert.equal(result.checks.marketSession, "REVIEW");
});

// ------------------------------------------------------
// TEST 7: INVALID TIMESTAMP
// ------------------------------------------------------

runTest("Detects invalid timestamps", () => {
  const result = analyzeIntradayGaps([
    candle(9, 15),
    { timestamp: "invalid-date" },
    candle(9, 30)
  ]);

  assert.equal(result.invalidTimestampCount, 1);
  assert.equal(result.checks.timestamps, "FAIL");
  assert.equal(result.quality, "ISSUES_FOUND");
});

// ------------------------------------------------------
// TEST 8: CONFIGURABLE 30-MINUTE INTERVAL
// ------------------------------------------------------

runTest("Supports configurable 30-minute interval", () => {
  const result = analyzeIntradayGaps(
    [
      candle(9, 15),
      candle(9, 45),
      candle(10, 15)
    ],
    { intervalMinutes: 30 }
  );

  assert.equal(result.timeframe, "30m");
  assert.equal(result.missingCandleCount, 0);
  assert.equal(result.gapCount, 0);
  assert.equal(result.quality, "VALID");
});

// ------------------------------------------------------
// TEST 9: EMPTY INPUT
// ------------------------------------------------------

runTest("Handles empty candle array", () => {
  const result = analyzeIntradayGaps([]);

  assert.equal(result.status, "OK");
  assert.equal(result.quality, "NO_DATA");
  assert.equal(result.candleCount, 0);
  assert.equal(result.gapCount, 0);
  assert.equal(result.gapsTotal, 0);
});

// ------------------------------------------------------
// TEST 10: NUMERIC TIMESTAMP AS STRING (SECONDS)
// ------------------------------------------------------

runTest("Parses numeric timestamp strings in seconds", () => {
  const ts = candle(9, 15).timestamp;

  const result = analyzeIntradayGaps([
    { timestamp: String(ts / 1000) },
    { timestamp: String((ts + 15 * 60000) / 1000) }
  ]);

  assert.equal(result.validTimestampCount, 2);
  assert.equal(result.gapCount, 0);
  assert.equal(result.quality, "VALID");
});

// ------------------------------------------------------
// TEST 11: NUMERIC TIMESTAMP AS STRING (MILLISECONDS)
// ------------------------------------------------------

runTest("Parses numeric timestamp strings in milliseconds", () => {
  const ts = candle(9, 15).timestamp;

  const result = analyzeIntradayGaps([
    { timestamp: String(ts) },
    { timestamp: String(ts + 15 * 60000) }
  ]);

  assert.equal(result.validTimestampCount, 2);
  assert.equal(result.gapCount, 0);
  assert.equal(result.quality, "VALID");
});

// ------------------------------------------------------
// TEST 12: MORE THAN 100 GAP EVENTS
// ------------------------------------------------------

runTest("Counts all gaps while limiting displayed details", () => {
  const manyCandles = [];

  const startDate = new Date(
    Date.UTC(2026, 0, 1)
  );

  // Create 101 independent trading-date gap events.
  for (let i = 0; i < 101; i++) {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + i);

    const day = {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate()
    };

    manyCandles.push(candle(9, 15, day));
    manyCandles.push(candle(10, 0, day));
  }

  const result = analyzeIntradayGaps(manyCandles);

  assert.equal(result.gapCount, 101);
  assert.equal(result.gapsTotal, 101);

  // Only 100 details should be returned.
  assert.equal(result.gaps.length, 100);

  assert.equal(result.gapsTruncated, true);
  assert.equal(result.missingCandleCount, 202);
});

// ------------------------------------------------------
// TEST 13: IRREGULAR INTERVAL
// ------------------------------------------------------

runTest("Detects irregular interval", () => {
  const result = analyzeIntradayGaps([
    candle(9, 15),
    candle(9, 40)
  ]);

  assert.equal(result.gapCount, 1);
  assert.equal(result.missingCandleCount, 0);
  assert.equal(result.irregularIntervalCount, 1);
  assert.equal(result.quality, "ISSUES_FOUND");
});

// ------------------------------------------------------
// ALL TESTS
// ------------------------------------------------------

console.log("\n========================================");
console.log("ALL 13 INTRADAY GAP CHECK TESTS PASSED");
console.log("========================================");
