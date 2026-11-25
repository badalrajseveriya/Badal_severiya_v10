
import assert from "node:assert/strict";
import { analyzeDataQuality } from "./data-quality.js";

function makeCandles(count, startTime = Date.UTC(2026, 10, 9, 3, 45)) {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: startTime + index * 60 * 1000,
    open: 100 + index,
    high: 105 + index,
    low: 98 + index,
    close: 103 + index,
    volume: 1000 + index
  }));
}

function runTest(name, callback) {
  callback();
  console.log(`PASS: ${name}`);
}

// 1. Valid historical candles
runTest("Valid candle data", () => {
  const result = analyzeDataQuality(makeCandles(200));

  assert.equal(result.status, "OK");
  assert.equal(result.version, "12.2");
  assert.equal(result.quality, "VALID");
  assert.equal(result.checks.candleCount, 200);
});

// 2. Minimum candle requirement
runTest("Minimum candle limit", () => {
  const result = analyzeDataQuality(makeCandles(29));

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /At least 30 candles/);
});

// 3. Default maximum candle limit
runTest("Default maximum 5000 candles", () => {
  const result = analyzeDataQuality(makeCandles(5001));

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /Maximum 5000 candles/);
});

// 4. Custom limit accepts 5500 candles
runTest("Custom limit accepts 5500 candles", () => {
  const result = analyzeDataQuality(
    makeCandles(5500),
    { maxCandles: 6000 }
  );

  assert.equal(result.status, "OK");
  assert.equal(result.checks.candleCount, 5500);
});

// 5. Custom limit accepts 12345 candles
runTest("Custom limit accepts 12345 candles", () => {
  const result = analyzeDataQuality(
    makeCandles(12345),
    { maxCandles: 15000 }
  );

  assert.equal(result.status, "OK");
  assert.equal(result.checks.candleCount, 12345);
});

// 6. Invalid custom maximum
runTest("Rejects invalid custom maximum", () => {
  const result = analyzeDataQuality(
    makeCandles(30),
    { maxCandles: 0 }
  );

  assert.equal(result.status, "ERROR");
});

// 7. Maximum cannot exceed absolute limit
runTest("Rejects limit above absolute maximum", () => {
  const result = analyzeDataQuality(
    makeCandles(30),
    { maxCandles: 10000001 }
  );

  assert.equal(result.status, "ERROR");
});

// 8. Invalid OHLC values
runTest("Detects invalid OHLC", () => {
  const candles = makeCandles(30);
  candles[5].high = 1;

  const result = analyzeDataQuality(candles);

  assert.equal(result.status, "OK");
  assert.equal(result.quality, "ISSUES_FOUND");
  assert.equal(result.checks.invalidOHLC, 1);
});

// 9. Invalid volume
runTest("Detects invalid volume", () => {
  const candles = makeCandles(30);
  candles[4].volume = -100;

  const result = analyzeDataQuality(candles);

  assert.equal(result.checks.invalidVolume, 1);
  assert.equal(result.quality, "ISSUES_FOUND");
});

// 10. Missing volume is reported separately
runTest("Allows missing volume but reports it", () => {
  const candles = makeCandles(30);
  delete candles[2].volume;

  const result = analyzeDataQuality(candles);

  assert.equal(result.status, "OK");
  assert.equal(result.checks.missingVolumes, 1);
  assert.equal(result.quality, "VALID");
});

// 11. Missing timestamp
runTest("Detects missing timestamp", () => {
  const candles = makeCandles(30);
  delete candles[3].timestamp;

  const result = analyzeDataQuality(candles);

  assert.equal(result.checks.missingTimestamps, 1);
  assert.equal(result.quality, "ISSUES_FOUND");
});

// 12. Invalid timestamp
runTest("Detects invalid timestamp", () => {
  const candles = makeCandles(30);
  candles[3].timestamp = "invalid-date";

  const result = analyzeDataQuality(candles);

  assert.equal(result.checks.invalidTimestamps, 1);
});

// 13. Duplicate timestamps
runTest("Detects duplicate timestamps", () => {
  const candles = makeCandles(30);
  candles[10].timestamp = candles[9].timestamp;

  const result = analyzeDataQuality(candles);

  assert.equal(result.checks.duplicateTimestamps, 1);
  assert.equal(result.quality, "ISSUES_FOUND");
});

// 14. Unordered timestamps
runTest("Detects unordered timestamps", () => {
  const candles = makeCandles(30);
  const temp = candles[10].timestamp;
  candles[10].timestamp = candles[11].timestamp;
  candles[11].timestamp = temp;

  const result = analyzeDataQuality(candles);

  assert.ok(result.checks.unorderedTimestamps > 0);
});

// 15. Weekend date review
runTest("Flags weekend dates for review", () => {
  const candles = makeCandles(30);
  candles[0].timestamp = Date.UTC(2026, 10, 7, 3, 45);

  const result = analyzeDataQuality(candles);

  assert.ok(result.checks.weekendDates > 0);
  assert.ok(result.dateReview.unexpectedWeekendList.length > 0);
});

// 16. Special trading date
runTest("Recognizes configured special trading date", () => {
  const candles = makeCandles(30);
  candles[0].timestamp = Date.UTC(2026, 10, 8, 3, 45);

  const result = analyzeDataQuality(candles);

  assert.equal(result.checks.specialTradingDates, 1);
  assert.ok(
    result.dateReview.specialTradingDateList.includes("2026-11-08")
  );
});

// 17. Supports object input with candles
runTest("Supports candles object input", () => {
  const result = analyzeDataQuality({
    candles: makeCandles(30)
  });

  assert.equal(result.status, "OK");
  assert.equal(result.checks.candleCount, 30);
});

// 18. Rejects invalid input
runTest("Rejects invalid input", () => {
  const result = analyzeDataQuality("invalid");

  assert.equal(result.status, "ERROR");
});

// 19. Rejects invalid options object
runTest("Rejects invalid options", () => {
  const result = analyzeDataQuality(makeCandles(30), null);

  assert.equal(result.status, "ERROR");
});

// 20. Confirms historical-only output
runTest("Confirms historical-only data type", () => {
  const result = analyzeDataQuality(makeCandles(30));

  assert.equal(result.dataType, "HISTORICAL_ONLY");
  assert.equal(result.module, "HISTORICAL_DATA_QUALITY");
  assert.match(result.note, /No forecasts or trading recommendations/);
});

console.log("\nALL DATA QUALITY TESTS PASSED");
