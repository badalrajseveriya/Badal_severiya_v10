
// ======================================================
// BADAL SEVERIYA V12
// HISTORICAL CANDLE COMPOSITION TESTS
// Retrospective description only
// No forecasts, probabilities or trading signals
// ======================================================

import assert from "node:assert/strict";

import {
  calculateHistoricalCandleComposition
} from "./historical-candle-composition.js";

const START = Date.UTC(2026, 0, 1, 3, 45);

function makeCandles() {
  const candles = [];

  for (let i = 0; i < 20; i++) {
    const timestamp = new Date(
      START + i * 60 * 1000
    ).toISOString();

    let candle;

    if (i < 10) {
      candle = {
        open: 100,
        high: 112,
        low: 98,
        close: 110
      };
    } else if (i < 16) {
      candle = {
        open: 110,
        high: 112,
        low: 98,
        close: 100
      };
    } else {
      candle = {
        open: 100,
        high: 110,
        low: 90,
        close: 101
      };
    }

    candles.push({
      timestamp,
      ...candle
    });
  }

  return candles;
}

function makeCandle(timestamp, type) {
  const common = {
    timestamp: new Date(timestamp).toISOString()
  };

  if (type === "bullish") {
    return {
      ...common,
      open: 100,
      high: 110,
      low: 98,
      close: 108
    };
  }

  if (type === "bearish") {
    return {
      ...common,
      open: 108,
      high: 110,
      low: 98,
      close: 100
    };
  }

  if (type === "neutral") {
    return {
      ...common,
      open: 100,
      high: 110,
      low: 90,
      close: 100.5
    };
  }

  throw new Error(`Unknown candle type: ${type}`);
}

function makeCompositionCandles(types) {
  return types.map((type, index) =>
    makeCandle(
      START + index * 60 * 1000,
      type
    )
  );
}

function assertPercentageTotal(percentages) {
  const total =
    percentages.bullish +
    percentages.bearish +
    percentages.neutral;

  assert.equal(
    total,
    100,
    `Expected percentage total 100, received ${total}`
  );
}

// 1. Basic calculation
{
  const result =
    calculateHistoricalCandleComposition(
      makeCandles(),
      { timeframe: "1d" }
    );

  assert.equal(result.status, "OK");
  assert.equal(result.dataType, "HISTORICAL_ONLY");
  assert.equal(result.timeframe, "1d");
  assert.equal(result.sampleSize, 20);

  console.log("PASS: Basic historical calculation");
}

// 2. Candle counts
{
  const result =
    calculateHistoricalCandleComposition(
      makeCandles()
    );

  assert.equal(result.counts.bullish, 10);
  assert.equal(result.counts.bearish, 6);
  assert.equal(result.counts.neutral, 4);

  console.log("PASS: Bullish bearish neutral counts");
}

// 3. Percentages
{
  const result =
    calculateHistoricalCandleComposition(
      makeCandles()
    );

  assert.equal(result.percentages.bullish, 50);
  assert.equal(result.percentages.bearish, 30);
  assert.equal(result.percentages.neutral, 20);

  console.log("PASS: Historical percentages");
}

// 4. Percentage total
{
  const result =
    calculateHistoricalCandleComposition(
      makeCandles()
    );

  assertPercentageTotal(result.percentages);

  console.log("PASS: Percentage total is 100");
}

// 5. Minimum candle validation
{
  assert.throws(
    () =>
      calculateHistoricalCandleComposition(
        makeCandles().slice(0, 19)
      ),
    /At least 20/
  );

  console.log("PASS: Minimum candle validation");
}

// 6. Empty input validation
{
  assert.throws(
    () =>
      calculateHistoricalCandleComposition([]),
    /At least 20/
  );

  console.log("PASS: Empty input validation");
}

// 7. Invalid timestamp
{
  const candles = makeCandles();
  delete candles[5].timestamp;

  assert.throws(
    () =>
      calculateHistoricalCandleComposition(candles),
    /Invalid timestamp/
  );

  console.log("PASS: Invalid timestamp validation");
}

