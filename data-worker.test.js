
import assert from "node:assert/strict";
import worker from "./data-worker.js";

class FakeDB {
  constructor() {
    this.candles = [];
    this.quality = [];
  }

  prepare(sql) {
    const db = this;
    const statement = {
      values: [],

      bind(...values) {
        this.values = values;
        return this;
      },

      async run() {
        if (sql.includes("INSERT INTO badal_v11_quality_events")) {
          const [index, timeframe, eventType, message] = this.values;
          db.quality.push({
            id: db.quality.length + 1,
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
          totalCandles: db.candles.length,
          totalIndices: new Set(
            db.candles.map(item => item.index_name)
          ).size,
          lastInsertedAt: null
        };
      },

      async all() {
        if (sql.includes("badal_v11_quality_events")) {
          return {
            results: [...db.quality].reverse().slice(0, 100)
          };
        }

        const [index, timeframe, limit] = this.values;
        const rows = db.candles
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

      const existing = this.candles.find(item =>
        item.index_name === index &&
        item.timeframe === timeframe &&
        item.candle_time === timestamp
      );

      const row = {
        index_name: index,
        timeframe,
        candle_time: timestamp,
        open,
        high,
        low,
        close,
        volume,
        source
      };

      if (existing) Object.assign(existing, row);
      else this.candles.push(row);
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

async function callWithEnv(path, customEnv, options = {}) {
  return worker.fetch(
    new Request(`https://example.test${path}`, options),
    customEnv
  );
}

async function readJson(response) {
  return response.json();
}

function validCandle(timestamp = "2026-01-01T09:15:00.000Z") {
  return {
    timestamp,
    open: 25000,
    high: 25100,
    low: 24900,
    close: 25050,
    volume: 1000
  };
}

async function ingest(payload, headers = {}) {
  return call("/api/data/ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ingest-token": "test-token",
      ...headers
    },
    body: JSON.stringify(payload)
  });
}

// Health route
{
  const response = await call("/api/health");
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.status, "OK");
  assert.equal(body.database, "D1 connected");
}

// Indices and timeframe allowlists
{
  const response = await call("/api/data/indices");
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.ok(body.indices.includes("NIFTY"));
  assert.ok(body.timeframes.includes("15m"));
}

// Initial storage status
{
  const response = await call("/api/data/status");
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.totalCandles, 0);
  assert.equal(body.totalIndices, 0);
}

// Invalid query parameters
{
  const badIndex = await call(
    "/api/data/candles?index=UNKNOWN&timeframe=15m"
  );
  assert.equal(badIndex.status, 400);

  const badTimeframe = await call(
    "/api/data/candles?index=NIFTY&timeframe=invalid"
  );
  assert.equal(badTimeframe.status, 400);

  const zeroLimit = await call(
    "/api/data/candles?index=NIFTY&timeframe=15m&limit=0"
  );
  assert.equal(zeroLimit.status, 400);

  const decimalLimit = await call(
    "/api/data/candles?index=NIFTY&timeframe=15m&limit=1.5"
  );
  assert.equal(decimalLimit.status, 400);
}

// Unknown route
{
  const response = await call("/api/unknown");
  assert.equal(response.status, 404);
}

// OPTIONS preflight
{
  const response = await call("/api/data/ingest", {
    method: "OPTIONS"
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
}

// Missing database binding
{
  const response = await callWithEnv(
    "/api/health",
    { INGEST_TOKEN: "test-token" }
  );
  assert.equal(response.status, 500);
}

// Missing server token configuration
{
  const response = await callWithEnv(
    "/api/data/ingest",
    { DB },
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    }
  );
  assert.equal(response.status, 503);
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

// Invalid JSON body
{
  const response = await call("/api/data/ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ingest-token": "test-token"
    },
    body: "{not-json"
  });
  assert.equal(response.status, 400);
}

// Reject JSON null, arrays, and primitive values
{
  for (const body of ["null", "[]", '"text"', "123", "true"]) {
    const response = await call("/api/data/ingest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ingest-token": "test-token"
      },
      body
    });

    assert.equal(
      response.status,
      400,
      `Expected 400 for JSON body: ${body}`
    );
  }
}

