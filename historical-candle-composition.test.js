
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

  const total =
    result.percentages.bullish +
    result.percentages.bearish +
    result.percentages.neutral;

  assert.equal(total, 100);

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

console.log(
  "ALL 11 HISTORICAL COMPOSITION TESTS PASSED"
);
