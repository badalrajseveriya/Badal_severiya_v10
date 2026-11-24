
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

function runTest(name, callback) {
  callback();
  console.log(`PASS: ${name}`);
}

// 1. Valid historical data
runTest("Valid historical data", () => {
  const result = analyzeDataQuality(makeCandles());

  assert.equal(result.status, "OK");
  assert.equal(result.version, "12.1");
  assert.equal(result.dataType, "HISTORICAL_ONLY");
  assert.equal(result.quality, "VALID");
  assert.equal(result.issueCount, 0);
  assert.equal(result.checks.candleCount, 100);
});

// 2. Invalid OHLC
runTest("Invalid OHLC detection", () => {
  const data = makeCandles();
  data[10].high = data[10].low - 1;

  const result = analyzeDataQuality(data);

  assert.equal(result.checks.invalidOHLC, 1);
  assert.equal(result.quality, "ISSUES_FOUND");
});

// 3. Invalid volume
runTest("Negative volume detection", () => {
  const data = makeCandles();
  data[10].volume = -100;

  const result = analyzeDataQuality(data);

  assert.equal(result.checks.invalidVolume, 1);
  assert.equal(result.quality, "ISSUES_FOUND");
});

// 4. Missing timestamp
runTest("Missing timestamp detection", () => {
  const data = makeCandles();
  delete data[10].timestamp;

  const result = analyzeDataQuality(data);

  assert.equal(result.checks.missingTimestamps, 1);
});

// 5. Invalid timestamp
runTest("Invalid timestamp detection", () => {
  const data = makeCandles();
  data[10].timestamp = "invalid-date";

  const result = analyzeDataQuality(data);

  assert.equal(result.checks.invalidTimestamps, 1);
});

// 6. Duplicate timestamp
runTest("Duplicate timestamp detection", () => {
  const data = makeCandles();
  data[10].timestamp = data[9].timestamp;

  const result = analyzeDataQuality(data);

  assert.equal(result.checks.duplicateTimestamps, 1);
});

// 7. Unordered timestamp
runTest("Unordered timestamp detection", () => {
  const data = makeCandles();

  [data[10], data[11]] = [data[11], data[10]];

  const result = analyzeDataQuality(data);

  assert.ok(result.checks.unorderedTimestamps > 0);
});

// 8. Minimum candle validation
runTest("Minimum candle validation", () => {
  const result = analyzeDataQuality(
    makeCandles(20),
    { minCandles: 30 }
  );

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /At least 30 candles/);
});

// 9. Maximum candle validation
runTest("Maximum candle validation", () => {
  const result = analyzeDataQuality(
    makeCandles(100),
    { minCandles: 30, maxCandles: 50 }
  );

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /Maximum 50 candles/);
});

// 10. Invalid configuration
runTest("Invalid configuration", () => {
  const result = analyzeDataQuality(
    makeCandles(),
    { minCandles: 0 }
  );

  assert.equal(result.status, "ERROR");
});

// 11. Null configuration
runTest("Null configuration rejection", () => {
  const result = analyzeDataQuality(
    makeCandles(),
    null
  );

  assert.equal(result.status, "ERROR");
  assert.match(
    result.error,
    /Invalid data quality configuration/
  );
});

// 12. Empty input
runTest("Empty input validation", () => {
  const result = analyzeDataQuality(null);

  assert.equal(result.status, "ERROR");
});

// 13. Missing volume
runTest("Missing volume is reported but not treated as an issue", () => {
  const data = makeCandles();
  delete data[10].volume;

  const result = analyzeDataQuality(data);

  assert.equal(result.checks.missingVolumes, 1);
  assert.equal(result.quality, "VALID");
  assert.equal(result.issueCount, 0);
});

// 14. Zero volume
runTest("Zero volume acceptance", () => {
  const data = makeCandles();
  data[10].volume = 0;

  const result = analyzeDataQuality(data);

  assert.equal(result.checks.invalidVolume, 0);
  assert.equal(result.quality, "VALID");
});

// 15. Duplicate with invalid timestamp
runTest("Duplicate check with invalid timestamp", () => {
  const data = makeCandles();

  data[10].timestamp = "invalid-date";
  data[20].timestamp = data[19].timestamp;

  const result = analyzeDataQuality(data);

  assert.equal(result.checks.invalidTimestamps, 1);
  assert.equal(result.checks.duplicateTimestamps, 1);
});

// 16. Candles object input
runTest("Candles object input", () => {
  const result = analyzeDataQuality({
    candles: makeCandles()
  });

  assert.equal(result.status, "OK");
  assert.equal(result.quality, "VALID");
});

// 17. Data object input
runTest("Data object input", () => {
  const result = analyzeDataQuality({
    data: makeCandles()
  });

  assert.equal(result.status, "OK");
  assert.equal(result.quality, "VALID");
});

// 18. Uppercase OHLC and Volume fields
runTest("Uppercase OHLC and Volume fields", () => {
  const data = makeCandles().map(item => ({
    Date: item.timestamp,
    Open: item.open,
    High: item.high,
    Low: item.low,
    Close: item.close,
    Volume: item.volume
  }));

  const result = analyzeDataQuality(data);

  assert.equal(result.checks.invalidOHLC, 0);
  assert.equal(result.checks.missingVolumes, 0);
  assert.equal(result.checks.invalidVolume, 0);
  assert.equal(result.quality, "VALID");
});

// 19. Unix timestamp seconds
runTest("Unix timestamp seconds", () => {
  const data = makeCandles().map(item => ({
    ...item,
    timestamp: Math.floor(
      Date.parse(item.timestamp) / 1000
    )
  }));

  const result = analyzeDataQuality(data);

  assert.equal(result.checks.invalidTimestamps, 0);
  assert.equal(result.checks.missingTimestamps, 0);
});

// 20. Unix timestamp milliseconds
runTest("Unix timestamp milliseconds", () => {
  const data = makeCandles().map(item => ({
    ...item,
    timestamp: Date.parse(item.timestamp)
  }));

  const result = analyzeDataQuality(data);

  assert.equal(result.checks.invalidTimestamps, 0);
});

// 21. Special trading date
runTest("Special trading date classification", () => {
  const data = makeCandles();

  data[10].timestamp = "2026-11-08T10:00:00.000Z";

  const result = analyzeDataQuality(data);

  assert.ok(
    result.dateReview.specialTradingDateList.includes(
      "2026-11-08"
    )
  );
});

// 22. Weekend review
runTest("Weekend date review", () => {
  const data = makeCandles();

  data[10].timestamp = "2026-11-07T10:00:00.000Z";

  const result = analyzeDataQuality(data);

  assert.ok(result.checks.weekendDates > 0);
  assert.ok(result.checks.unexpectedWeekendDates > 0);
});

// 23. Invalid candle object
runTest("Invalid candle object detection", () => {
  const data = makeCandles();
  data[10] = null;

  const result = analyzeDataQuality(data);

  assert.equal(result.checks.invalidOHLC, 1);
  assert.equal(result.quality, "ISSUES_FOUND");
});

// 24. Invalid high and low relationship
runTest("Invalid high and low relationship", () => {
  const data = makeCandles();

  data[10].low = data[10].open + 10;

  const result = analyzeDataQuality(data);

  assert.equal(result.checks.invalidOHLC, 1);
});

console.log("--------------------------------");
console.log("ALL DATA QUALITY TESTS PASSED");
console.log("Total test groups: 24");
console.log("Historical educational validation only.");
console.log("--------------------------------");
