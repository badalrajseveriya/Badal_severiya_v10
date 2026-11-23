
import assert from "node:assert/strict";
import worker from "./data-worker.js";

class FakeDB {
  constructor() {
    this.candles = [];
    this.quality = [];
  }

  prepare(sql) {
    const statement = {
      values: [],

      bind(...values) {
        this.values = values;
        return this;
      },

      async run() {
        if (sql.includes("INSERT INTO badal_v11_quality_events")) {
          const [index, timeframe, eventType, message] = this.values;

          thisDb.quality.push({
            id: thisDb.quality.length + 1,
            index_name: index,
            timeframe,
            event_type: eventType,
            message
          });
        }

        return { success: true };
      },

      async first() {
        return {
          totalCandles: thisDb.candles.length,
          totalIndices: new Set(
            thisDb.candles.map(item => item.index_name)
          ).size,
          lastInsertedAt: null
        };
      },

      async all() {
        if (sql.includes("badal_v11_quality_events")) {
          return {
            results: [...thisDb.quality].reverse().slice(0, 100)
          };
        }

        const [index, timeframe, limit] = this.values;

        const rows = thisDb.candles
          .filter(item =>
            item.index_name === index &&
            item.timeframe === timeframe
          )
          .sort((a, b) =>
            a.candle_time.localeCompare(b.candle_time)
          )
          .slice(-limit)
          .map(item => ({
            timestamp: item.candle_time,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume: item.volume
          }));

        return { results: rows };
      }
    };

    const thisDb = this;
    return statement;
  }

  async batch(statements) {
    for (const statement of statements) {
      const [
        index,
        timeframe,
        timestamp,
        open,
        high,
        low,
        close,
        volume,
        source
      ] = statement.values;

      this.candles.push({
        index_name: index,
        timeframe,
        candle_time: timestamp,
        open,
        high,
        low,
        close,
        volume,
        source
      });
    }

    return [];
  }
}

const DB = new FakeDB();
const env = {
  DB,
  INGEST_TOKEN: "test-token"
};

async function call(path, options = {}) {
  return worker.fetch(
    new Request(`https://example.test${path}`, options),
    env
  );
}

async function json(response) {
  return response.json();
}

// Health route
{
  const response = await call("/api/health");
  const body = await json(response);

  assert.equal(response.status, 200);
  assert.equal(body.status, "OK");
  assert.equal(body.database, "D1 connected");
}

// Indices route
{
  const response = await call("/api/data/indices");
  const body = await json(response);

  assert.equal(response.status, 200);
  assert.ok(body.indices.includes("NIFTY"));
  assert.ok(body.timeframes.includes("15m"));
}

// Invalid timeframe
{
  const response = await call(
    "/api/data/candles?timeframe=invalid"
  );

  assert.equal(response.status, 400);
}

// Unknown route
{
  const response = await call("/api/unknown");

  assert.equal(response.status, 404);
}

// Unauthorized historical upload
{
  const response = await call("/api/data/ingest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });

  assert.equal(response.status, 401);
}

// Valid historical upload
{
  const response = await call("/api/data/ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ingest-token": "test-token"
    },
    body: JSON.stringify({
      index: "NIFTY",
      timeframe: "15m",
      candles: [
        {
          timestamp: "2026-01-01T09:15:00.000Z",
          open: 25000,
          high: 25100,
          low: 24900,
          close: 25050,
          volume: 1000
        }
      ]
    })
  });

  const body = await json(response);

  assert.equal(response.status, 200);
  assert.equal(body.received, 1);
  assert.equal(body.dataType, "HISTORICAL");
}

// Read stored historical candles
{
  const response = await call(
    "/api/data/candles?index=NIFTY&timeframe=15m"
  );

  const body = await json(response);

  assert.equal(response.status, 200);
  assert.equal(body.count, 1);
  assert.equal(body.candles[0].close, 25050);
}

// Reject invalid OHLC values
{
  const response = await call("/api/data/ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ingest-token": "test-token"
    },
    body: JSON.stringify({
      index: "NIFTY",
      timeframe: "15m",
      candles: [
        {
          timestamp: "2026-01-02T09:15:00.000Z",
          open: 25000,
          high: 24900,
          low: 24800,
          close: 25050,
          volume: 1000
        }
      ]
    })
  });

  assert.equal(response.status, 400);
}

// Reject non-chronological candles
{
  const response = await call("/api/data/ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ingest-token": "test-token"
    },
    body: JSON.stringify({
      index: "NIFTY",
      timeframe: "15m",
      candles: [
        {
          timestamp: "2026-01-03T09:30:00.000Z",
          open: 25000,
          high: 25100,
          low: 24900,
          close: 25050,
          volume: 1000
        },
        {
          timestamp: "2026-01-03T09:15:00.000Z",
          open: 25000,
          high: 25100,
          low: 24900,
          close: 25050,
          volume: 1000
        }
      ]
    })
  });

  assert.equal(response.status, 400);
}

// Quality events
{
  const response = await call("/api/data/quality");
  const body = await json(response);

  assert.equal(response.status, 200);
  assert.ok(body.count >= 2);
}

console.log("DATA WORKER TESTS PASSED");
