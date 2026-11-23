
import assert from "node:assert/strict";

import {
  parseHistoricalDataText
} from "./historical-data-import.js";

function makeRows(count = 220) {
  const start = Date.UTC(2026, 0, 1, 3, 45);

  return Array.from({ length: count }, (_, i) => {
    const close = 25000 + i;

    return [
      new Date(start + i * 15 * 60 * 1000).toISOString(),
      close - 2,
      close + 5,
      close - 5,
      close,
      1000 + i
    ];
  });
}

// TEST 1: JSON import
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
    "history.csv"
  );

  assert.equal(result.status, "OK");
  assert.equal(result.candleCount, 220);
}

// TEST 3: Insufficient candles
{
  const result = parseHistoricalDataText(
    JSON.stringify(makeRows(100)),
    "short.json"
  );

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /At least 200/);
}

// TEST 4: Unordered timestamps
{
  const rows = makeRows();

  [rows[10], rows[11]] = [rows[11], rows[10]];

  const result = parseHistoricalDataText(
    JSON.stringify(rows),
    "unordered.json"
  );

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /chronological/);
}

// TEST 5: Invalid CSV
{
  const result = parseHistoricalDataText(
    "not a valid csv",
    "bad.csv"
  );

  assert.equal(result.status, "ERROR");
}

console.log("ALL HISTORICAL DATA IMPORT TESTS PASSED");
