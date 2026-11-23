
const APP_NAME = "BADAL SEVERIYA DATA V11";

const ALLOWED_INDICES = [
  "NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYIT",
  "NIFTYAUTO", "NIFTYBANK", "NIFTYFMCG", "NIFTYPHARMA",
  "NIFTYMETAL", "NIFTYREALTY", "NIFTYENERGY", "NIFTYINFRA",
  "NIFTYMEDIA", "NIFTYPSUBANK", "NIFTY50"
];

const ALLOWED_TIMEFRAMES = [
  "1m", "3m", "5m", "10m", "15m", "30m", "1h", "1d"
];

const MAX_CANDLES = 5000;
let schemaReady = null;

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, x-ingest-token"
    }
  });
}

async function ensureSchema(DB) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await DB.prepare(`
        CREATE TABLE IF NOT EXISTS badal_v11_candles (
          index_name TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          candle_time TEXT NOT NULL,
          open REAL NOT NULL,
          high REAL NOT NULL,
          low REAL NOT NULL,
          close REAL NOT NULL,
          volume REAL NOT NULL,
          source TEXT NOT NULL DEFAULT 'HISTORICAL_UPLOAD',
          inserted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (index_name, timeframe, candle_time)
        )
      `).run();

      await DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_badal_v11_candles_lookup
        ON badal_v11_candles (index_name, timeframe, candle_time)
      `).run();

      await DB.prepare(`
        CREATE TABLE IF NOT EXISTS badal_v11_quality_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          index_name TEXT,
          timeframe TEXT,
          event_type TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
    })();
  }

  try {
    await schemaReady;
  } catch (error) {
    schemaReady = null;
    throw error;
  }
}

function validateCandle(item, index) {
  if (!item || typeof item !== "object") {
    throw new Error(`Invalid candle object at row ${index}`);
  }

  const rawTime = item.timestamp ?? item.time;
  if (typeof rawTime !== "string" || !rawTime.trim()) {
    throw new Error(`Missing timestamp at row ${index}`);
  }

  const timeMs = Date.parse(rawTime);
  if (!Number.isFinite(timeMs)) {
    throw new Error(`Invalid timestamp at row ${index}`);
  }

  const candle = {
    timestamp: new Date(timeMs).toISOString(),
    open: Number(item.open),
    high: Number(item.high),
    low: Number(item.low),
    close: Number(item.close),
    volume: Number(item.volume)
  };

  const values = [
    candle.open, candle.high, candle.low,
    candle.close, candle.volume
  ];

  if (!values.every(Number.isFinite)) {
    throw new Error(`Non-numeric OHLCV value at row ${index}`);
  }

  if (
    candle.open <= 0 || candle.high <= 0 ||
    candle.low <= 0 || candle.close <= 0 ||
    candle.volume < 0
  ) {
    throw new Error(`Invalid OHLCV range at row ${index}`);
  }

  if (
    candle.high < Math.max(candle.open, candle.close, candle.low) ||
    candle.low > Math.min(candle.open, candle.close, candle.high)
  ) {
    throw new Error(`Invalid high/low values at row ${index}`);
  }

  return candle;
}

async function health(DB) {
  await ensureSchema(DB);
  return json({
    app: APP_NAME,
    status: "OK",
    database: "D1 connected",
    time: new Date().toISOString()
  });
}

async function getStatus(DB) {
  const result = await DB.prepare(`
    SELECT
      COUNT(*) AS totalCandles,
      COUNT(DISTINCT index_name) AS totalIndices,
      MAX(inserted_at) AS lastInsertedAt
    FROM badal_v11_candles
  `).first();

  return json({
    app: APP_NAME,
    status: "OK",
    totalCandles: Number(result?.totalCandles || 0),
    totalIndices: Number(result?.totalIndices || 0),
    lastInsertedAt: result?.lastInsertedAt || null
  });
}

function getIndices() {
  return json({
    app: APP_NAME,
    indices: ALLOWED_INDICES,
    timeframes: ALLOWED_TIMEFRAMES
  });
}

async function getCandles(request, DB) {
  const url = new URL(request.url);
  const index = (url.searchParams.get("index") || "NIFTY").toUpperCase();
  const timeframe = url.searchParams.get("timeframe") || "15m";
  const requestedLimit = Number(url.searchParams.get("limit") || 500);

  if (!ALLOWED_INDICES.includes(index)) {
    return json({ error: "Unsupported index" }, 400);
  }
  if (!ALLOWED_TIMEFRAMES.includes(timeframe)) {
    return json({ error: "Unsupported timeframe" }, 400);
  }
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
    return json({ error: "Invalid limit" }, 400);
  }

  const limit = Math.min(requestedLimit, MAX_CANDLES);
  const result = await DB.prepare(`
    SELECT
      candle_time AS timestamp, open, high, low, close, volume
    FROM (
      SELECT *
      FROM badal_v11_candles
      WHERE index_name = ? AND timeframe = ?
      ORDER BY candle_time DESC
      LIMIT ?
    )
    ORDER BY candle_time ASC
  `).bind(index, timeframe, limit).all();

  return json({
    app: APP_NAME,
    index,
    timeframe,
    count: result.results.length,
    source: "D1_HISTORICAL_STORAGE",
    dataType: "HISTORICAL",
    candles: result.results
  });
}

