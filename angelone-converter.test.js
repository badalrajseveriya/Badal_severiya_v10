
import test from "node:test";
import assert from "node:assert/strict";

import { convertAngelOneCandles } from "./angelone-converter.js";

function makeResponse(rows) {
  return {
    status: true,
    message: "SUCCESS",
    data: rows
  };
}

const validRow = [
  "2026-11-23T09:15:00+05:30",
  26000,
  26050,
  25980,
  26030,
  100
];

test("1. Converts a valid NIFTY candle", () => {
  const result = convertAngelOneCandles(
    makeResponse([validRow])
  );

  assert.equal(result.index, "NIFTY");
  assert.equal(result.timeframe, "15m");
  assert.equal(result.exchange, "NSE");
  assert.equal(result.symbolToken, "99926000");
  assert.equal(result.candles.length, 1);
});

test("2. Identifies the historical data source", () => {
  const result = convertAngelOneCandles(
    makeResponse([validRow])
  );

  assert.equal(result.source, "ANGEL_ONE_SMARTAPI");
  assert.equal(result.dataType, "REAL_HISTORICAL");
});

test("3. Converts timestamps to ISO format", () => {
  const result = convertAngelOneCandles(
    makeResponse([validRow])
  );

  assert.equal(
    result.candles[0].timestamp,
    "2026-11-23T03:45:00.000Z"
  );
});

test("4. Preserves valid OHLC values", () => {
  const result = convertAngelOneCandles(
    makeResponse([validRow])
  );

  const candle = result.candles[0];

  assert.equal(candle.open, 26000);
  assert.equal(candle.high, 26050);
  assert.equal(candle.low, 25980);
  assert.equal(candle.close, 26030);
});

test("5. Converts zero NIFTY volume to null", () => {
  const row = [...validRow];
  row[5] = 0;

  const result = convertAngelOneCandles(
    makeResponse([row])
  );

  assert.equal(result.candles[0].volume, null);
});

test("6. Preserves missing volume as null", () => {
  const row = [...validRow];
  row[5] = null;

  const result = convertAngelOneCandles(
    makeResponse([row])
  );

  assert.equal(result.candles[0].volume, null);
});

test("7. Preserves zero volume for non-NIFTY index", () => {
  const row = [...validRow];
  row[5] = 0;

  const result = convertAngelOneCandles(
    makeResponse([row]),
    "OTHER",
    "15m"
  );

  assert.equal(result.candles[0].volume, 0);
  assert.equal(result.symbolToken, null);
});

test("8. Sorts candles chronologically", () => {
  const later = [
    "2026-11-23T09:30:00+05:30",
    26030, 26060, 26010, 26040, 100
  ];

  const earlier = [
    "2026-11-23T09:15:00+05:30",
    26000, 26050, 25980, 26030, 100
  ];

  const result = convertAngelOneCandles(
    makeResponse([later, earlier])
  );

  assert.ok(
    Date.parse(result.candles[0].timestamp) <
    Date.parse(result.candles[1].timestamp)
  );
});

test("9. Rejects unsuccessful API responses", () => {
  assert.throws(
    () => convertAngelOneCandles({
      status: false,
      data: []
    }),
    /not successful/
  );
});

test("10. Rejects empty candle data", () => {
  assert.throws(
    () => convertAngelOneCandles(makeResponse([])),
    /missing/
  );
});

test("11. Rejects invalid OHLC values", () => {
  const invalidRow = [
    "2026-11-23T09:15:00+05:30",
    26000,
    25900,
    25980,
    26030,
    100
  ];

  assert.throws(
    () => convertAngelOneCandles(
      makeResponse([invalidRow])
    ),
    /Invalid OHLCV/
  );
});

test("12. Rejects duplicate candle timestamps", () => {
  assert.throws(
    () => convertAngelOneCandles(
      makeResponse([validRow, validRow])
    ),
    /Duplicate candle timestamp/
  );
});
