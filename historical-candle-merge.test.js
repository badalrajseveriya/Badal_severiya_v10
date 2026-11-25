
import {
  mergeHistoricalCandles,
  mergeCandleDatasets
} from "./historical-candle-merge.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const fileA = [
  {
    timestamp: "2026-04-01T09:15:00.000Z",
    open: 100, high: 105, low: 99, close: 104, volume: 10
  },
  {
    timestamp: "2026-04-01T09:30:00.000Z",
    open: 104, high: 108, low: 103, close: 107, volume: 20
  }
];

const fileB = [
  {
    timestamp: "2026-04-01T09:30:00.000Z",
    open: 104, high: 109, low: 103, close: 108, volume: 25
  },
  {
    timestamp: "2026-04-01T09:45:00.000Z",
    open: 108, high: 110, low: 107, close: 109, volume: 30
  }
];

const merged = mergeHistoricalCandles(fileA, fileB);

assert(merged.length === 3, "Expected 3 unique candles.");
assert(
  merged[1].close === 108,
  "Incoming duplicate should replace existing candle."
);
assert(
  merged[1].volume === 25,
  "Incoming volume should replace duplicate volume."
);
assert(
  merged[0].timestamp < merged[1].timestamp &&
  merged[1].timestamp < merged[2].timestamp,
  "Candles must be chronological."
);

const combined = mergeCandleDatasets(fileA, fileB);

assert(combined.length === 3, "Multi-dataset merge failed.");

let invalidRejected = false;

try {
  mergeHistoricalCandles([], [
    {
      timestamp: "not-a-date",
      open: 10, high: 11, low: 9, close: 10, volume: 1
    }
  ]);
} catch {
  invalidRejected = true;
}

assert(invalidRejected, "Invalid timestamp must be rejected.");

console.log("CANDLE MERGE TESTS PASSED");
