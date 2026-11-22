
const APP = "BADAL SEVERIYA DATA V1";

const ALLOWED_INDEXES = [
  "NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY",
  "NIFTYIT", "NIFTYAUTO", "NIFTYBANK", "NIFTYFMCG",
  "NIFTYPHARMA", "NIFTYMETAL", "NIFTYREALTY",
  "NIFTYENERGY", "NIFTYINFRA", "NIFTYPSUBANK"
];

const ALLOWED_TIMEFRAMES = ["5m", "15m", "30m", "1h", "1d"];

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "Content-Type, Authorization"
    }
  });
}

function validCandle(c) {
  if (!c || typeof c !== "object") return false;

  const values = ["open", "high", "low", "close", "volume"];
  for (const key of values) {
    if (!Number.isFinite(Number(c[key]))) return false;
  }

  const o = Number(c.open);
  const h = Number(c.high);
  const l = Number(c.low);
  const cl = Number(c.close);
  const v = Number(c.volume);

  return o > 0 && h > 0 && l > 0 && cl > 0 &&
    v >= 0 && h >= Math.max(o, cl, l) &&
    l <= Math.min(o, cl, h);
}

function validTime(value) {
  return typeof value === "string" &&
    Number.isFinite(Date.parse(value));
}

async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "Content-Type, Authorization"
      }
    });
  }

  if (!env.DB) {
    return json({ app: APP, status: "ERROR", message: "D1 binding DB missing" }, 500);
  }

  if (path === "/api/health") {
    return json({
      app: APP,
      status: "OK",
      database: "DB binding available",
      time: new Date().toISOString()
    });
  }

  if (path === "/api/data/indices") {
    return json({
      app: APP,
      indices: ALLOWED_INDEXES,
      timeframes: ALLOWED_TIMEFRAMES
    });
  }

  if (path === "/api/data/status") {
    const result = await env.DB.prepare(
      "SELECT COUNT(*) AS total_candles FROM index_candles"
    ).first();

    return json({
      app: APP,
      status: "OK",
      totalCandles: result?.total_candles ?? 0
    });
  }

  if (path === "/api/data/candles" && request.method === "GET") {
    const index = (url.searchParams.get("index") || "NIFTY").toUpperCase();
    const timeframe = url.searchParams.get("timeframe") || "15m";
    const limit = Math.min(
      500,
      Math.max(1, Number(url.searchParams.get("limit") || 100))
    );

    if (!ALLOWED_INDEXES.includes(index)) {
      return json({ error: "Unsupported index" }, 400);
    }

    if (!ALLOWED_TIMEFRAMES.includes(timeframe)) {
      return json({ error: "Unsupported timeframe" }, 400);
    }

    const result = await env.DB.prepare(`
      SELECT index_code, timeframe, candle_time,
             open, high, low, close, volume
      FROM index_candles
      WHERE index_code = ? AND timeframe = ?
      ORDER BY candle_time DESC
      LIMIT ?
    `).bind(index, timeframe, limit).all();

    return json({
      app: APP,
      index,
      timeframe,
      count: result.results?.length || 0,
      candles: result.results || []
    });
  }

  if (path === "/api/data/ingest" && request.method === "POST") {
    const token = request.headers.get("Authorization") || "";
    if (!env.INGEST_TOKEN || token !== `Bearer ${env.INGEST_TOKEN}`) {
      return json({ error: "Unauthorized" }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const index = String(body.index || "").toUpperCase();
    const timeframe = String(body.timeframe || "");
    const candles = body.candles;

    if (!ALLOWED_INDEXES.includes(index)) {
      return json({ error: "Unsupported index" }, 400);
    }

    if (!ALLOWED_TIMEFRAMES.includes(timeframe)) {
      return json({ error: "Unsupported timeframe" }, 400);
    }

    if (!Array.isArray(candles) || candles.length < 1 || candles.length > 500) {
      return json({ error: "candles must contain 1 to 500 records" }, 400);
    }

    for (const c of candles) {
      if (!validCandle(c) || !validTime(c.time)) {
        return json({
          error: "Invalid candle",
          detail: "Check time, OHLC and volume values"
        }, 400);
      }
    }

    const statements = candles.map(c =>
      env.DB.prepare(`
        INSERT OR REPLACE INTO index_candles
        (index_code, timeframe, candle_time, open, high, low, close, volume)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        index, timeframe, c.time,
        Number(c.open), Number(c.high), Number(c.low),
        Number(c.close), Number(c.volume)
      )
    );

    await env.DB.batch(statements);

    return json({
      app: APP,
      status: "OK",
      index,
      timeframe,
      received: candles.length,
      saved: candles.length
    });
  }

  return json({
    app: APP,
    status: "NOT_FOUND",
    availableRoutes: [
      "/api/health",
      "/api/data/indices",
      "/api/data/status",
      "/api/data/candles",
      "/api/data/ingest"
    ]
  }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      return json({
        app: APP,
        status: "ERROR",
        message: error.message || "Internal error"
      }, 500);
    }
  }
};
