
import assert from "node:assert/strict";

import {
  parseHistoricalDataText
} from "./historical-data-import.js";

function makeRows(count = 220, intervalMinutes = 15) {
  const start = Date.UTC(2026, 0, 1, 3, 45);

  return Array.from({ length: count }, (_, i) => {
    const close = 25000 + i;

    return [
      new Date(
        start + i * intervalMinutes * 60 * 1000
      ).toISOString(),
      close - 2,
      close + 5,
      close - 5,
      close,
      1000 + i
    ];
  });
}

// TEST 1: 15-minute JSON import
{
  const result = parseHistoricalDataText(
    JSON.stringify(makeRows()),
    "angel-one-history.json",
    "15m"
  );

  assert.equal(result.status, "OK");
  assert.equal(result.candleCount, 220);
  assert.equal(result.candles[0].open, 24998);
  assert.equal(result.timeframe, "15m");
}

// TEST 2: CSV import
{
  const rows = makeRows();

  const csv = [
    "timestamp,open,high,low,close,volume",
    ...rows.map(row => row.join(","))
  ].join("\n");

  const result = parseHistoricalDataText(
    csv,
    "history.csv",
    "15m"
  );

  assert.equal(result.status, "OK");
  assert.equal(result.candleCount, 220);
}

// TEST 3: 1D accepts 20 candles
{
  const result = parseHistoricalDataText(
    JSON.stringify(makeRows(20, 1440)),
    "daily-history.json",
    "1d"
  );

  assert.equal(result.status, "OK");
  assert.equal(result.candleCount, 20);
  assert.equal(result.timeframe, "1d");
}

// TEST 4: 1D accepts even one candle
{
  const result = parseHistoricalDataText(
    JSON.stringify(makeRows(1, 1440)),
    "one-day.json",
    "1d"
  );

  assert.equal(result.status, "OK");
  assert.equal(result.candleCount, 1);
}

// TEST 5: 15M still requires 200 candles
{
  const result = parseHistoricalDataText(
    JSON.stringify(makeRows(100)),
    "short-15m.json",
    "15m"
  );

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /At least 200/);
}

// TEST 6: Unordered timestamps rejected
{
  const rows = makeRows();

  [rows[10], rows[11]] = [rows[11], rows[10]];

  const result = parseHistoricalDataText(
    JSON.stringify(rows),
    "unordered.json",
    "15m"
  );

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /chronological/);
}

// TEST 7: Invalid CSV rejected
{
  const result = parseHistoricalDataText(
    "not a valid csv",
    "bad.csv",
    "15m"
  );

  assert.equal(result.status, "ERROR");
}

// TEST 8: Missing volume remains null
{
  const rows = makeRows(1, 1440).map(row => row.slice(0, 5));

  const result = parseHistoricalDataText(
    JSON.stringify(rows),
    "no-volume.json",
    "1d"
  );

  assert.equal(result.status, "OK");
  assert.equal(result.candles[0].volume, null);
}

console.log("ALL HISTORICAL DATA IMPORT TESTS PASSED");
