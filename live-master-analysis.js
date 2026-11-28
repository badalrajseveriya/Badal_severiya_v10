// ======================================================
// BADAL SEVERIYA V12
// LIVE MASTER ANALYSIS ENGINE
// 1D + 15M ONLY
// Evidence-based context; no trading advice
// ======================================================

const VERSION = "12.0";
const MODULE = "LIVE_MASTER_ANALYSIS";

const RULE_IDS = [
  "EMA_TREND",
  "RSI_MACD_MOMENTUM",
  "VOLUME_SPIKE",
  "BREAKOUT_BREAKDOWN",
  "CANDLE_CLOSE_REJECTION",
  "ATR_VOLATILITY",
  "OI_PCR",
  "EVENT_TIME_WINDOW"
];

const MIN_CANDLES = 50;

const DEFAULT_MAX_AGE_MS = {
  "1D": 48 * 60 * 60 * 1000,
  "15M": 30 * 60 * 1000
};

const NOTE =
  "Live market evidence context only. Not a forecast, trading signal, or financial advice.";

function isObject(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function parseTime(value) {
  if (value === null || value === undefined) return null;

  const n = Number(value);

  if (Number.isFinite(n)) {
    return n < 1e12 ? n * 1000 : n;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCandles(input) {
  if (!Array.isArray(input)) {
    throw new Error("Candles must be an array.");
  }

  const candles = input.map((c, i) => {
    if (!isObject(c)) {
      throw new Error(`Invalid candle at index ${i}.`);
    }

    const open = Number(c.open);
    const high = Number(c.high);
    const low = Number(c.low);
    const close = Number(c.close);
    const volume = Number(c.volume ?? 0);
    const timestamp = parseTime(
      c.timestamp ?? c.time ?? c.date
    );

    if (![open, high, low, close, volume].every(Number.isFinite)) {
      throw new Error(`Invalid OHLCV at candle ${i}.`);
    }

    if (
      open <= 0 || high <= 0 || low <= 0 ||
      close <= 0 || volume < 0 ||
      high < low || high < open || high < close ||
      low > open || low > close
    ) {
      throw new Error(`Invalid candle values at ${i}.`);
    }

    return {
      open, high, low, close, volume, timestamp
    };
  });

  const withTime = candles.filter(c => c.timestamp !== null).length;

  if (withTime && withTime !== candles.length) {
    throw new Error("Timestamps must be provided for every candle or none.");
  }

  if (withTime) {
    for (let i = 1; i < candles.length; i++) {
      if (candles[i].timestamp <= candles[i - 1].timestamp) {
        throw new Error("Candles must be strictly chronological.");
      }
    }
  }

  return candles;
}

function ema(values, period) {
  if (values.length < period) return null;

  let result = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const k = 2 / (period + 1);

  for (let i = period; i < values.length; i++) {
    result = values[i] * k + result * (1 - k);
  }

  return result;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;

  let gain = 0;
  let loss = 0;

  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    gain += Math.max(d, 0);
    loss += Math.max(-d, 0);
  }

  let avgGain = gain / period;
  let avgLoss = loss / period;

  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }

  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function macd(values) {
  if (values.length < 35) return null;

  const fast = ema(values, 12);
  const slow = ema(values, 26);

  if (fast === null || slow === null) return null;

  return fast - slow;
}

function atr(candles, period = 14) {
  if (candles.length <= period) return null;

  const tr = [];

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1].close;

    tr.push(Math.max(
      c.high - c.low,
      Math.abs(c.high - prev),
      Math.abs(c.low - prev)
    ));
  }

  let value = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < tr.length; i++) {
    value = (value * (period - 1) + tr[i]) / period;
  }

  return value;
}

function rule(id, direction, status, reason, details = {}) {
  return {
    id,
    direction: direction || "NEUTRAL",
    status,
    reason,
    details
  };
}

function unavailable(id, reason) {
  return rule(id, "NEUTRAL", "UNAVAILABLE", reason);
}

