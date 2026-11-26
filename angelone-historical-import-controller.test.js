/**
 * BADAL SEVERIYA V12
 * Angel One Historical Import Controller Tests
 */

import assert from "node:assert/strict";

import {
  prepareAngelOneHistoricalImport,
  runAngelOneHistoricalImport
} from "./angelone-historical-import-controller.js";

function makeResponse(rows) {
  return {
    status: true,
    message: "SUCCESS",
    data: rows
  };
}

function row(minute, close, volume = 100) {
  return [
    `2026-11-23T09:${String(minute).padStart(2, "0")}:00+05:30`,
    close - 5,
    close + 10,
    close - 10,
    close,
    volume
  ];
}

// --------------------------------------------------
// TEST 1: Prepare valid Angel One response
// --------------------------------------------------

{
  const result = prepareAngelOneHistoricalImport({
    response: makeResponse([
      row(15, 26000),
      row(30, 26020),
      row(45, 26040)
    ]),
    index: "NIFTY",
    timeframe: "15m",
    batchSize: 2
  });

  assert.equal(result.status, "prepared");
  assert.equal(result.source, "ANGEL_ONE_SMARTAPI");
  assert.equal(result.dataType, "REAL_HISTORICAL");
  assert.equal(result.index, "NIFTY");
  assert.equal(result.timeframe, "15m");
  assert.equal(result.symbolToken, "99926000");

  assert.equal(result.incomingCandleCount, 3);
  assert.equal(result.finalUniqueCandleCount, 3);
  assert.equal(result.batchCount, 2);

  assert.equal(result.batches[0].candleCount, 2);
  assert.equal(result.batches[1].candleCount, 1);

  console.log("PASS: valid API response preparation");
}

// --------------------------------------------------
// TEST 2: Existing duplicate is replaced
// --------------------------------------------------

{
  const existingCandles = [
    {
      timestamp: "2026-11-23T03:45:00.000Z",
      open: 25995,
      high: 26010,
      low: 25990,
      close: 26000,
      volume: null
    }
  ];

  const result = prepareAngelOneHistoricalImport({
    response: makeResponse([
      row(15, 26050),
      row(30, 26060)
    ]),
    index: "NIFTY",
    timeframe: "15m",
    existingCandles,
    batchSize: 10
  });

  const merged = result.batches.flatMap(
    batch => batch.candles
  );

  assert.equal(result.duplicateAgainstExisting, 1);
  assert.equal(result.finalUniqueCandleCount, 2);
  assert.equal(merged.length, 2);

  // Incoming candle replaces the old candle.
  assert.equal(merged[0].close, 26050);

  console.log("PASS: existing duplicate replacement");
}

// --------------------------------------------------
// TEST 3: Batch limit respected
// --------------------------------------------------

{
  const rows = Array.from(
    { length: 7 },
    (_, index) =>
      row(15 + index * 15, 26000 + index * 10)
  );

  const result = prepareAngelOneHistoricalImport({
    response: makeResponse(rows),
    index: "NIFTY",
    timeframe: "15m",
    batchSize: 3
  });

  assert.equal(result.batchCount, 3);

  assert.deepEqual(
    result.batches.map(batch => batch.candleCount),
    [3, 3, 1]
  );

  assert.ok(
    result.batches.every(
      batch => batch.candleCount <= 3
    )
  );

  console.log("PASS: batch size enforcement");
}

// --------------------------------------------------
// TEST 4: NIFTY zero volume remains null
// --------------------------------------------------

{
  const result = prepareAngelOneHistoricalImport({
    response: makeResponse([
      row(15, 26000, 0)
    ]),
    index: "NIFTY",
    timeframe: "15m"
  });

  assert.equal(
    result.batches[0].candles[0].volume,
    null
  );

  console.log("PASS: NIFTY zero volume normalization");
}

// --------------------------------------------------
// TEST 5: Unsupported timeframe rejected
// --------------------------------------------------

{
  assert.throws(
    () =>
      prepareAngelOneHistoricalImport({
        response: makeResponse([
          row(15, 26000)
        ]),
        index: "NIFTY",
        timeframe: "5m"
      }),
    /timeframe must be 15m or 1d/
  );

  console.log("PASS: unsupported timeframe rejection");
}

// --------------------------------------------------
// TEST 6: Failed Angel One response rejected
// --------------------------------------------------

{
  assert.throws(
    () =>
      prepareAngelOneHistoricalImport({
        response: {
          status: false,
          data: []
        },
        index: "NIFTY",
        timeframe: "15m"
      }),
    /not successful/
  );

  console.log("PASS: unsuccessful API response rejection");
}

// --------------------------------------------------
// TEST 7: Existing candles array validation
// --------------------------------------------------

{
  assert.throws(
    () =>
      prepareAngelOneHistoricalImport({
        response: makeResponse([
          row(15, 26000)
        ]),
        index: "NIFTY",
        timeframe: "15m",
        existingCandles: {}
      }),
    /must be an array/
  );

  console.log("PASS: existing data validation");
}

// --------------------------------------------------
// TEST 8: Sequential upload simulation
// --------------------------------------------------

{
  const prepared = prepareAngelOneHistoricalImport({
    response: makeResponse([
      row(15, 26000),
      row(30, 26020),
      row(45, 26040),
      row(60, 26060)
    ]),
    index: "NIFTY",
    timeframe: "15m",
    batchSize: 2
  });

  const sent = [];

  const uploadResult =
    await runAngelOneHistoricalImport(
      prepared,
      async batch => {
        sent.push(batch.batchNumber);
      }
    );

  assert.equal(uploadResult.status, "completed");
  assert.equal(uploadResult.uploadedBatchCount, 2);
  assert.equal(uploadResult.uploadedCandleCount, 4);
  assert.equal(uploadResult.remainingBatchCount, 0);

  assert.deepEqual(sent, [1, 2]);

  console.log("PASS: sequential upload simulation");
}

// --------------------------------------------------
// TEST 9: Upload failure stops further batches
// --------------------------------------------------

{
  const prepared = prepareAngelOneHistoricalImport({
    response: makeResponse([
      row(15, 26000),
      row(30, 26020),
      row(45, 26040),
      row(60, 26060),
      row(75, 26080)
    ]),
    index: "NIFTY",
    timeframe: "15m",
    batchSize: 2
  });

  let attempts = 0;

  const failure =
    await runAngelOneHistoricalImport(
      prepared,
      async batch => {
        attempts++;

        if (batch.batchNumber === 2) {
          throw new Error("Simulated database failure");
        }
      }
    );

  assert.equal(failure.status, "failed");
  assert.equal(failure.uploadedBatchCount, 1);
  assert.equal(failure.uploadedCandleCount, 2);
  assert.equal(failure.failedBatchNumber, 2);
  assert.equal(failure.remainingBatchCount, 1);
  assert.equal(attempts, 2);

  console.log("PASS: upload failure handling");
}

// --------------------------------------------------
// TEST 10: Invalid prepared import rejected
// --------------------------------------------------

{
  await assert.rejects(
    () =>
      runAngelOneHistoricalImport(
        null,
        async () => {}
      ),
    /prepared Angel One/
  );

  console.log("PASS: prepared import validation");
}

// --------------------------------------------------
// TEST 11: Uploader required
// --------------------------------------------------

{
  const prepared = prepareAngelOneHistoricalImport({
    response: makeResponse([
      row(15, 26000)
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
    /uploader function/
  );

  console.log("PASS: uploader validation");
}

console.log("");
console.log(
  "ALL ANGEL ONE HISTORICAL IMPORT CONTROLLER TESTS PASSED"
);