// Unsupported index and timeframe
{
  const badIndex = await ingest({
    index: "UNKNOWN",
    timeframe: "15m",
    candles: [validCandle()]
  });
  assert.equal(badIndex.status, 400);

  const badTimeframe = await ingest({
    index: "NIFTY",
    timeframe: "2m",
    candles: [validCandle()]
  });
  assert.equal(badTimeframe.status, 400);
}

// Empty and oversized candle arrays
{
  const empty = await ingest({
    index: "NIFTY",
    timeframe: "15m",
    candles: []
  });
  assert.equal(empty.status, 400);

  const tooMany = await ingest({
    index: "NIFTY",
    timeframe: "15m",
    candles: new Array(5001).fill(validCandle())
  });
  assert.equal(tooMany.status, 400);
}

// Valid historical upload
{
  const response = await ingest({
    index: "NIFTY",
    timeframe: "15m",
    candles: [validCandle()]
  });
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.received, 1);
  assert.equal(body.dataType, "HISTORICAL");
  assert.equal(body.source, "HISTORICAL_UPLOAD");
}

// Read stored historical candles
{
  const response = await call(
    "/api/data/candles?index=NIFTY&timeframe=15m"
  );
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.count, 1);
  assert.equal(body.dataType, "HISTORICAL");
  assert.equal(body.candles[0].close, 25050);
}

// Status reflects stored historical data
{
  const response = await call("/api/data/status");
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.totalCandles, 1);
  assert.equal(body.totalIndices, 1);
}

// Limit and chronological order
{
  const response = await ingest({
    index: "NIFTY",
    timeframe: "15m",
    candles: [
      validCandle("2026-01-01T09:30:00.000Z"),
      validCandle("2026-01-01T09:45:00.000Z")
    ]
  });
  assert.equal(response.status, 200);

  const limited = await call(
    "/api/data/candles?index=NIFTY&timeframe=15m&limit=2"
  );
  const body = await readJson(limited);

  assert.equal(body.count, 2);
  assert.equal(
    body.candles[0].timestamp,
    "2026-01-01T09:30:00.000Z"
  );
  assert.equal(
    body.candles[1].timestamp,
    "2026-01-01T09:45:00.000Z"
  );
}

// Reject invalid OHLC relationships
{
  const response = await ingest({
    index: "NIFTY",
    timeframe: "15m",
    candles: [{
      ...validCandle("2026-01-02T09:15:00.000Z"),
      high: 24900
    }]
  });
  assert.equal(response.status, 400);
}

// Reject missing and invalid timestamps
{
  const missing = { ...validCandle("2026-01-02T09:30:00.000Z") };
  delete missing.timestamp;

  const missingResponse = await ingest({
    index: "NIFTY",
    timeframe: "15m",
    candles: [missing]
  });
  assert.equal(missingResponse.status, 400);

  const invalidResponse = await ingest({
    index: "NIFTY",
    timeframe: "15m",
    candles: [{
      ...validCandle(),
      timestamp: "not-a-date"
    }]
  });
  assert.equal(invalidResponse.status, 400);
}

// Reject negative volume
{
  const response = await ingest({
    index: "NIFTY",
    timeframe: "15m",
    candles: [{
      ...validCandle("2026-01-02T09:45:00.000Z"),
      volume: -1
    }]
  });
  assert.equal(response.status, 400);
}

// Reject duplicate or out-of-order timestamps
{
  const duplicate = await ingest({
    index: "NIFTY",
    timeframe: "15m",
    candles: [
      validCandle("2026-01-03T09:15:00.000Z"),
      validCandle("2026-01-03T09:15:00.000Z")
    ]
  });
  assert.equal(duplicate.status, 400);

  const outOfOrder = await ingest({
    index: "NIFTY",
    timeframe: "15m",
    candles: [
      validCandle("2026-01-04T09:30:00.000Z"),
      validCandle("2026-01-04T09:15:00.000Z")
    ]
  });
  assert.equal(outOfOrder.status, 400);
}

// Rejected uploads are recorded in the quality log
{
  const response = await call("/api/data/quality");
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.ok(body.count >= 6);
  assert.ok(body.events.every(event =>
    event.event_type === "INGEST_REJECTED"
  ));
}

console.log("DATA WORKER TESTS PASSED");