function computeRules(candles, external = {}) {
  const closes = candles.map(c => c.close);
  const last = candles[candles.length - 1];
  const prior = candles.slice(0, -1);

  const rules = [];

  // Rule 1: EMA trend
  const e9 = ema(closes, 9);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);

  if (e9 !== null && e20 !== null && e50 !== null) {
    let dir = "NEUTRAL";

    if (e9 > e20 && e20 > e50 && last.close > e20) {
      dir = "BULLISH";
    } else if (e9 < e20 && e20 < e50 && last.close < e20) {
      dir = "BEARISH";
    }

    rules.push(rule(
      "EMA_TREND", dir, "VALID",
      `EMA9=${e9.toFixed(2)}, EMA20=${e20.toFixed(2)}, EMA50=${e50.toFixed(2)}`,
      { ema9: e9, ema20: e20, ema50: e50, close: last.close }
    ));
  } else {
    rules.push(unavailable("EMA_TREND", "Insufficient candles for EMA calculation."));
  }

  // Rule 2: RSI + MACD momentum
  const r = rsi(closes);
  const m = macd(closes);

  if (r !== null && m !== null) {
    let dir = "NEUTRAL";

    if (r >= 55 && m > 0) dir = "BULLISH";
    if (r <= 45 && m < 0) dir = "BEARISH";

    rules.push(rule(
      "RSI_MACD_MOMENTUM", dir, "VALID",
      `RSI=${r.toFixed(2)}, MACD=${m.toFixed(2)}`,
      { rsi: r, macd: m }
    ));
  } else {
    rules.push(unavailable("RSI_MACD_MOMENTUM", "RSI/MACD data insufficient."));
  }

  // Rule 3: Volume spike
  const recentVolume = prior.slice(-20).map(c => c.volume);
  const avgVolume = recentVolume.length
    ? recentVolume.reduce((a, b) => a + b, 0) / recentVolume.length
    : null;

  if (avgVolume !== null && avgVolume > 0) {
    const ratio = last.volume / avgVolume;
    let dir = "NEUTRAL";

    if (ratio >= 1.5 && last.close > last.open) dir = "BULLISH";
    if (ratio >= 1.5 && last.close < last.open) dir = "BEARISH";

    rules.push(rule(
      "VOLUME_SPIKE", dir, "VALID",
      `Volume ratio ${ratio.toFixed(2)}x average`,
      { currentVolume: last.volume, averageVolume: avgVolume, ratio }
    ));
  } else {
    rules.push(unavailable("VOLUME_SPIKE", "Volume baseline unavailable."));
  }

  // Rule 4: 20-bar breakout / breakdown
  const range = prior.slice(-20);

  if (range.length >= 20) {
    const high = Math.max(...range.map(c => c.high));
    const low = Math.min(...range.map(c => c.low));
    let dir = "NEUTRAL";

    if (last.close > high) dir = "BULLISH";
    else if (last.close < low) dir = "BEARISH";

    rules.push(rule(
      "BREAKOUT_BREAKDOWN", dir, "VALID",
      `20-bar range high ${high.toFixed(2)}, low ${low.toFixed(2)}`,
      { rangeHigh: high, rangeLow: low, close: last.close }
    ));
  } else {
    rules.push(unavailable("BREAKOUT_BREAKDOWN", "20-bar reference range unavailable."));
  }

  // Rule 5: candle close / rejection
  const candleRange = last.high - last.low;

  if (candleRange > 0) {
    const closePosition = (last.close - last.low) / candleRange;
    const upperWick = last.high - Math.max(last.open, last.close);
    const lowerWick = Math.min(last.open, last.close) - last.low;

    let dir = "NEUTRAL";

    if (closePosition >= 0.75 && lowerWick > upperWick) dir = "BULLISH";
    if (closePosition <= 0.25 && upperWick > lowerWick) dir = "BEARISH";

    rules.push(rule(
      "CANDLE_CLOSE_REJECTION", dir, "VALID",
      `Close position ${(closePosition * 100).toFixed(1)}% of candle range`,
      { closePosition, upperWick, lowerWick }
    ));
  } else {
    rules.push(unavailable("CANDLE_CLOSE_REJECTION", "Zero-range candle."));
  }

  // Rule 6: ATR / volatility is non-directional by default
  const a = atr(candles);

  if (a !== null) {
    rules.push(rule(
      "ATR_VOLATILITY", "NEUTRAL", "VALID",
      `ATR14=${a.toFixed(2)}; volatility is non-directional evidence`,
      { atr14: a }
    ));
  } else {
    rules.push(unavailable("ATR_VOLATILITY", "ATR data insufficient."));
  }

  // Rule 7: OI + PCR externally sourced evidence
  const oiPcr = external.oiPcr;

  if (
    isObject(oiPcr) &&
    ["BULLISH", "BEARISH", "NEUTRAL"].includes(oiPcr.direction) &&
    oiPcr.status === "VALID"
  ) {
    rules.push(rule(
      "OI_PCR", oiPcr.direction, "VALID",
      oiPcr.reason || "Validated OI/PCR context supplied.",
      oiPcr.details || {}
    ));
  } else {
    rules.push(unavailable(
      "OI_PCR",
      "Validated OI/PCR context not supplied."
    ));
  }

  // Rule 8: Event/time window, non-directional unless validated evidence says otherwise
  const event = external.eventTime;

  if (
    isObject(event) &&
    event.status === "VALID" &&
    ["BULLISH", "BEARISH", "NEUTRAL"].includes(event.direction)
  ) {
    rules.push(rule(
      "EVENT_TIME_WINDOW", event.direction, "VALID",
      event.reason || "Validated event/time context supplied.",
      event.details || {}
    ));
  } else {
    rules.push(unavailable(
      "EVENT_TIME_WINDOW",
      "Validated event/time context not supplied."
    ));
  }

  return rules;
}

