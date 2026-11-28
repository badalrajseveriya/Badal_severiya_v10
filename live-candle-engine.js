
// ======================================================
// BADAL SEVERIYA V12
// LIVE CANDLE ENGINE
// Real-data-only session aggregation, 1D + 15M
// ======================================================

const VERSION = "12.0";
const MODULE = "LIVE_CANDLE_ENGINE";
const IST_OFFSET_MS = 330 * 60 * 1000;
const SESSION_START_MINUTE = 9 * 60 + 15;
const SESSION_END_MINUTE = 15 * 60 + 30;
const MINUTE_MS = 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * MINUTE_MS;

function object(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function parseTimestamp(value) {
  if (value === null || value === undefined) return null;

  const numeric = Number(value);

  if (Number.isFinite(numeric)) {
    return numeric < 1e12 ? numeric * 1000 : numeric;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function marketParts(timestamp) {
  const shifted = new Date(timestamp + IST_OFFSET_MS);

  return {
    date: `${shifted.getUTCFullYear()}-${String(
      shifted.getUTCMonth() + 1
    ).padStart(2, "0")}-${String(
      shifted.getUTCDate()
    ).padStart(2, "0")}`,

    minuteOfDay:
      shifted.getUTCHours() * 60 +
      shifted.getUTCMinutes(),

    weekday: shifted.getUTCDay()
  };
}

function sessionMinuteStart(date, minuteOfDay) {
  const [year, month, day] = date.split("-").map(Number);

  return (
    Date.UTC(year, month - 1, day, 0, 0) -
    IST_OFFSET_MS +
    minuteOfDay * MINUTE_MS
  );
}

function normalizeMinuteCandle(input) {
  if (!object(input)) {
    throw new Error("Candle must be an object.");
  }

  const timestamp = parseTimestamp(
    input.timestamp ?? input.time ?? input.date
  );

  const open = Number(input.open);
  const high = Number(input.high);
  const low = Number(input.low);
  const close = Number(input.close);
  const volume = Number(input.volume ?? 0);

  if (timestamp === null) {
    throw new Error("Candle timestamp is required.");
  }

  if (
    ![open, high, low, close, volume].every(Number.isFinite)
  ) {
    throw new Error("OHLCV values must be finite numbers.");
  }

  if (
    open <= 0 ||
    high <= 0 ||
    low <= 0 ||
    close <= 0 ||
    volume < 0 ||
    high < Math.max(open, close, low) ||
    low > Math.min(open, close, high)
  ) {
    throw new Error("Candle OHLCV values are invalid.");
  }

  const minuteTimestamp =
    Math.floor(timestamp / MINUTE_MS) * MINUTE_MS;

  const parts = marketParts(minuteTimestamp);

  if (parts.weekday === 0 || parts.weekday === 6) {
    return {
      valid: false,
      reason: "WEEKEND",
      timestamp: minuteTimestamp,
      ...parts
    };
  }

  if (
    parts.minuteOfDay < SESSION_START_MINUTE ||
    parts.minuteOfDay >= SESSION_END_MINUTE
  ) {
    return {
      valid: false,
      reason: "OUTSIDE_SESSION",
      timestamp: minuteTimestamp,
      ...parts
    };
  }

  return {
    valid: true,
    timestamp: minuteTimestamp,
    date: parts.date,
    minuteOfDay: parts.minuteOfDay,
    open,
    high,
    low,
    close,
    volume
  };
}

function mergeMinute(existing, incoming) {
  return {
    timestamp: existing.timestamp,
    open: existing.open,
    high: Math.max(existing.high, incoming.high),
    low: Math.min(existing.low, incoming.low),
    close: incoming.close,
    volume: incoming.volume
  };
}

function aggregateBars(
  bars,
  bucketStart,
  bucketEnd,
  timeframe
) {
  const inBucket = bars
    .filter(
      bar =>
        bar.timestamp >= bucketStart &&
        bar.timestamp < bucketEnd
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  if (!inBucket.length) return null;

  return {
    timestamp: bucketStart,
    timeframe,

    open: inBucket[0].open,

    high: Math.max(
      ...inBucket.map(b => b.high)
    ),

    low: Math.min(
      ...inBucket.map(b => b.low)
    ),

    close: inBucket[inBucket.length - 1].close,

    volume: inBucket.reduce(
      (sum, b) => sum + b.volume,
      0
    ),

    sourceBarCount: inBucket.length,

    partial:
      timeframe === "15M"
        ? inBucket.length < 15
        : false,

    dataSource: "REAL_SOURCE_CANDLES"
  };
}

function detectMissingMinutes(bars) {
  if (bars.length < 2) return [];

  const timestamps = new Set(
    bars.map(b => b.timestamp)
  );

  const gaps = [];

  const first = bars[0].timestamp;
  const last = bars[bars.length - 1].timestamp;

  for (
    let t = first + MINUTE_MS;
    t < last;
    t += MINUTE_MS
  ) {
    const parts = marketParts(t);

    if (
      parts.weekday === 0 ||
      parts.weekday === 6 ||
      parts.minuteOfDay < SESSION_START_MINUTE ||
      parts.minuteOfDay >= SESSION_END_MINUTE
    ) {
      continue;
    }

    if (!timestamps.has(t)) {
      gaps.push(t);
    }
  }

  return gaps;
}

function detectMissing15m(bars) {
  if (bars.length < 2) return [];

  const byDate = new Map();

  for (const bar of bars) {
    const parts = marketParts(bar.timestamp);

    if (!byDate.has(parts.date)) {
      byDate.set(parts.date, []);
    }

    byDate.get(parts.date).push(bar.timestamp);
  }

  const missing = [];

  for (const [date, stamps] of byDate) {
    const unique = new Set(stamps);

    const first = Math.min(...stamps);
    const last = Math.max(...stamps);

    for (
      let t = first;
      t <= last;
      t += FIFTEEN_MINUTES_MS
    ) {
      if (!unique.has(t)) {
        missing.push(t);
      }
    }

    // 15M bars anchored at 09:15 IST
    const start = sessionMinuteStart(
      date,
      SESSION_START_MINUTE
    );

    const end = sessionMinuteStart(
      date,
      SESSION_END_MINUTE
    );

    for (
      let t = start;
      t < end;
      t += FIFTEEN_MINUTES_MS
    ) {
      if (t < first || t > last) continue;

      if (!unique.has(t)) {
        missing.push(t);
      }
    }
  }

  return [...new Set(missing)].sort(
    (a, b) => a - b
  );
}

function build15m(minuteBars) {
  const groups = new Map();

  for (const bar of minuteBars) {
    const parts = marketParts(bar.timestamp);

    const sessionOffset =
      parts.minuteOfDay - SESSION_START_MINUTE;

    const bucketIndex =
      Math.floor(sessionOffset / 15);

    const bucketStart = sessionMinuteStart(
      parts.date,
      SESSION_START_MINUTE +
        bucketIndex * 15
    );

    if (!groups.has(bucketStart)) {
      groups.set(bucketStart, []);
    }

    groups.get(bucketStart).push(bar);
  }

  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, bars]) =>
      aggregateBars(
        bars,
        start,
        start + FIFTEEN_MINUTES_MS,
        "15M"
      )
    );
}

function buildDaily(minuteBars, date) {
  if (!minuteBars.length) return null;

  const sessionStart = sessionMinuteStart(
    date,
    SESSION_START_MINUTE
  );

  const sessionEnd = sessionMinuteStart(
    date,
    SESSION_END_MINUTE
  );

  return aggregateBars(
    minuteBars,
    sessionStart,
    sessionEnd,
    "1D"
  );
}

export function createLiveCandleEngine(options = {}) {
  const maxBars = Math.floor(
    Number(options.maxMinuteBars ?? 390)
  );

  if (
    !Number.isFinite(maxBars) ||
    maxBars < 15
  ) {
    throw new Error(
      "maxMinuteBars must be at least 15."
    );
  }

  let sessionDate = null;
  let minuteBars = [];
  let lastUpdate = null;
  let rejectedCount = 0;
  let lastRejectReason = null;

  function resetForDate(date) {
    sessionDate = date;
    minuteBars = [];
    lastUpdate = null;
    rejectedCount = 0;
    lastRejectReason = null;
  }

  function ingestMinute(input) {
    let normalized;

    try {
      normalized = normalizeMinuteCandle(input);
    } catch (error) {
      rejectedCount++;
      lastRejectReason = error.message;

      return {
        accepted: false,
        status: "INVALID",
        reason: error.message
      };
    }

    if (!normalized.valid) {
      rejectedCount++;
      lastRejectReason = normalized.reason;

      return {
        accepted: false,
        status: "REJECTED",
        reason: normalized.reason
      };
    }

    if (sessionDate !== normalized.date) {
      if (
        sessionDate &&
        normalized.date < sessionDate
      ) {
        rejectedCount++;
        lastRejectReason = "OLDER_SESSION_DATE";

        return {
          accepted: false,
          status: "REJECTED",
          reason: lastRejectReason
        };
      }

      resetForDate(normalized.date);
    }

    const incoming = {
      timestamp: normalized.timestamp,
      open: normalized.open,
      high: normalized.high,
      low: normalized.low,
      close: normalized.close,
      volume: normalized.volume
    };

    const last = minuteBars[minuteBars.length - 1];

    if (
      last &&
      incoming.timestamp < last.timestamp
    ) {
      rejectedCount++;
      lastRejectReason = "OUT_OF_ORDER_MINUTE";

      return {
        accepted: false,
        status: "REJECTED",
        reason: lastRejectReason
      };
    }

    if (
      last &&
      incoming.timestamp === last.timestamp
    ) {
      minuteBars[minuteBars.length - 1] =
        mergeMinute(last, incoming);
    } else {
      minuteBars.push(incoming);
    }

    if (minuteBars.length > maxBars) {
      minuteBars = minuteBars.slice(-maxBars);
    }

    lastUpdate = Date.now();
    lastRejectReason = null;

    return {
      accepted: true,
      status: "ACCEPTED",
      date: sessionDate,
      minuteTimestamp: incoming.timestamp,
      minuteBarCount: minuteBars.length
    };
  }

  function ingestTick(tick) {
    if (!object(tick)) {
      return {
        accepted: false,
        status: "INVALID",
        reason: "Tick must be an object."
      };
    }

    const timestamp = parseTimestamp(
      tick.timestamp ?? tick.time
    );

    const price = Number(
      tick.price ?? tick.lastPrice
    );

    const volume = Number(
      tick.volumeDelta ?? tick.volume ?? 0
    );

    if (
      timestamp === null ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(volume) ||
      volume < 0
    ) {
      rejectedCount++;
      lastRejectReason = "INVALID_TICK";

      return {
        accepted: false,
        status: "INVALID",
        reason: lastRejectReason
      };
    }

    const minuteTimestamp =
      Math.floor(timestamp / MINUTE_MS) *
      MINUTE_MS;

    const parts = marketParts(minuteTimestamp);

    if (
      parts.weekday === 0 ||
      parts.weekday === 6 ||
      parts.minuteOfDay < SESSION_START_MINUTE ||
      parts.minuteOfDay >= SESSION_END_MINUTE
    ) {
      rejectedCount++;
      lastRejectReason = "OUTSIDE_SESSION";

      return {
        accepted: false,
        status: "REJECTED",
        reason: lastRejectReason
      };
    }

    const candle = {
      timestamp: minuteTimestamp,
      open: price,
      high: price,
      low: price,
      close: price,
      volume
    };

    const current = minuteBars.find(
      b => b.timestamp === minuteTimestamp
    );

    if (current) {
      candle.open = current.open;
      candle.high = Math.max(
        current.high,
        price
      );
      candle.low = Math.min(
        current.low,
        price
      );
      candle.volume = current.volume + volume;
    }

    return ingestMinute(candle);
  }

  function snapshot(now = Date.now()) {
    const minutes = minuteBars.map(
      b => ({ ...b })
    );

    const bars15m = build15m(minutes);

    const daily = sessionDate
      ? buildDaily(minutes, sessionDate)
      : null;

    const missingMinutes =
      detectMissingMinutes(minutes);

    const missing15m =
      detectMissing15m(bars15m);

    const latestMinute =
      minutes[minutes.length - 1] || null;

    const freshness = latestMinute
      ? {
          timestamp: latestMinute.timestamp,
          ageMs: Number(now) -
            latestMinute.timestamp,
          fresh:
            Number(now) >=
            latestMinute.timestamp
        }
      : {
          timestamp: null,
          ageMs: null,
          fresh: false
        };

    return {
      status: minutes.length
        ? "DATA_AVAILABLE"
        : "WAITING_FOR_DATA",

      module: MODULE,
      version: VERSION,
      sessionDate,

      timeframePolicy: ["1D", "15M"],

      sourceDataType:
        "REAL_SOURCE_CANDLES_OR_TICKS",

      syntheticCandlesCreated: 0,

      minuteCandles: minutes,
      candles15m: bars15m,
      dailyCandle: daily,

      gaps: {
        missingMinuteCount:
          missingMinutes.length,

        missingMinuteTimestamps:
          missingMinutes,

        missing15mCount:
          missing15m.length,

        missing15mTimestamps:
          missing15m
      },

      feed: {
        lastUpdateTimestamp: lastUpdate,

        latestMinuteTimestamp:
          latestMinute?.timestamp ?? null,

        freshness,

        rejectedCount,
        lastRejectReason
      },

      note:
        "Only received real source data is aggregated. Missing bars are reported, never fabricated. Display-only; no order execution."
    };
  }

  return {
    ingestMinute,
    ingestTick,
    snapshot,
    reset: () => resetForDate(null)
  };
}

export const LIVE_CANDLE_ENGINE_CONFIG = {
  version: VERSION,
  module: MODULE,
  supportedTimeframes: ["1D", "15M"],
  market: "NSE_INDIA",
  timezone: "Asia/Kolkata",
  sessionStart: "09:15",
  sessionEnd: "15:30",
  fifteenMinuteAnchor: "09:15",
  maxMinuteBarsDefault: 390,
  syntheticCandles: false,
  displayOnly: true,
  orderExecution: false
};
