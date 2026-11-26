
import assert from "node:assert/strict";

import {
  fetchHistoricalCandlePages,
  clearHistoricalCandlePageCache
} from "./historical-candle-pagination.js";

const API_BASE = "https://example.com";

function makeFetch(calls, options = {}) {
  return async url => {
    calls.push(url);

    if (options.failFirst && calls.length === 1) {
      return {
        ok: false,
        status: 503,
        json: async () => ({})
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        app: "BADAL SEVERIYA DATA V11",
        candles: [
          {
            timestamp: "2026-11-25T09:15:00.000Z",
            open: 25000,
            high: 25010,
            low: 24990,
            close: 25005,
            volume: 100
          },
          {
            timestamp: "2026-11-25T09:30:00.000Z",
            open: 25005,
            high: 25020,
            low: 25000,
            close: 25015,
            volume: 120
          }
        ],
        hasMore: false
      })
    };
  };
}

// 1. Concurrent calls for the same timeframe share one request.
{
  clearHistoricalCandlePageCache();

  const calls = [];
  const fetchImpl = makeFetch(calls);

  const options = {
    apiBase: API_BASE,
    timeframe: "1d",
    index: "NIFTY",
    maxCandles: 25000,
    pageSize: 5000,
    fetchImpl
  };

  const [first, second] = await Promise.all([
    fetchHistoricalCandlePages(options),
    fetchHistoricalCandlePages(options)
  ]);

  assert.equal(first.status, "OK");
  assert.equal(second.status, "OK");
  assert.equal(first.candleCount, 2);
  assert.equal(second.candleCount, 2);
  assert.equal(calls.length, 1);
  assert.deepEqual(first.candles, second.candles);
}

// 2. 1D and 15M must remain independent.
{
  clearHistoricalCandlePageCache();

  const calls = [];
  const fetchImpl = makeFetch(calls);

  const common = {
    apiBase: API_BASE,
    index: "NIFTY",
    maxCandles: 25000,
    pageSize: 5000,
    fetchImpl
  };

  const daily = await fetchHistoricalCandlePages({
    ...common,
    timeframe: "1d"
  });

  const intraday = await fetchHistoricalCandlePages({
    ...common,
    timeframe: "15m"
  });

  assert.equal(daily.status, "OK");
  assert.equal(intraday.status, "OK");
  assert.equal(daily.timeframe, "1d");
  assert.equal(intraday.timeframe, "15m");
  assert.equal(calls.length, 2);
}

// 3. A failed request must not remain cached.
{
  clearHistoricalCandlePageCache();

  const calls = [];
  const fetchImpl = makeFetch(calls, { failFirst: true });

  const options = {
    apiBase: API_BASE,
    timeframe: "15m",
    index: "NIFTY",
    maxCandles: 25000,
    pageSize: 5000,
    fetchImpl
  };

  const failed = await fetchHistoricalCandlePages(options);

  assert.equal(failed.status, "ERROR");

  const recovered = await fetchHistoricalCandlePages(options);

  assert.equal(recovered.status, "OK");
  assert.equal(calls.length, 2);
}

// 4. Different page sizes must not share a cached result.
{
  clearHistoricalCandlePageCache();

  const calls = [];
  const fetchImpl = makeFetch(calls);

  const common = {
    apiBase: API_BASE,
    timeframe: "1d",
    index: "NIFTY",
    maxCandles: 25000,
    fetchImpl
  };

  await fetchHistoricalCandlePages({
    ...common,
    pageSize: 5000
  });

  await fetchHistoricalCandlePages({
    ...common,
    pageSize: 1000
  });

  assert.equal(calls.length, 2);
}

clearHistoricalCandlePageCache();

console.log(
  "All historical candle pagination cache tests passed."
);
