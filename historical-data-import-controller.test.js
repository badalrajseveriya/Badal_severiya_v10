
/**
 * BADAL SEVERIYA V12
 * Historical Data Import Controller Tests
 *
 * Tests multi-file import, deduplication, merge,
 * batch splitting and invalid input handling.
 */

import assert from "node:assert/strict";

import {
  prepareHistoricalDataImport
} from "./historical-data-import-controller.js";

function makeCSV(rows) {
  const header =
    "timestamp,open,high,low,close,volume";

  return [
    header,
    ...rows.map(row => row.join(","))
  ].join("\n");
}

function candleRow(timestamp, close, volume = 100) {
  const open = close - 1;
  const high = close + 2;
  const low = close - 2;

  return [
    timestamp,
    open,
    high,
    low,
    close,
    volume
  ];
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

// ------------------------------------------------------
// TEST 1: Multi-file merge and duplicate handling
// ------------------------------------------------------

runTest(
  "Multi-file import and duplicate handling",
  () => {
    const file1 = {
      name: "part-1.csv",
      text: makeCSV([
        candleRow("2026-01-01T09:15:00Z", 100),
        candleRow("2026-01-01T09:30:00Z", 110)
      ])
    };

    const file2 = {
      name: "part-2.csv",
      text: makeCSV([
        // Duplicate timestamp; later file should replace.
        candleRow("2026-01-01T09:30:00Z", 115),
        candleRow("2026-01-01T09:45:00Z", 120)
      ])
    };

    const result = prepareHistoricalDataImport({
      files: [file1, file2],
      timeframe: "15m",
      batchSize: 2
    });

    assert.equal(result.status, "prepared");
    assert.equal(result.dataType, "HISTORICAL_ONLY");
    assert.equal(result.timeframe, "15m");

    assert.equal(result.fileCount, 2);
    assert.equal(result.stats.fileCandleCount, 4);
    assert.equal(result.stats.uniqueIncomingCount, 3);
    assert.equal(result.stats.duplicateWithinFiles, 1);

    assert.equal(result.stats.finalUniqueCandleCount, 3);

    assert.equal(result.batchCount, 2);
    assert.equal(result.batches[0].candleCount, 2);
    assert.equal(result.batches[1].candleCount, 1);

    const allCandles = result.batches.flatMap(
      batch => batch.candles
    );

    assert.equal(allCandles.length, 3);

    // Later file replaces duplicate timestamp.
    assert.equal(allCandles[1].close, 115);

    // Chronological ordering.
    assert.ok(
      Date.parse(allCandles[0].timestamp) <
      Date.parse(allCandles[1].timestamp)
    );

    assert.ok(
      Date.parse(allCandles[1].timestamp) <
      Date.parse(allCandles[2].timestamp)
    );
  }
);

// ------------------------------------------------------
// TEST 2: Merge with existing historical dataset
// ------------------------------------------------------

runTest(
  "Merge with existing dataset",
  () => {
    const existingCandles = [
      {
        timestamp: "2026-01-01T09:15:00Z",
        open: 99,
        high: 103,
        low: 98,
        close: 101,
        volume: 500
      },
      {
        timestamp: "2026-01-01T10:00:00Z",
        open: 120,
        high: 123,
        low: 118,
        close: 121,
        volume: 600
      }
    ];

    const incomingFile = {
      name: "incoming.csv",
      text: makeCSV([
        candleRow("2026-01-01T09:15:00Z", 105),
        candleRow("2026-01-01T09:30:00Z", 110),
        candleRow("2026-01-01T09:45:00Z", 115)
      ])
    };

    const result = prepareHistoricalDataImport({
      files: [incomingFile],
      existingCandles,
      timeframe: "15m",
      batchSize: 10
    });

    assert.equal(
      result.stats.existingCandleCount,
      2
    );

    assert.equal(
      result.stats.duplicateAgainstExisting,
      1
    );

    assert.equal(
      result.stats.finalUniqueCandleCount,
      4
    );

    const merged = result.batches.flatMap(
      batch => batch.candles
    );

    // Incoming candle replaces existing duplicate.
    assert.equal(merged[0].close, 105);

    // Existing candle not replaced remains in dataset.
    assert.equal(merged[3].close, 121);

    assert.equal(merged.length, 4);
  }
);

// ------------------------------------------------------
// TEST 3: Invalid file stops entire preparation
// ------------------------------------------------------

runTest(
  "Invalid file stops import preparation",
  () => {
    const validFile = {
      name: "valid.csv",
      text: makeCSV([
        candleRow("2026-01-01T09:15:00Z", 100)
      ])
    };

    const invalidFile = {
      name: "invalid.csv",
      text: "timestamp,open,high,low,close\ninvalid,abc,0,0,0"
    };

    assert.throws(
      () =>
        prepareHistoricalDataImport({
          files: [validFile, invalidFile],
          timeframe: "15m"
        }),
      /File #2|Invalid|missing|timestamp/i
    );
  }
);

// ------------------------------------------------------
// TEST 4: Unsupported timeframe
// ------------------------------------------------------

runTest(
  "Unsupported timeframe rejected",
  () => {
    assert.throws(
      () =>
        prepareHistoricalDataImport({
          files: [
            {
              name: "test.csv",
              text: makeCSV([
                candleRow("2026-01-01T09:15:00Z", 100)
              ])
            }
          ],
          timeframe: "2h"
        }),
      /Unsupported timeframe/
    );
  }
);

// ------------------------------------------------------
// TEST 5: Empty file list rejected
// ------------------------------------------------------

runTest(
  "Empty file list rejected",
  () => {
    assert.throws(
      () =>
        prepareHistoricalDataImport({
          files: []
        }),
      /at least one historical file/i
    );
  }
);

// ------------------------------------------------------
// TEST 6: Batch size validation
// ------------------------------------------------------

runTest(
  "Invalid batch size rejected",
  () => {
    assert.throws(
      () =>
        prepareHistoricalDataImport({
          files: [
            {
              name: "test.csv",
              text: makeCSV([
                candleRow("2026-01-01T09:15:00Z", 100)
              ])
            }
          ],
          batchSize: 5001
        }),
      /Batch size/i
    );
  }
);

// ------------------------------------------------------
// TEST 7: Maximum files protection
// ------------------------------------------------------

runTest(
  "Maximum file count protection",
  () => {
    const files = Array.from(
      { length: 101 },
      (_, index) => ({
        name: `file-${index}.csv`,
        text: makeCSV([
          candleRow(
            `2026-01-01T${String(9 + Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00Z`,
            100
          )
        ])
      })
    );

    assert.throws(
      () =>
        prepareHistoricalDataImport({
          files
        }),
      /Maximum 100 files/i
    );
  }
);

console.log("");
console.log(
  "HISTORICAL DATA IMPORT CONTROLLER TESTS PASSED"
);