function summarizeRules(rules) {
  const valid = rules.filter(r => r.status === "VALID");
  const directional = valid.filter(
    r => r.direction === "BULLISH" || r.direction === "BEARISH"
  );

  const bullish = directional.filter(r => r.direction === "BULLISH").length;
  const bearish = directional.filter(r => r.direction === "BEARISH").length;
  const neutral = valid.filter(r => r.direction === "NEUTRAL").length;

  const denominator = valid.length || 1;

  const percentages = {
    bullish: Number((bullish / denominator * 100).toFixed(2)),
    bearish: Number((bearish / denominator * 100).toFixed(2)),
    neutral: Number((neutral / denominator * 100).toFixed(2))
  };

  const total = percentages.bullish + percentages.bearish + percentages.neutral;

  // Rounding correction so valid evidence composition totals exactly 100.
  percentages.neutral = Number((percentages.neutral + (100 - total)).toFixed(2));

  let direction = "NEUTRAL";
  let status = "VALID";

  if (directional.length < 3) {
    status = "DATA_INSUFFICIENT";
  } else if (bullish > 0 && bearish > 0 && Math.abs(bullish - bearish) < 2) {
    direction = "CONFLICT";
    status = "CONFLICT";
  } else if (bullish / directional.length >= 0.6) {
    direction = "BULLISH";
  } else if (bearish / directional.length >= 0.6) {
    direction = "BEARISH";
  } else if (bullish > 0 && bearish > 0) {
    direction = "CONFLICT";
    status = "CONFLICT";
  }

  return {
    direction,
    status,
    validRuleCount: valid.length,
    unavailableRuleCount: rules.length - valid.length,
    directionalRuleCount: directional.length,
    bullishRuleCount: bullish,
    bearishRuleCount: bearish,
    neutralRuleCount: neutral,
    evidencePercentages: percentages,
    percentagesAreForecasts: false
  };
}

