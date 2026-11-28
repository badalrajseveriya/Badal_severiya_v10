
/* ======================================================
   BADAL SEVERIYA V12
   LIVE MASTER LEVELS ENGINE
   Dynamic ATR-based levels; display-only
   ====================================================== */

const VERSION = "12.0";
const MODULE = "LIVE_MASTER_LEVELS";

const SUPPORTED_TIMEFRAMES = ["1D", "15M"];

const DEFAULT_CONFIG = {
  atrPeriod: 14,
  stopAtrMultiplier: 1,
  target1AtrMultiplier: 1,
  target2AtrMultiplier: 2,
  displayOnly: true,
  orderExecution: false
};

function isObject(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function normalizeCandles(input) {
  if (!Array.isArray(input)) {
    throw new Error("Candles must be an array.");
  }

  return input.map((c, index) => {
    if (!isObject(c)) {
      throw new Error(`Invalid candle at index ${index}.`);
    }

    const open = Number(c.open);
    const high = Number(c.high);
    const low = Number(c.low);
    const close = Number(c.close);

    if (![open, high, low, close].every(Number.isFinite)) {
      throw new Error(`Invalid OHLC at candle ${index}.`);
    }

    if (
      open <= 0 ||
      high <= 0 ||
      low <= 0 ||
      close <= 0 ||
      high < low ||
      high < open ||
      high < close ||
      low > open ||
      low > close
    ) {
      throw new Error(`Invalid candle values at ${index}.`);
    }

    return { open, high, low, close };
  });
}

function calculateATR(candles, period) {
  if (candles.length <= period) {
    return null;
  }

  const trueRanges = [];

  for (let i = 1; i < candles.length; i++) {
    const candle = candles[i];
    const previousClose = candles[i - 1].close;

    const trueRange = Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );

    trueRanges.push(trueRange);
  }

  if (trueRanges.length < period) {
    return null;
  }

  let currentATR =
    trueRanges.slice(0, period).reduce((sum, value) => sum + value, 0) /
    period;

  for (let i = period; i < trueRanges.length; i++) {
    currentATR =
      (currentATR * (period - 1) + trueRanges[i]) / period;
  }

  return currentATR;
}

function roundPrice(value) {
  return Number(value.toFixed(2));
}

function unavailable(status, reason, timeframe = null) {
  return {
    status,
    module: MODULE,
    version: VERSION,
    timeframe,
    direction: "WAIT",
    levelsAvailable: false,
    levels: null,
    risk: null,
    rewardRisk: null,
    validation: {
      analysisValidated: false,
      feedFresh: false,
      levelsOrdered: false,
      orderExecution: false
    },
    reason,
    note:
      "Calculated context levels only. Not a forecast, trading signal, or financial advice."
  };
}

function validateConfig(input = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...input
  };

  const positiveKeys = [
    "atrPeriod",
    "stopAtrMultiplier",
    "target1AtrMultiplier",
    "target2AtrMultiplier"
  ];

  for (const key of positiveKeys) {
    if (!finite(config[key]) || Number(config[key]) <= 0) {
      throw new Error(`${key} must be a positive number.`);
    }
  }

  config.atrPeriod = Math.floor(Number(config.atrPeriod));

  if (config.atrPeriod < 1) {
    throw new Error("atrPeriod must be at least 1.");
  }

  config.stopAtrMultiplier = Number(config.stopAtrMultiplier);
  config.target1AtrMultiplier = Number(config.target1AtrMultiplier);
  config.target2AtrMultiplier = Number(config.target2AtrMultiplier);

  if (
    config.target2AtrMultiplier <=
    config.target1AtrMultiplier
  ) {
    throw new Error(
      "Target 2 multiplier must be greater than Target 1 multiplier."
    );
  }

  return config;
}

