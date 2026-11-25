import assert from "node:assert/strict";
import { analyzeIntradayGaps } from "./intraday-gap-check.js";

function istTimeToUTC(date, hour, minute) {
  return Date.UTC(date.year, date.month - 1, date.day, hour - 5, minute - 30);
}

const date = { year: 2026, month: 11, day: 24 };

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

// 1. Continuous 15-minute candles
runTest("Continuous 15-minute candles have no gap", () => {
  const result = analyzeIntradayGaps([
    candle(9, 15),
    candle(9, 30),
    candle(9, 45)
  ]);

  assert.equal(result.status, "OK");
  assert.equal(result.quality, "VALID");
  assert.equal(result.missingCandleCount, 0);
});

// 2. Detect one missing candle
runTest("Detects one missing candle", () => {
  const result = analyzeIntradayGaps([
    candle(9, 15),
    candle(9, 30),
    candle(10, 0)
  ]);

  assert.equal(result.missingCandleCount, 1);
  assert.equal(result.gapCount, 1);
  assert.equal(result.quality, "ISSUES_FOUND");
  assert.equal(result.gaps[0].from, "09:30");
  assert.equal(result.gaps[0].to, "10:00");
});

// 3. Detect multiple missing candles
runTest("Detects multiple missing candles", () => {
  const result = analyzeIntradayGaps([
    candle(9, 15),
    candle(10, 0)
  ]);

  assert.equal(result.missingCandleCount, 2);
  assert.equal(result.gapCount, 1);
});

// 4. Does not count overnight gaps
runTest("Does not count overnight gaps", () => {
  const nextDay = { year: 2026, month: 11, day: 25 };

  const result = analyzeIntradayGaps([
    candle(15, 15, date),
    candle(9, 15, nextDay)
  ]);

  assert.equal(result.missingCandleCount, 0);
  assert.equal(result.gapCount, 0);
});

// 5. Detect duplicate timestamps
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

// 6. Detect off-session candles
runTest("Detects off-session candles", () => {
  const result = analyzeIntradayGaps([
    candle(8, 45),
    candle(9, 15)
  ]);

  assert.equal(result.offSessionCount, 1);
  assert.equal(result.quality, "ISSUES_FOUND");
});

// 7. Detect invalid timestamps
runTest("Detects invalid timestamps", () => {
  const result = analyzeIntradayGaps([
    candle(9, 15),
    { timestamp: "invalid-date" },
    candle(9, 30)
  ]);

  assert.equal(result.invalidTimestampCount, 1);
  assert.equal(result.checks.timestamps, "FAIL");
});

// 8. Configurable interval
runTest("Supports configurable 30-minute interval", () => {
  const result = analyzeIntradayGaps(
    [
      candle(9, 15),
      candle(9, 45)
    ],
    { intervalMinutes: 30 }
  );

  assert.equal(result.timeframe, "30m");
  assert.equal(result.missingCandleCount, 0);
  assert.equal(result.quality, "VALID");
});

// 9. Empty input
runTest("Handles empty candle array", () => {
  const result = analyzeIntradayGaps([]);

  assert.equal(result.status, "OK");
  assert.equal(result.quality, "NO_DATA");
  assert.equal(result.candleCount, 0);
});

console.log("\nALL INTRADAY GAP CHECK TESTS PASSED");