async function getQuality(DB) {
  const result = await DB.prepare(`
    SELECT id, index_name, timeframe, event_type, message, created_at
    FROM badal_v11_quality_events
    ORDER BY id DESC
    LIMIT 100
  `).all();

  return json({
    app: APP_NAME,
    count: result.results.length,
    events: result.results
  });
}

async function recordQuality(DB, index, timeframe, message) {
  await DB.prepare(`
    INSERT INTO badal_v11_quality_events
      (index_name, timeframe, event_type, message)
    VALUES (?, ?, ?, ?)
  `).bind(
    index || null,
    timeframe || null,
    "INGEST_REJECTED",
    String(message).slice(0, 500)
  ).run();
}

async function ingest(request, env) {
  if (!env.INGEST_TOKEN) {
    return json({ error: "Server ingest token is not configured" }, 503);
  }

  const suppliedToken = request.headers.get("x-ingest-token");
  if (suppliedToken !== env.INGEST_TOKEN) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // Reject null, arrays, and primitive JSON values before reading properties.
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Request body must be a JSON object" }, 400);
  }

  const index = String(body.index || "").toUpperCase();
  const timeframe = String(body.timeframe || "");

  if (!ALLOWED_INDICES.includes(index)) {
    return json({ error: "Unsupported index" }, 400);
  }
  if (!ALLOWED_TIMEFRAMES.includes(timeframe)) {
    return json({ error: "Unsupported timeframe" }, 400);
  }
  if (
    !Array.isArray(body.candles) ||
    body.candles.length < 1 ||
    body.candles.length > MAX_CANDLES
  ) {
    return json({
      error: `Candles must contain 1 to ${MAX_CANDLES} rows`
    }, 400);
  }

  let candles;
  try {
    candles = body.candles.map(validateCandle);
  } catch (error) {
    await recordQuality(env.DB, index, timeframe, error.message);
    return json({
      error: "Candle validation failed",
      details: error.message
    }, 400);
  }

  for (let i = 1; i < candles.length; i++) {
    if (
      Date.parse(candles[i].timestamp) <=
      Date.parse(candles[i - 1].timestamp)
    ) {
      await recordQuality(
        env.DB,
        index,
        timeframe,
        "Candles are not strictly chronological or contain duplicates"
      );
      return json({
        error: "Candles must be chronological with no duplicate timestamps"
      }, 400);
    }
  }

  const statements = candles.map(candle =>
    env.DB.prepare(`
      INSERT INTO badal_v11_candles (
        index_name, timeframe, candle_time,
        open, high, low, close, volume, source
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(index_name, timeframe, candle_time)
      DO UPDATE SET
        open = excluded.open,
        high = excluded.high,
        low = excluded.low,
        close = excluded.close,
        volume = excluded.volume,
        source = excluded.source,
        inserted_at = CURRENT_TIMESTAMP
    `).bind(
      index, timeframe, candle.timestamp,
      candle.open, candle.high, candle.low,
      candle.close, candle.volume, "HISTORICAL_UPLOAD"
    )
  );

  try {
    for (let i = 0; i < statements.length; i += 100) {
      await env.DB.batch(statements.slice(i, i + 100));
    }
  } catch (error) {
    await recordQuality(
      env.DB, index, timeframe,
      `Database insert failed: ${error.message}`
    );
    return json({ error: "Database insert failed" }, 500);
  }

  return json({
    app: APP_NAME,
    status: "OK",
    message: "Historical candles stored",
    index,
    timeframe,
    received: candles.length,
    source: "HISTORICAL_UPLOAD",
    dataType: "HISTORICAL"
  });
}

async function handle(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type, x-ingest-token"
      }
    });
  }

  if (!env.DB) {
    return json({
      app: APP_NAME,
      status: "ERROR",
      error: "D1 binding DB is missing"
    }, 500);
  }

  const url = new URL(request.url);
  const path = url.pathname;

  try {
    await ensureSchema(env.DB);

    if (request.method === "GET" && path === "/api/health") {
      return await health(env.DB);
    }
    if (request.method === "GET" && path === "/api/data/status") {
      return await getStatus(env.DB);
    }
    if (request.method === "GET" && path === "/api/data/indices") {
      return getIndices();
    }
    if (request.method === "GET" && path === "/api/data/candles") {
      return await getCandles(request, env.DB);
    }
    if (request.method === "GET" && path === "/api/data/quality") {
      return await getQuality(env.DB);
    }
    if (request.method === "POST" && path === "/api/data/ingest") {
      return await ingest(request, env);
    }

    return json({
      app: APP_NAME,
      error: "Route not found",
      availableRoutes: [
        "GET /api/health",
        "GET /api/data/status",
        "GET /api/data/indices",
        "GET /api/data/candles",
        "GET /api/data/quality",
        "POST /api/data/ingest"
      ]
    }, 404);
  } catch (error) {
    return json({
      app: APP_NAME,
      status: "ERROR",
      error: error.message || "Internal server error"
    }, 500);
  }
}

export default {
  async fetch(request, env) {
    return handle(request, env);
  }
};