export function calculateLiveMasterLevels(input = {}) {
  try {
    if (!isObject(input)) {
      throw new Error("Input must be an object.");
    }

    const timeframe = input.timeframe;

    if (!SUPPORTED_TIMEFRAMES.includes(timeframe)) {
      throw new Error("Only 1D and 15M timeframes are supported.");
    }

    const analysis = input.analysis;

    if (!isObject(analysis)) {
      return unavailable(
        "WAIT",
        "Validated Live Master analysis is required.",
        timeframe
      );
    }

    if (
      analysis.timeframe !== timeframe ||
      analysis.status !== "VALID" ||
      !["BULLISH", "BEARISH"].includes(analysis.direction) ||
      analysis.feed?.fresh !== true ||
      analysis.validation?.timeframeValid !== true ||
      analysis.validation?.feedFresh !== true ||
      analysis.validation?.exactlyEightRules !== true
    ) {
      return unavailable(
        "WAIT",
        "Analysis is invalid, stale, neutral, conflicting, or insufficient.",
        timeframe
      );
    }

    const candles = normalizeCandles(input.candles);

    const config = validateConfig(input.config || {});

    if (candles.length <= config.atrPeriod) {
      return unavailable(
        "DATA_INSUFFICIENT",
        `At least ${config.atrPeriod + 1} candles are required for ATR.`,
        timeframe
      );
    }

    const latest = candles[candles.length - 1];

    if (
      !finite(analysis.market?.close) ||
      Number(analysis.market.close) !== latest.close
    ) {
      return unavailable(
        "WAIT",
        "Analysis close does not match the latest candle close.",
        timeframe
      );
    }

    const atr = calculateATR(candles, config.atrPeriod);

    if (!finite(atr) || atr <= 0) {
      return unavailable(
        "DATA_INSUFFICIENT",
        "ATR is unavailable or invalid.",
        timeframe
      );
    }

    const entry = latest.close;
    const stopDistance = atr * config.stopAtrMultiplier;
    const target1Distance = atr * config.target1AtrMultiplier;
    const target2Distance = atr * config.target2AtrMultiplier;

    let stopLoss;
    let target1;
    let target2;

    if (analysis.direction === "BULLISH") {
      stopLoss = entry - stopDistance;
      target1 = entry + target1Distance;
      target2 = entry + target2Distance;
    } else {
      stopLoss = entry + stopDistance;
      target1 = entry - target1Distance;
      target2 = entry - target2Distance;
    }

    const levels = {
      entry: roundPrice(entry),
      stopLoss: roundPrice(stopLoss),
      target1: roundPrice(target1),
      target2: roundPrice(target2)
    };

    const risk = roundPrice(Math.abs(entry - stopLoss));
    const reward1 = roundPrice(Math.abs(target1 - entry));
    const reward2 = roundPrice(Math.abs(target2 - entry));

    const rewardRisk = {
      target1: Number((reward1 / risk).toFixed(2)),
      target2: Number((reward2 / risk).toFixed(2))
    };

    const ordered = analysis.direction === "BULLISH"
      ? levels.stopLoss < levels.entry &&
        levels.entry < levels.target1 &&
        levels.target1 < levels.target2
      : levels.target2 < levels.target1 &&
        levels.target1 < levels.entry &&
        levels.entry < levels.stopLoss;

    if (!ordered || risk <= 0) {
      return unavailable(
        "ERROR",
        "Calculated levels failed price-order validation.",
        timeframe
      );
    }

    return {
      status: "VALID",
      module: MODULE,
      version: VERSION,
      timeframe,
      direction: analysis.direction,
      levelsAvailable: true,
      levels,
      atr: roundPrice(atr),
      atrPeriod: config.atrPeriod,
      risk,
      reward: {
        target1: reward1,
        target2: reward2
      },
      rewardRisk,
      calculation: {
        entrySource: "LATEST_VALIDATED_CANDLE_CLOSE",
        stopLossMethod: "ATR_MULTIPLIER",
        targetMethod: "ATR_MULTIPLIER",
        stopAtrMultiplier: config.stopAtrMultiplier,
        target1AtrMultiplier: config.target1AtrMultiplier,
        target2AtrMultiplier: config.target2AtrMultiplier
      },
      validation: {
        analysisValidated: true,
        feedFresh: true,
        timeframeValid: true,
        levelsOrdered: ordered,
        orderExecution: false
      },
      note:
        "Calculated context levels only. Not a forecast, trading signal, or financial advice."
    };
  } catch (error) {
    return unavailable(
      "ERROR",
      error.message,
      input?.timeframe ?? null
    );
  }
}

export const LIVE_MASTER_LEVELS_CONFIG = {
  version: VERSION,
  module: MODULE,
  supportedTimeframes: SUPPORTED_TIMEFRAMES,
  defaultATRPeriod: DEFAULT_CONFIG.atrPeriod,
  defaultStopMultiplier: DEFAULT_CONFIG.stopAtrMultiplier,
  defaultTarget1Multiplier: DEFAULT_CONFIG.target1AtrMultiplier,
  defaultTarget2Multiplier: DEFAULT_CONFIG.target2AtrMultiplier,
  displayOnly: true,
  forecasts: false,
  tradingAdvice: false,
  orderExecution: false
};