export function analyzeLiveMaster(input = {}) {
  try {
    if (!isObject(input)) throw new Error("Input must be an object.");

    const timeframe = input.timeframe;

    if (!["1D", "15M"].includes(timeframe)) {
      throw new Error("Only 1D and 15M timeframes are supported.");
    }

    const candles = normalizeCandles(input.candles);

    if (candles.length < MIN_CANDLES) {
      return {
        status: "DATA_INSUFFICIENT",
        module: MODULE,
        version: VERSION,
        timeframe,
        dataType: "LIVE",
        direction: "WAIT",
        rules: [],
        error: `Minimum ${MIN_CANDLES} candles required.`,
        note: NOTE
      };
    }

    const now = Number(input.now ?? Date.now());

    if (!Number.isFinite(now)) {
      throw new Error("Invalid analysis time.");
    }

    const maxAgeMs = Number(
      input.maxAgeMs ?? DEFAULT_MAX_AGE_MS[timeframe]
    );

    if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
      throw new Error("Invalid maximum feed age.");
    }

    const latest = candles[candles.length - 1];

    if (latest.timestamp === null) {
      return {
        status: "WAIT",
        module: MODULE,
        version: VERSION,
        timeframe,
        dataType: "LIVE",
        direction: "WAIT",
        feed: {
          timestamp: null,
          ageMs: null,
          fresh: false,
          reason: "Timestamp missing; live freshness cannot be validated."
        },
        rules: [],
        note: NOTE
      };
    }

    const ageMs = now - latest.timestamp;

    if (ageMs < 0) {
      return {
        status: "WAIT",
        module: MODULE,
        version: VERSION,
        timeframe,
        dataType: "LIVE",
        direction: "WAIT",
        feed: {
          timestamp: latest.timestamp,
          ageMs,
          fresh: false,
          reason: "Latest candle timestamp is in the future."
        },
        rules: [],
        note: NOTE
      };
    }

    if (ageMs > maxAgeMs) {
      return {
        status: "WAIT",
        module: MODULE,
        version: VERSION,
        timeframe,
        dataType: "LIVE",
        direction: "WAIT",
        feed: {
          timestamp: latest.timestamp,
          ageMs,
          fresh: false,
          reason: "Live feed is stale."
        },
        rules: [],
        note: NOTE
      };
    }

    const rules = computeRules(candles, input.externalEvidence || {});
    const summary = summarizeRules(rules);

    return {
      status: summary.status,
      module: MODULE,
      version: VERSION,
      dataType: "LIVE",
      timeframe,
      direction: summary.direction,
      feed: {
        timestamp: latest.timestamp,
        ageMs,
        fresh: true,
        maxAgeMs
      },
      market: {
        close: latest.close,
        candleCount: candles.length
      },
      rules,
      summary,
      validation: {
        timeframeValid: true,
        feedFresh: true,
        exactlyEightRules: rules.length === 8,
        ruleIdsValid: rules.map(r => r.id).join("|") === RULE_IDS.join("|"),
        percentagesTotal100:
          Math.abs(
            summary.evidencePercentages.bullish +
            summary.evidencePercentages.bearish +
            summary.evidencePercentages.neutral - 100
          ) < 0.01,
        percentagesAreForecasts: false
      },
      error: null,
      note: NOTE
    };

  } catch (error) {
    return {
      status: "ERROR",
      module: MODULE,
      version: VERSION,
      dataType: "LIVE",
      direction: "WAIT",
      timeframe: input?.timeframe ?? null,
      rules: [],
      error: error.message,
      note: NOTE
    };
  }
}

export const LIVE_MASTER_ANALYSIS_CONFIG = {
  version: VERSION,
  module: MODULE,
  supportedTimeframes: ["1D", "15M"],
  minimumCandles: MIN_CANDLES,
  rules: RULE_IDS,
  displayOnly: true,
  forecasts: false,
  tradingAdvice: false,
  orderExecution: false
};