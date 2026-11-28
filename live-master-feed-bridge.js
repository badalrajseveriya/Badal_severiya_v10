
/* ==========================================================
   BADAL SEVERIYA V12
   LIVE MASTER FEED BRIDGE
   Version 12.0

   Purpose:
   - Historical candles are baseline only.
   - Real source minute candles/ticks feed Live Candle Engine.
   - Builds independent 1D and 15M analysis payloads.
   - Publishes only when a real source is connected.
   - No fabricated candles.
   - No 1H fallback.
   - No order execution.
   ========================================================== */

import {
  createLiveCandleEngine
} from "./live-candle-engine.js";

const VERSION = "12.0";
const MODULE = "LIVE_MASTER_FEED_BRIDGE";

const DEFAULT_API_BASE =
  "https://badal-severiya-data.mrstarrdbs.workers.dev";

const SUPPORTED_TIMEFRAMES = ["1D", "15M"];

const API_TIMEFRAMES = {
  "1D": "1d",
  "15M": "15m"
};

const DEFAULT_MAX_AGE = {
  "1D": 48 * 60 * 60 * 1000,
  "15M": 30 * 60 * 1000
};

const MAX_API_PAGES = 100;
const PAGE_LIMIT = 5000;

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function parseTimestamp(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);

  if (Number.isFinite(numeric)) {
    return numeric < 1e12
      ? numeric * 1000
      : numeric;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function istDate(timestamp) {
  const shifted = new Date(
    timestamp + 330 * 60 * 1000
  );

  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function normalizeCandle(input) {
  if (!isObject(input)) {
    throw new Error("Candle must be an object.");
  }

  const timestamp = parseTimestamp(
    input.timestamp ?? input.time ?? input.date
  );

  const open = Number(input.open);
  const high = Number(input.high);
  const low = Number(input.low);
  const close = Number(input.close);

  const rawVolume = input.volume;

  const volume =
    rawVolume === null ||
    rawVolume === undefined ||
    rawVolume === ""
      ? null
      : Number(rawVolume);

  if (timestamp === null) {
    throw new Error("Candle timestamp is invalid.");
  }

  if (
    ![open, high, low, close].every(Number.isFinite) ||
    (
      volume !== null &&
      !Number.isFinite(volume)
    )
  ) {
    throw new Error("Candle contains non-numeric OHLCV values.");
  }

  if (
    open <= 0 ||
    high <= 0 ||
    low <= 0 ||
    close <= 0 ||
    (volume !== null && volume < 0) ||
    high < Math.max(open, close, low) ||
    low > Math.min(open, close, high)
  ) {
    throw new Error("Candle OHLC values are invalid.");
  }

  return {
    timestamp,
    open,
    high,
    low,
    close,
    volume
  };
}

function normalizeHistoricalCandles(input) {
  if (!Array.isArray(input)) {
    throw new Error("Historical candles must be an array.");
  }

  const candles = input.map(normalizeCandle);

  candles.sort(
    (a, b) => a.timestamp - b.timestamp
  );

  for (let i = 1; i < candles.length; i++) {
    if (
      candles[i].timestamp ===
      candles[i - 1].timestamp
    ) {
      throw new Error(
        "Historical data contains duplicate timestamps."
      );
    }
  }

  return candles;
}

function mergeCandles(baseline, liveCandles) {
  const byTimestamp = new Map();

  for (const candle of baseline) {
    byTimestamp.set(
      candle.timestamp,
      { ...candle }
    );
  }

  for (const candle of liveCandles) {
    byTimestamp.set(
      candle.timestamp,
      { ...candle }
    );
  }

  return [...byTimestamp.values()].sort(
    (a, b) => a.timestamp - b.timestamp
  );
}

function makeApiUrl(base, timeframe, offset) {
  const url = new URL(
    "/api/data/candles",
    base
  );

  url.searchParams.set("index", "NIFTY");
  url.searchParams.set(
    "timeframe",
    API_TIMEFRAMES[timeframe]
  );
  url.searchParams.set("limit", String(PAGE_LIMIT));
  url.searchParams.set("offset", String(offset));

  return url.toString();
}

export function createLiveMasterFeedBridge(options = {}) {
  const apiBase = String(
    options.apiBase || DEFAULT_API_BASE
  ).replace(/\/+$/, "");

  const fetchImpl =
    options.fetchImpl ||
    globalThis.fetch;

  const engine =
    options.engine ||
    createLiveCandleEngine({
      maxMinuteBars: 390
    });

  const maxAgeMs1D =
    Number(options.maxAgeMs1D ?? DEFAULT_MAX_AGE["1D"]);

  const maxAgeMs15M =
    Number(options.maxAgeMs15M ?? DEFAULT_MAX_AGE["15M"]);

  if (typeof fetchImpl !== "function") {
    throw new Error("A compatible fetch function is required.");
  }

  if (
    !engine ||
    typeof engine.ingestMinute !== "function" ||
    typeof engine.ingestTick !== "function" ||
    typeof engine.snapshot !== "function"
  ) {
    throw new Error("A compatible Live Candle Engine is required.");
  }

  if (
    !Number.isFinite(maxAgeMs1D) ||
    maxAgeMs1D <= 0 ||
    !Number.isFinite(maxAgeMs15M) ||
    maxAgeMs15M <= 0
  ) {
    throw new Error("Live feed freshness limits are invalid.");
  }

  let historical1D = [];
  let historical15M = [];

  let historicalLoaded = false;
  let sourceConnected = false;
  let sourceStatus = "DISCONNECTED";
  let sourceName = null;

  let lastPublishedAt = null;
  let lastError = null;
  let unsubscribe = null;
  let publishCount = 0;

  function setStatus(status, detail = null) {
    const normalized = String(status || "")
      .trim()
      .toUpperCase();

    if (
      normalized === "CONNECTED" ||
      normalized === "OPEN" ||
      normalized === "READY"
    ) {
      sourceConnected = true;
      sourceStatus = "CONNECTED";
      lastError = null;

      publish();
      return;
    }

    if (
      normalized === "CONNECTING" ||
      normalized === "RECONNECTING"
    ) {
      sourceConnected = false;
      sourceStatus = normalized;
      return;
    }

    if (
      normalized === "DISCONNECTED" ||
      normalized === "CLOSED"
    ) {
      sourceConnected = false;
      sourceStatus = "DISCONNECTED";
      return;
    }

    if (
      normalized === "ERROR" ||
      normalized === "FAILED"
    ) {
      sourceConnected = false;
      sourceStatus = "ERROR";

      lastError =
        detail?.message ||
        detail?.reason ||
        "Live source reported an error.";
    }
  }

  async function fetchHistoricalTimeframe(timeframe) {
    if (!SUPPORTED_TIMEFRAMES.includes(timeframe)) {
      throw new Error("Unsupported historical timeframe.");
    }

    const collected = [];
    let offset = 0;
    let pages = 0;

    while (pages < MAX_API_PAGES) {
      const response = await fetchImpl(
        makeApiUrl(apiBase, timeframe, offset),
        {
          method: "GET",
          headers: {
            accept: "application/json"
          }
        }
      );

      if (!response || response.ok !== true) {
        throw new Error(
          `Historical ${timeframe} API request failed.`
        );
      }

      const payload = await response.json();

      if (
        !isObject(payload) ||
        payload.status === "ERROR" ||
        payload.source !== "D1_HISTORICAL_STORAGE" ||
        payload.dataType !== "HISTORICAL" ||
        payload.timeframe !== API_TIMEFRAMES[timeframe] ||
        !Array.isArray(payload.candles)
      ) {
        throw new Error(
          `Historical ${timeframe} API returned an invalid response.`
        );
      }

      const page = normalizeHistoricalCandles(
        payload.candles
      );

      collected.push(...page);

      pages++;

      if (
        payload.hasMore !== true ||
        page.length === 0
      ) {
        break;
      }

      offset += page.length;
    }

    if (pages >= MAX_API_PAGES) {
      throw new Error(
        `Historical ${timeframe} pagination limit reached.`
      );
    }

    const sorted = normalizeHistoricalCandles(
      collected
    );

    return {
      timeframe,
      candles: sorted,
      count: sorted.length,
      pages,
      source: "D1_HISTORICAL_STORAGE",
      dataType: "HISTORICAL_BASELINE"
    };
  }

  async function loadHistoricalBaseline() {
    historicalLoaded = false;
    lastError = null;

    try {
      const [daily, intraday] = await Promise.all([
        fetchHistoricalTimeframe("1D"),
        fetchHistoricalTimeframe("15M")
      ]);

      if (
        daily.count < 50 ||
        intraday.count < 50
      ) {
        throw new Error(
          "At least 50 historical candles are required for both timeframes."
        );
      }

      historical1D = daily.candles;
      historical15M = intraday.candles;

      historicalLoaded = true;

      return {
        status: "READY",
        module: MODULE,
        historicalBaseline: {
          "1D": {
            count: daily.count,
            pages: daily.pages,
            source: daily.source
          },
          "15M": {
            count: intraday.count,
            pages: intraday.pages,
            source: intraday.source
          }
        }
      };
    } catch (error) {
      historicalLoaded = false;
      lastError = error?.message || "Historical baseline load failed.";

      return {
        status: "WAIT",
        module: MODULE,
        reason: lastError
      };
    }
  }

  function currentLiveCandles(snapshot) {
    const now = Date.now();
    const today = istDate(now);

    const daily = snapshot.dailyCandle
      ? [normalizeCandle(snapshot.dailyCandle)]
      : [];

    const intraday = Array.isArray(snapshot.candles15m)
      ? snapshot.candles15m.map(normalizeCandle)
      : [];

    const dailyToday = daily.filter(
      candle => istDate(candle.timestamp) === today
    );

    const intradayToday = intraday.filter(
      candle => istDate(candle.timestamp) === today
    );

    return {
      daily: dailyToday,
      intraday: intradayToday
    };
  }

  function createPayload(snapshot) {
    const live = currentLiveCandles(snapshot);

    if (
      live.daily.length === 0 &&
      live.intraday.length === 0
    ) {
      return null;
    }

    const dailyBaseline = historical1D.filter(
      candle => istDate(candle.timestamp) !== istDate(Date.now())
    );

    const intradayBaseline = historical15M.filter(
      candle => istDate(candle.timestamp) !== istDate(Date.now())
    );

    const candles1D = mergeCandles(
      dailyBaseline,
      live.daily
    );

    const candles15M = mergeCandles(
      intradayBaseline,
      live.intraday
    );

    return {
      candles1D,
      candles15M,
      now: Date.now(),
      maxAgeMs1D,
      maxAgeMs15M,

      feedMetadata: {
        module: MODULE,
        source: sourceName || "EXTERNAL_REAL_TIME_PROVIDER",
        historicalBaseline: true,
        liveSourceConnected: sourceConnected,
        liveDailyCandleCount: live.daily.length,
        live15MCandleCount: live.intraday.length,
        syntheticCandlesCreated: 0,
        timeframeFallback: false
      }
    };
  }

  function publish() {
    if (
      !historicalLoaded ||
      !sourceConnected
    ) {
      return {
        status: "WAIT",
        reason: "Historical baseline or real live source is unavailable."
      };
    }

    let candleSnapshot;

    try {
      candleSnapshot = engine.snapshot(Date.now());
    } catch (error) {
      lastError =
        error?.message || "Live candle snapshot failed.";

      return {
        status: "ERROR",
        reason: lastError
      };
    }

    const payload = createPayload(candleSnapshot);

    if (!payload) {
      return {
        status: "WAIT",
        reason: "No real live candles have been received."
      };
    }

    const latestDaily =
      payload.candles1D[payload.candles1D.length - 1];

    const latestIntraday =
      payload.candles15M[payload.candles15M.length - 1];

    if (
      !latestDaily ||
      !latestIntraday ||
      payload.candles1D.length < 50 ||
      payload.candles15M.length < 50
    ) {
      return {
        status: "WAIT",
        reason: "Insufficient combined historical and live candle data."
      };
    }

    const dailyAge =
      payload.now - latestDaily.timestamp;

    const intradayAge =
      payload.now - latestIntraday.timestamp;

    if (
      dailyAge < 0 ||
      intradayAge < 0 ||
      dailyAge > maxAgeMs1D ||
      intradayAge > maxAgeMs15M
    ) {
      return {
        status: "WAIT",
        reason: "Latest live candle data is stale or has a future timestamp."
      };
    }

    try {
      if (
        typeof window !== "undefined" &&
        typeof window.dispatchEvent === "function" &&
        typeof CustomEvent === "function"
      ) {
        window.dispatchEvent(
          new CustomEvent("badal:live-master-update", {
            detail: payload
          })
        );
      }

      if (typeof options.onUpdate === "function") {
        options.onUpdate(payload);
      }

      lastPublishedAt = Date.now();
      publishCount++;

      return {
        status: "PUBLISHED",
        module: MODULE,
        candleCounts: {
          "1D": payload.candles1D.length,
          "15M": payload.candles15M.length
        },
        liveCandleCounts: {
          "1D": payload.feedMetadata.liveDailyCandleCount,
          "15M": payload.feedMetadata.live15MCandleCount
        },
        syntheticCandlesCreated: 0
      };
    } catch (error) {
      lastError =
        error?.message || "Live dashboard update failed.";

      return {
        status: "ERROR",
        reason: lastError
      };
    }
  }

  function ingestMinute(candle) {
    if (!sourceConnected) {
      return {
        accepted: false,
        status: "WAIT",
        reason: "Real live source is not connected."
      };
    }

    const result = engine.ingestMinute(candle);

    if (result.accepted) {
      publish();
    }

    return result;
  }

  function ingestTick(tick) {
    if (!sourceConnected) {
      return {
        accepted: false,
        status: "WAIT",
        reason: "Real live source is not connected."
      };
    }

    const result = engine.ingestTick(tick);

    if (result.accepted) {
      publish();
    }

    return result;
  }

  async function connect(source) {
    if (
      !source ||
      typeof source.subscribe !== "function"
    ) {
      return {
        status: "INVALID_SOURCE",
        reason:
          "Source must provide subscribe({ onMinute, onTick, onStatus })."
      };
    }

    disconnect();

    sourceConnected = false;
    sourceStatus = "CONNECTING";
    sourceName = String(
      source.name || "EXTERNAL_REAL_TIME_PROVIDER"
    );

    try {
      const handle = await source.subscribe({
        onMinute: ingestMinute,
        onTick: ingestTick,
        onStatus: setStatus
      });

      if (typeof handle === "function") {
        unsubscribe = handle;
      } else if (
        isObject(handle) &&
        typeof handle.unsubscribe === "function"
      ) {
        unsubscribe = () => handle.unsubscribe();
      } else if (
        isObject(handle) &&
        typeof handle.close === "function"
      ) {
        unsubscribe = () => handle.close();
      }

      return {
        status: sourceStatus,
        module: MODULE,
        source: sourceName,
        note:
          "The provider must report CONNECTED before live data can be published."
      };
    } catch (error) {
      sourceConnected = false;
      sourceStatus = "ERROR";
      lastError =
        error?.message || "Live source connection failed.";

      return {
        status: "ERROR",
        reason: lastError
      };
    }
  }

  function disconnect() {
    sourceConnected = false;
    sourceStatus = "DISCONNECTED";

    if (typeof unsubscribe === "function") {
      try {
        unsubscribe();
      } catch {
        // Disconnect remains safe if provider cleanup fails.
      }
    }

    unsubscribe = null;

    return {
      status: "DISCONNECTED",
      module: MODULE
    };
  }

  function snapshot() {
    let engineSnapshot = null;

    try {
      engineSnapshot = engine.snapshot(Date.now());
    } catch {
      engineSnapshot = null;
    }

    return {
      status:
        historicalLoaded && sourceConnected
          ? "READY"
          : "WAIT",

      module: MODULE,
      version: VERSION,

      source: {
        name: sourceName,
        status: sourceStatus,
        connected: sourceConnected
      },

      historicalBaseline: {
        loaded: historicalLoaded,
        "1D": historical1D.length,
        "15M": historical15M.length,
        source: "D1_HISTORICAL_STORAGE"
      },

      liveEngine: engineSnapshot,

      publication: {
        count: publishCount,
        lastPublishedAt
      },

      lastError,

      safety: {
        supportedTimeframes: [...SUPPORTED_TIMEFRAMES],
        timeframeFallback: false,
        historicalDataUsedAsLiveSource: false,
        syntheticCandlesCreated: false,
        importedSourceExecuted: false,
        orderExecution: false
      },

      disclaimer:
        "Historical candles are baseline context. Only fresh real provider data is used for live updates."
    };
  }

  return {
    loadHistoricalBaseline,
    fetchHistoricalTimeframe,
    connect,
    disconnect,
    ingestMinute,
    ingestTick,
    publish,
    snapshot,

    config: {
      module: MODULE,
      version: VERSION,
      index: "NIFTY",
      supportedTimeframes: [...SUPPORTED_TIMEFRAMES],
      historicalApi: apiBase,
      historicalBaselineOnly: true,
      requiresExplicitSourceConnection: true,
      sourceAdapterRequired: true,
      syntheticCandles: false,
      timeframeFallback: false,
      orderExecution: false
    }
  };
}

export const LIVE_MASTER_FEED_BRIDGE_CONFIG = {
  version: VERSION,
  module: MODULE,
  index: "NIFTY",
  supportedTimeframes: SUPPORTED_TIMEFRAMES,
  historicalBaselineOnly: true,
  requiresRealLiveSource: true,
  requiresFreshLiveCandles: true,
  syntheticCandles: false,
  timeframeFallback: false,
  importedSourceExecution: false,
  orderExecution: false
};
