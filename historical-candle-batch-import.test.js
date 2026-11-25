import {
  MAX_CANDLES_PER_BATCH,
  splitHistoricalCandlesIntoBatches,
  prepareHistoricalCandleBatchImport,
  runHistoricalCandleBatchImport
} from "./historical-candle-batch-import.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function candle(index) {
  const timestamp = new Date(
    Date.UTC(2026, 0, 1, 0, index)
  ).toISOString();

  const price = 100 + index;

  return {
    timestamp,
    open: price,
    high: price + 2,
    low: price - 1,
    close: price + 1,
    volume: 10
  };
}

// 1. Chunk test
const sample = Array.from(
  { length: 11 },
  (_, index) => candle(index)
);

const chunks =
  splitHistoricalCandlesIntoBatches(sample, 5);

assert(chunks.length === 3, "Expected 3 chunks");
assert(chunks[0].length === 5, "First chunk error");
assert(chunks[1].length === 5, "Second chunk error");
assert(chunks[2].length === 1, "Last chunk error");

assert(
  splitHistoricalCandlesIntoBatches([], 5).length === 0,
  "Empty array error"
);

// 2. Batch maximum test
let invalidRejected = false;

try {
  splitHistoricalCandlesIntoBatches(
    sample,
    MAX_CANDLES_PER_BATCH + 1
  );
} catch {
  invalidRejected = true;
}

assert(invalidRejected, "Maximum batch size test failed");

// 3. Merge and duplicate test
const older = [
  candle(0),
  candle(1),
  candle(2)
];

const incoming = [
  candle(2),
  candle(3),
  candle(4),
  candle(5)
];

const prepared =
  prepareHistoricalCandleBatchImport({
    existingCandles: older,
    incomingCandles: incoming,
    batchSize: 2
  });

assert(prepared.status === "prepared", "Prepare status error");
assert(prepared.stats.uniqueCount === 6, "Unique count error");
assert(prepared.stats.duplicateCount === 1, "Duplicate count error");
assert(prepared.batchCount === 3, "Batch count error");

assert(
  prepared.batches.every(
    batch => batch.candleCount <= 2
  ),
  "Batch limit exceeded"
);

// 4. Sequential upload simulation
const sent = [];

const result =
  await runHistoricalCandleBatchImport(
    prepared,
    async batch => {
      sent.push(batch.batchNumber);
    }
  );

assert(result.status === "completed", "Upload simulation failed");
assert(result.uploadedBatchCount === 3, "Upload count error");
assert(result.uploadedCandleCount === 6, "Candle count error");
assert(sent.join(",") === "1,2,3", "Sequential order error");

// 5. Failure simulation
let attempts = 0;

const failure =
  await runHistoricalCandleBatchImport(
    prepared,
    async batch => {
      attempts++;

      if (batch.batchNumber === 2) {
        throw new Error("Simulated upload failure");
      }
    }
  );

assert(failure.status === "failed", "Failure status error");
assert(failure.uploadedBatchCount === 1, "Progress count error");
assert(failure.failedBatchNumber === 2, "Failed batch error");
assert(failure.remainingBatchCount === 1, "Remaining count error");
assert(attempts === 2, "Should stop after failed batch");

console.log(
  "HISTORICAL CANDLE BATCH IMPORT TESTS PASSED"
);