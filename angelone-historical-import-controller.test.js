
/**
 * BADAL SEVERIYA V12
 * Angel One Historical Import Controller Tests
 *
 * Tests conversion, merging, deduplication,
 * validation, batch splitting and sequential upload.
 *
 * Historical data only — no trading/orders.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  prepareAngelOneHistoricalImport,
  runAngelOneHistoricalImport
} from "./angelone-historical-import-controller.js";

// ------------------------------------------------------
// Test helpers
// ------------------------------------------------------

function row(minuteOffset, close, volume = 100) {
  const date = new Date(
    Date.UTC(2026, 10, 23, 3, 30 + minuteOffset)
  );

  // UTC 03:30 = India 09:00
  const timestamp = date.toISOString();

  return [
    timestamp,
    close - 5,
    close + 10,
    close - 10,
    close,
    volume
  ];
}

function successfulResponse(rows) {
  return {
    status: true,
    message: "SUCCESS",
    errorcode: "",
    data: rows
  };
}

function candle(timestamp, close, volume = 100) {
  return {
    timestamp,
    open: close - 5,
    high: close + 10,
    low: close - 10,
    close,
    volume
  };
}

// ------------------------------------------------------
// 1. Prepare valid Angel One historical data
// ------------------------------------------------------

test(
  "prepares valid Angel One candles and creates batches",
  () => {
    const response = successfulResponse([
      row(0, 25000),
      row(15, 25010),
      row(30, 25020)
    ]);

    const result =
      prepareAngelOneHistoricalImport({
        response,
        index: "NIFTY",
        timeframe: "15m",
        batchSize: 2
      });

    assert.equal(result.status, "prepared");
    assert.equal(result.dataType, "REAL_HISTORICAL");
    assert.equal(result.source, "ANGEL_ONE_SMARTAPI");
    assert.equal(result.index, "NIFTY");
    assert.equal(result.timeframe, "15m");
    assert.equal(result.exchange, "NSE");
    assert.equal(result.symbolToken, "99926000");

    assert.equal(result.incomingCandleCount, 3);
    assert.equal(result.existingCandleCount, 0);
    assert.equal(result.finalUniqueCandleCount, 3);

    assert.equal(result.batchSize, 2);
    assert.equal(result.batchCount, 2);

    assert.equal(result.batches[0].candleCount, 2);
    assert.equal(result.batches[1].candleCount, 1);

    assert.equal(
      result.note,
      "Prepared only. Database upload is not performed."
    );
  }
);

// ------------------------------------------------------
// 2. Existing timestamp duplicate is replaced
// ------------------------------------------------------

test(
  "incoming candle replaces existing duplicate timestamp",
  () => {
    const timestamp = row(15, 25010)[0];

    const existingCandles = [
      candle(timestamp, 24900)
    ];

    const response = successfulResponse([
      row(15, 25010),
      row(30, 25020)
    ]);

    const result =
      prepareAngelOneHistoricalImport({
        response,
        index: "NIFTY",
        timeframe: "15m",
        existingCandles,
        batchSize: 5000
      });

    assert.equal(result.incomingCandleCount, 2);
    assert.equal(result.existingCandleCount, 1);
    assert.equal(result.duplicateAgainstExisting, 1);
    assert.equal(result.finalUniqueCandleCount, 2);

    const mergedCandles = result.batches[0].candles;

    const duplicate = mergedCandles.find(
      item => item.timestamp === timestamp
    );

    assert.ok(duplicate);
    assert.equal(duplicate.close, 25010);
  }
);

// ------------------------------------------------------
// 3. Batch splitting
// ------------------------------------------------------

test(
  "splits candles into correct batch sizes",
  () => {
    const rows = [];

    for (let i = 0; i < 7; i++) {
      rows.push(row(i * 15, 25000 + i));
    }

    const result =
      prepareAngelOneHistoricalImport({
        response: successfulResponse(rows),
        index: "NIFTY",
        timeframe: "15m",
        batchSize: 3
      });

    assert.equal(result.batchCount, 3);

    assert.deepEqual(
      result.batches.map(batch => batch.candleCount),
      [3, 3, 1]
    );

    assert.deepEqual(
      result.batches.map(batch => batch.batchNumber),
      [1, 2, 3]
    );
  }
);

// ------------------------------------------------------
// 4. NIFTY zero volume becomes null
// ------------------------------------------------------

test(
  "converts NIFTY zero volume to null",
  () => {
    const result =
      prepareAngelOneHistoricalImport({
        response: successfulResponse([
          row(0, 25000, 0)
        ]),
        index: "NIFTY",
        timeframe: "15m"
      });

    assert.equal(
      result.batches[0].candles[0].volume,
      null
    );
  }
);

// ------------------------------------------------------
// 5. Unsupported timeframe
// ------------------------------------------------------

test(
  "rejects unsupported timeframe",
  () => {
    assert.throws(
      () =>
        prepareAngelOneHistoricalImport({
          response: successfulResponse([
            row(0, 25000)
          ]),
          index: "NIFTY",
          timeframe: "1h"
        }),
      /timeframe must be 15m or 1d/
    );
  }
);

// ------------------------------------------------------
// 6. Failed Angel One response
// ------------------------------------------------------

test(
  "rejects unsuccessful Angel One response",
  () => {
    assert.throws(
      () =>
        prepareAngelOneHistoricalImport({
          response: {
            status: false,
            message: "FAILED",
            data: null
          },
          index: "NIFTY",
          timeframe: "15m"
        }),
      /not successful/
    );
  }
);

// ------------------------------------------------------
// 7. Existing candles must be an array
// ------------------------------------------------------

test(
  "rejects non-array existing candles",
  () => {
    assert.throws(
      () =>
        prepareAngelOneHistoricalImport({
          response: successfulResponse([
            row(0, 25000)
          ]),
          index: "NIFTY",
          timeframe: "15m",
          existingCandles: {}
        }),
      /Existing historical candles must be an array/
    );
  }
);

// ------------------------------------------------------
// 8. Sequential upload success
// ------------------------------------------------------

test(
  "uploads prepared batches sequentially",
  async () => {
    const response = successfulResponse([
      row(0, 25000),
      row(15, 25010),
      row(30, 25020)
    ]);

    const prepared =
      prepareAngelOneHistoricalImport({
        response,
        index: "NIFTY",
        timeframe: "15m",
        batchSize: 2
      });

    const uploaded = [];

    const result =
      await runAngelOneHistoricalImport(
        prepared,
        async batch => {
          uploaded.push(batch.batchNumber);
        }
      );

    assert.deepEqual(uploaded, [1, 2]);

    assert.equal(result.status, "completed");
    assert.equal(result.uploadedBatchCount, 2);
    assert.equal(result.uploadedCandleCount, 3);
    assert.equal(result.failedBatchNumber, null);
    assert.equal(result.remainingBatchCount, 0);
  }
);

// ------------------------------------------------------
// 9. Upload failure stops remaining batches
// ------------------------------------------------------

test(
  "stops upload after failed batch",
  async () => {
    const response = successfulResponse([
      row(0, 25000),
      row(15, 25010),
      row(30, 25020),
      row(45, 25030),
      row(60, 25040)
    ]);

    const prepared =
      prepareAngelOneHistoricalImport({
        response,
        index: "NIFTY",
        timeframe: "15m",
        batchSize: 2
      });

    const attempted = [];

    const result =
      await runAngelOneHistoricalImport(
        prepared,
        async batch => {
          attempted.push(batch.batchNumber);

          if (batch.batchNumber === 2) {
            throw new Error("Test upload failure");
          }
        }
      );

    assert.deepEqual(attempted, [1, 2]);

    assert.equal(result.status, "failed");
    assert.equal(result.uploadedBatchCount, 1);
    assert.equal(result.uploadedCandleCount, 2);
    assert.equal(result.failedBatchNumber, 2);
    assert.equal(result.remainingBatchCount, 1);
    assert.equal(result.error, "Test upload failure");
  }
);

// ------------------------------------------------------
// 10. Invalid prepared import
// ------------------------------------------------------

test(
  "rejects invalid prepared import",
  async () => {
    await assert.rejects(
      () =>
        runAngelOneHistoricalImport(
          null,
          async () => {}
        ),
      /prepared Angel One historical import is required/i
    );
  }
);

// ------------------------------------------------------
// 11. Missing uploader
// ------------------------------------------------------

test(
  "rejects missing uploader function",
  async () => {
    const prepared =
      prepareAngelOneHistoricalImport({
        response: successfulResponse([
          row(0, 25000)
        ]),
        index: "NIFTY",
        timeframe: "15m"
      });

    await assert.rejects(
      () =>
        runAngelOneHistoricalImport(
          prepared,
          null
        ),
      /database uploader function is required/i
    );
  }
);