// 8. Duplicate timestamp
{
  const candles = makeCandles();
  candles[5].timestamp = candles[4].timestamp;

  assert.throws(
    () =>
      calculateHistoricalCandleComposition(candles),
    /Invalid timestamp/
  );

  console.log("PASS: Duplicate timestamp validation");
}

// 9. Invalid OHLC
{
  const candles = makeCandles();
  candles[5].high = candles[5].low - 1;

  assert.throws(
    () =>
      calculateHistoricalCandleComposition(candles),
    /Invalid OHLC/
  );

  console.log("PASS: Invalid OHLC validation");
}

// 10. Invalid configuration
{
  assert.throws(
    () =>
      calculateHistoricalCandleComposition(
        makeCandles(),
        { dojiBodyRatio: 1 }
      ),
    /Invalid composition configuration/
  );

  console.log("PASS: Configuration validation");
}

// 11. Historical-only note
{
  const result =
    calculateHistoricalCandleComposition(
      makeCandles()
    );

  assert.match(
    result.note,
    /past candles only/
  );

  assert.match(
    result.note,
    /not future probabilities/
  );

  console.log("PASS: Historical-only safety note");
}

// 12. Equal category counts: exact 100.0 total
// 1 bullish + 1 bearish + 1 neutral = 3 candles.
// Largest remainder must allocate the extra 0.1
// deterministically to bullish (stable tie-break).
{
  const candles = makeCompositionCandles([
    "bullish",
    "bearish",
    "neutral"
  ]);

  const result =
    calculateHistoricalCandleComposition(
      candles,
      { minCandles: 1 }
    );

  assert.equal(result.counts.bullish, 1);
  assert.equal(result.counts.bearish, 1);
  assert.equal(result.counts.neutral, 1);

  assert.equal(result.percentages.bullish, 33.4);
  assert.equal(result.percentages.bearish, 33.3);
  assert.equal(result.percentages.neutral, 33.3);

  assertPercentageTotal(result.percentages);

  console.log(
    "PASS: Equal-count rounding and stable tie-break"
  );
}

// 13. Largest-remainder allocation
// Counts: bullish=2, bearish=2, neutral=3.
// Expected allocation: 28.6 + 28.5 + 42.9 = 100.0.
// Neutral has the largest remainder; bullish wins
// the tie with bearish due to stable key ordering.
{
  const candles = makeCompositionCandles([
    "bullish",
    "bullish",
    "bearish",
    "bearish",
    "neutral",
    "neutral",
    "neutral"
  ]);

  const result =
    calculateHistoricalCandleComposition(
      candles,
      { minCandles: 1 }
    );

  assert.equal(result.counts.bullish, 2);
  assert.equal(result.counts.bearish, 2);
  assert.equal(result.counts.neutral, 3);

  assert.equal(result.percentages.bullish, 28.6);
  assert.equal(result.percentages.bearish, 28.5);
  assert.equal(result.percentages.neutral, 42.9);

  assertPercentageTotal(result.percentages);

  console.log(
    "PASS: Largest-remainder allocation and tie-break"
  );
}

// 14. Single-category composition
// Every candle is bullish; absent categories must
// remain zero without disturbing the total.
{
  const candles = makeCompositionCandles(
    Array(20).fill("bullish")
  );

  const result =
    calculateHistoricalCandleComposition(
      candles
    );

  assert.equal(result.counts.bullish, 20);
  assert.equal(result.counts.bearish, 0);
  assert.equal(result.counts.neutral, 0);

  assert.equal(result.percentages.bullish, 100);
  assert.equal(result.percentages.bearish, 0);
  assert.equal(result.percentages.neutral, 0);

  assertPercentageTotal(result.percentages);

  console.log(
    "PASS: Single-category 100/0/0 composition"
  );
}

// 15. Non-array input validation
{
  assert.throws(
    () =>
      calculateHistoricalCandleComposition(
        null
      ),
    /Historical candles must be an array/
  );

  console.log(
    "PASS: Non-array input validation"
  );
}

console.log(
  "ALL 15 HISTORICAL COMPOSITION TESTS PASSED"
);
