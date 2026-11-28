
// ==========================================================
// BADAL SEVERIYA V12
// CUSTOM INDICATOR ADAPTER ENGINE
// Safe Compatibility Detection + Runtime Validation
// Supported: 1D / 15M
// No imported source execution
// No order execution
// ==========================================================

const VERSION = "12.0";
const MODULE = "CUSTOM_INDICATOR_ADAPTER_ENGINE";

const SUPPORTED_TIMEFRAMES = ["1D", "15M"];

const DEFAULT_CONFIG = {
  minimumCandles: 20,
  maximumCandles: 5000,
  supportedTimeframes: SUPPORTED_TIMEFRAMES,
  executeImportedCode: false,
  orderExecution: false
};

function isObject(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function safeString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;

  try {
    return String(value);
  } catch {
    return fallback;
  }
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function positive(value) {
  return finite(value) && Number(value) > 0;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeTimeframe(value) {
  const timeframe = safeString(value)
    .trim()
    .toUpperCase();

  return SUPPORTED_TIMEFRAMES.includes(timeframe)
    ? timeframe
    : null;
}

function parseTimestamp(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const n = Number(value);

  if (Number.isFinite(n)) {
    return n < 1e12 ? n * 1000 : n;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function normalizeCandles(input) {
  if (!Array.isArray(input)) {
    return {
      valid: false,
      status: "INVALID_CANDLE_ARRAY",
      candles: [],
      reason: "Candles must be supplied as an array."
    };
  }

  if (input.length === 0) {
    return {
      valid: false,
      status: "NO_CANDLES",
      candles: [],
      reason: "No candle data supplied."
    };
  }

  const candles = [];

  for (let i = 0; i < input.length; i++) {
    const raw = input[i];

    if (!isObject(raw)) {
      return {
        valid: false,
        status: "INVALID_CANDLE",
        candles: [],
        reason: `Candle ${i} is not an object.`
      };
    }

    const timestamp = parseTimestamp(
      raw.timestamp ?? raw.time ?? raw.date
    );

    const open = Number(raw.open);
    const high = Number(raw.high);
    const low = Number(raw.low);
    const close = Number(raw.close);
    const volume = Number(raw.volume ?? 0);

    if (
      timestamp === null ||
      ![open, high, low, close, volume].every(Number.isFinite)
    ) {
      return {
        valid: false,
        status: "INVALID_CANDLE_VALUES",
        candles: [],
        reason: `Candle ${i} has invalid timestamp or OHLCV.`
      };
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
      return {
        valid: false,
        status: "INVALID_OHLC",
        candles: [],
        reason: `Candle ${i} has invalid OHLC relationships.`
      };
    }

    if (
      candles.length &&
      timestamp <= candles[candles.length - 1].timestamp
    ) {
      return {
        valid: false,
        status: "INVALID_CHRONOLOGY",
        candles: [],
        reason: "Candles must be strictly chronological without duplicate timestamps."
      };
    }

    candles.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume
    });
  }

  return {
    valid: true,
    status: "VALID",
    candles,
    reason: null
  };
}

function mean(values) {
  if (!values.length) return null;

  return values.reduce((sum, value) => sum + value, 0) /
    values.length;
}

function sma(values, period) {
  if (
    !Number.isInteger(period) ||
    period < 1 ||
    values.length < period
  ) {
    return null;
  }

  return mean(values.slice(-period));
}

function emaSeries(values, period) {
  if (
    !Number.isInteger(period) ||
    period < 1 ||
    values.length < period
  ) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  let current = mean(values.slice(0, period));

  const output = new Array(period - 1).fill(null);
  output.push(current);

  for (let i = period; i < values.length; i++) {
    current =
      (values[i] - current) * multiplier +
      current;

    output.push(current);
  }

  return output;
}

function rsi(values, period = 14) {
  if (
    !Number.isInteger(period) ||
    period < 2 ||
    values.length < period + 1
  ) {
    return null;
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];

    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];

    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    avgGain =
      (avgGain * (period - 1) + gain) / period;

    avgLoss =
      (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) {
    return avgGain === 0 ? 50 : 100;
  }

  const rs = avgGain / avgLoss;

  return 100 - 100 / (1 + rs);
}

function atr(candles, period = 14) {
  if (
    !Number.isInteger(period) ||
    period < 1 ||
    candles.length < period + 1
  ) {
    return null;
  }

  const tr = [];

  for (let i = 1; i < candles.length; i++) {
    const candle = candles[i];
    const previousClose = candles[i - 1].close;

    tr.push(
      Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previousClose),
        Math.abs(candle.low - previousClose)
      )
    );
  }

  let current = mean(tr.slice(0, period));

  for (let i = period; i < tr.length; i++) {
    current =
      (current * (period - 1) + tr[i]) / period;
  }

  return current;
}

function macd(values, fast = 12, slow = 26, signalPeriod = 9) {
  if (
    !Number.isInteger(fast) ||
    !Number.isInteger(slow) ||
    !Number.isInteger(signalPeriod) ||
    fast < 1 ||
    slow <= fast ||
    signalPeriod < 1 ||
    values.length < slow + signalPeriod
  ) {
    return null;
  }

  const fastSeries = emaSeries(values, fast);
  const slowSeries = emaSeries(values, slow);

  const macdLine = [];

  for (let i = 0; i < values.length; i++) {
    if (
      fastSeries[i] === null ||
      slowSeries[i] === null
    ) {
      macdLine.push(null);
    } else {
      macdLine.push(
        fastSeries[i] - slowSeries[i]
      );
    }
  }

  const validMacd = macdLine.filter(
    value => value !== null
  );

  const signalLine = emaSeries(
    validMacd,
    signalPeriod
  );

  const latestMacd =
    validMacd[validMacd.length - 1];

  const latestSignal =
    signalLine[signalLine.length - 1];

  if (latestSignal === undefined) {
    return null;
  }

  return {
    macd: latestMacd,
    signal: latestSignal,
    histogram: latestMacd - latestSignal
  };
}

// ----------------------------------------------------------
// Indicator identification
// Imported scripts are inspected as text only.
// No eval, Function, dynamic import or script execution.
// ----------------------------------------------------------

function parseJsonSource(source) {
  if (typeof source !== "string") return null;

  const trimmed = source.trim();

  if (!trimmed.startsWith("{")) return null;

  try {
    const parsed = JSON.parse(trimmed);

    return isObject(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function identifyIndicator(indicator) {
  if (!isObject(indicator)) {
    return {
      supported: false,
      status: "INVALID_INDICATOR",
      reason: "Indicator must be an object."
    };
  }

  const jsonDefinition =
    parseJsonSource(indicator.source);

  const definition = {
    ...indicator,
    ...(jsonDefinition || {}),
    settings: {
      ...(isObject(jsonDefinition?.settings)
        ? jsonDefinition.settings
        : {}),
      ...(isObject(indicator.settings)
        ? indicator.settings
        : {})
    }
  };

  const typeText = safeString(
    definition.indicatorType ??
    definition.calculation ??
    definition.type ??
    ""
  ).toUpperCase();

  const source = safeString(
    indicator.source ??
    indicator.script ??
    indicator.formula ??
    ""
  );

  const combined = `${typeText}\n${source}`;

  // MACD checked before EMA because source can contain EMA.
  if (
    /\bMACD\b/i.test(combined) ||
    /\bta\.macd\s*\(/i.test(source)
  ) {
    return {
      supported: true,
      adapterId: "builtin-macd",
      type: "MACD",
      definition
    };
  }

  if (
    /\bRSI\b/i.test(combined) ||
    /\bta\.rsi\s*\(/i.test(source)
  ) {
    return {
      supported: true,
      adapterId: "builtin-rsi",
      type: "RSI",
      definition
    };
  }

  if (
    /\bATR\b/i.test(combined) ||
    /\bta\.atr\s*\(/i.test(source)
  ) {
    return {
      supported: true,
      adapterId: "builtin-atr",
      type: "ATR",
      definition
    };
  }

  if (
    /\bSMA\b/i.test(combined) ||
    /\bta\.sma\s*\(/i.test(source)
  ) {
    return {
      supported: true,
      adapterId: "builtin-sma",
      type: "SMA",
      definition
    };
  }

  if (
    /\bEMA\b/i.test(combined) ||
    /\bta\.ema\s*\(/i.test(source)
  ) {
    return {
      supported: true,
      adapterId: "builtin-ema",
      type: "EMA",
      definition
    };
  }

  return {
    supported: false,
    status: "UNSUPPORTED_INDICATOR",
    reason:
      "No validated built-in adapter recognizes this indicator. It can remain saved in chart-only mode."
  };
}

function extractPeriod(definition, source, fallback) {
  const settings = isObject(definition.settings)
    ? definition.settings
    : {};

  const periodValue =
    settings.period ??
    settings.length ??
    settings.len ??
    settings.lookback ??
    settings.window ??
    settings.rsiLength ??
    settings.emaLength ??
    settings.smaLength ??
    settings.atrLength;

  if (periodValue !== undefined) {
    const period = Number(periodValue);

    return Number.isInteger(period) && period > 0
      ? period
      : null;
  }

  // Inspect common Pine-style calls safely.
  const pattern = new RegExp(
    `(?:ta\\.)?(?:sma|ema|rsi|atr)\\s*\\([^,]+,\\s*(\\d+)\\s*\\)`,
    "i"
  );

  const match = safeString(source).match(pattern);

  return match
    ? Number(match[1])
    : fallback;
}

function extractMacdSettings(definition, source) {
  const settings = isObject(definition.settings)
    ? definition.settings
    : {};

  const fast = Number(
    settings.fast ??
    settings.fastLength ??
    settings.short ??
    12
  );

  const slow = Number(
    settings.slow ??
    settings.slowLength ??
    settings.long ??
    26
  );

  const signal = Number(
    settings.signal ??
    settings.signalLength ??
    9
  );

  return {
    fast,
    slow,
    signal,
    valid:
      Number.isInteger(fast) &&
      Number.isInteger(slow) &&
      Number.isInteger(signal) &&
      fast > 0 &&
      slow > fast &&
      signal > 0
  };
}

// ----------------------------------------------------------
// Built-in safe adapter calculations
// ----------------------------------------------------------

function calculateBuiltin(identified, candles) {
  const definition = identified.definition;
  const closes = candles.map(c => c.close);
  const latestClose = closes[closes.length - 1];

  let value = null;
  let previousValue = null;
  let details = {};
  let requiredCandles = 0;

  if (identified.type === "SMA") {
    const period = extractPeriod(
      definition,
      definition.source,
      20
    );

    if (!period) {
      return {
        valid: false,
        status: "INVALID_PERIOD",
        reason: "SMA period must be a positive integer."
      };
    }

    requiredCandles = period;

    value = sma(closes, period);

    previousValue = closes.length >= period + 1
      ? sma(closes.slice(0, -1), period)
      : null;

    details = { period };
  }

  if (identified.type === "EMA") {
    const period = extractPeriod(
      definition,
      definition.source,
      20
    );

    if (!period) {
      return {
        valid: false,
        status: "INVALID_PERIOD",
        reason: "EMA period must be a positive integer."
      };
    }

    requiredCandles = period;

    const series = emaSeries(closes, period);

    value = series.at(-1) ?? null;
    previousValue = series.at(-2) ?? null;

    details = { period };
  }

  if (identified.type === "RSI") {
    const period = extractPeriod(
      definition,
      definition.source,
      14
    );

    if (!period || period < 2) {
      return {
        valid: false,
        status: "INVALID_PERIOD",
        reason: "RSI period must be at least 2."
      };
    }

    requiredCandles = period + 1;

    value = rsi(closes, period);

    previousValue = closes.length > period + 1
      ? rsi(closes.slice(0, -1), period)
      : null;

    details = {
      period,
      oversold: 30,
      overbought: 70
    };
  }

  if (identified.type === "ATR") {
    const period = extractPeriod(
      definition,
      definition.source,
      14
    );

    if (!period) {
      return {
        valid: false,
        status: "INVALID_PERIOD",
        reason: "ATR period must be a positive integer."
      };
    }

    requiredCandles = period + 1;

    value = atr(candles, period);

    previousValue = candles.length > period + 1
      ? atr(candles.slice(0, -1), period)
      : null;

    details = { period };
  }

  if (identified.type === "MACD") {
    const params = extractMacdSettings(
      definition,
      definition.source
    );

    if (!params.valid) {
      return {
        valid: false,
        status: "INVALID_MACD_PARAMETERS",
        reason: "MACD parameters must be positive integers with slow > fast."
      };
    }

    requiredCandles =
      params.slow + params.signal;

    value = macd(
      closes,
      params.fast,
      params.slow,
      params.signal
    );

    previousValue = closes.length > requiredCandles
      ? macd(
          closes.slice(0, -1),
          params.fast,
          params.slow,
          params.signal
        )
      : null;

    details = params;
  }

  if (candles.length < requiredCandles) {
    return {
      valid: false,
      status: "INSUFFICIENT_DATA",
      requiredCandles,
      availableCandles: candles.length,
      reason: `This indicator requires at least ${requiredCandles} candles.`
    };
  }

  if (value === null || value === undefined) {
    return {
      valid: false,
      status: "CALCULATION_UNAVAILABLE",
      reason: "Indicator calculation returned no valid result."
    };
  }

  return {
    valid: true,
    status: "VALID",
    type: identified.type,
    adapterId: identified.adapterId,
    latestValue: value,
    previousValue,
    marketClose: latestClose,
    details,
    requiredCandles
  };
}

// ----------------------------------------------------------
// Generic result interpretation
// Values are informational, not trading signals.
// ----------------------------------------------------------

function interpretResult(result) {
  if (!result.valid) {
    return {
      direction: "UNAVAILABLE",
      context: "UNAVAILABLE",
      explanation: result.reason
    };
  }

  const type = result.type;
  const value = result.latestValue;
  const close = result.marketClose;

  if (type === "SMA" || type === "EMA") {
    return {
      direction:
        close > value
          ? "ABOVE"
          : close < value
            ? "BELOW"
            : "AT_VALUE",

      context:
        close > value
          ? "PRICE_ABOVE_AVERAGE"
          : close < value
            ? "PRICE_BELOW_AVERAGE"
            : "PRICE_AT_AVERAGE",

      explanation:
        "Price-to-average context only. Not a standalone prediction."
    };
  }

  if (type === "RSI") {
    return {
      direction: "NEUTRAL",
      context:
        value >= 70
          ? "OVERBOUGHT_ZONE"
          : value <= 30
            ? "OVERSOLD_ZONE"
            : "MID_RANGE",

      explanation:
        "RSI zone context. Extreme zones do not guarantee reversal."
    };
  }

  if (type === "MACD") {
    return {
      direction:
        value.histogram > 0
          ? "POSITIVE_HISTOGRAM"
          : value.histogram < 0
            ? "NEGATIVE_HISTOGRAM"
            : "ZERO_HISTOGRAM",

      context:
        value.macd > value.signal
          ? "MACD_ABOVE_SIGNAL"
          : value.macd < value.signal
            ? "MACD_BELOW_SIGNAL"
            : "MACD_EQUAL_SIGNAL",

      explanation:
        "MACD momentum context only. Not a standalone prediction."
    };
  }

  if (type === "ATR") {
    return {
      direction: "NEUTRAL",
      context: "VOLATILITY_MEASURE",
      explanation:
        "ATR measures volatility, not market direction."
    };
  }

  return {
    direction: "NEUTRAL",
    context: "NUMERIC_INDICATOR",
    explanation: "Numeric indicator context only."
  };
}

// ----------------------------------------------------------
// Engine factory
// ----------------------------------------------------------

export function createCustomIndicatorAdapterEngine(
  options = {}
) {
  const config = {
    ...DEFAULT_CONFIG,
    ...(isObject(options.config)
      ? options.config
      : {})
  };

  const adapters = new Map();

  function registerAdapter(adapter) {
    if (!isObject(adapter)) {
      return {
        registered: false,
        status: "INVALID_ADAPTER"
      };
    }

    const id = safeString(adapter.id).trim();

    if (!id) {
      return {
        registered: false,
        status: "MISSING_ADAPTER_ID"
      };
    }

    if (
      typeof adapter.detect !== "function" ||
      typeof adapter.calculate !== "function"
    ) {
      return {
        registered: false,
        status: "INVALID_ADAPTER_INTERFACE",
        reason: "Adapter must provide detect and calculate functions."
      };
    }

    if (adapters.has(id)) {
      return {
        registered: false,
        status: "ADAPTER_ID_EXISTS"
      };
    }

    adapters.set(id, {
      id,
      name: safeString(adapter.name, id),
      version: safeString(adapter.version, "1.0"),
      supportedTypes: Array.isArray(adapter.supportedTypes)
        ? adapter.supportedTypes.slice()
        : ["UNKNOWN"],

      detect: adapter.detect,
      calculate: adapter.calculate,

      // Adapter implementations are trusted engine code,
      // not imported indicator source.
      trustedAdapter: adapter.trustedAdapter === true
    });

    return {
      registered: true,
      status: "REGISTERED",
      adapterId: id
    };
  }

  function unregisterAdapter(id) {
    if (!adapters.has(id)) {
      return {
        removed: false,
        status: "ADAPTER_NOT_FOUND"
      };
    }

    adapters.delete(id);

    return {
      removed: true,
      status: "REMOVED",
      adapterId: id
    };
  }

  function listAdapters() {
    return [
      {
        id: "builtin-sma",
        name: "Simple Moving Average",
        version: VERSION,
        supportedTypes: ["SMA", "FORMULA", "PINE_SCRIPT", "JSON"],
        builtin: true
      },
      {
        id: "builtin-ema",
        name: "Exponential Moving Average",
        version: VERSION,
        supportedTypes: ["EMA", "FORMULA", "PINE_SCRIPT", "JSON"],
        builtin: true
      },
      {
        id: "builtin-rsi",
        name: "Relative Strength Index",
        version: VERSION,
        supportedTypes: ["RSI", "FORMULA", "PINE_SCRIPT", "JSON"],
        builtin: true
      },
      {
        id: "builtin-macd",
        name: "Moving Average Convergence Divergence",
        version: VERSION,
        supportedTypes: ["MACD", "FORMULA", "PINE_SCRIPT", "JSON"],
        builtin: true
      },
      {
        id: "builtin-atr",
        name: "Average True Range",
        version: VERSION,
        supportedTypes: ["ATR", "FORMULA", "PINE_SCRIPT", "JSON"],
        builtin: true
      },
      ...Array.from(adapters.values()).map(adapter => ({
        id: adapter.id,
        name: adapter.name,
        version: adapter.version,
        supportedTypes: adapter.supportedTypes,
        builtin: false
      }))
    ];
  }

  function validateIndicator(indicator) {
    const identified = identifyIndicator(indicator);

    if (!identified.supported) {
      return {
        valid: false,
        validated: false,
        status: identified.status,
        adapterId: null,
        analysisSupported: false,
        reason: identified.reason,
        chartOnlyRecommended: true
      };
    }

    return {
      valid: true,
      validated: true,
      status: "VALIDATED",
      adapterId: identified.adapterId,
      indicatorType: identified.type,
      analysisSupported: true,
      reason:
        `Recognized by safe built-in ${identified.type} adapter. Runtime candle validation is still required.`,
      chartOnlyRecommended: false
    };
  }

  function analyzeIndicator(input = {}) {
    const timeframe = normalizeTimeframe(
      input.timeframe
    );

    if (!timeframe) {
      return {
        status: "WAIT",
        valid: false,
        reason: "Only 1D and 15M timeframes are supported.",
        timeframe: input.timeframe ?? null
      };
    }

    const indicator = input.indicator;

    const identified = identifyIndicator(indicator);

    if (!identified.supported) {
      return {
        status: "UNSUPPORTED",
        valid: false,
        timeframe,
        adapterId: null,
        reason: identified.reason,
        chartOnly: true
      };
    }

    const normalized = normalizeCandles(
      input.candles
    );

    if (!normalized.valid) {
      return {
        status: "WAIT",
        valid: false,
        timeframe,
        adapterId: identified.adapterId,
        reason: normalized.reason,
        validationStatus: normalized.status
      };
    }

    const candles = normalized.candles;

    if (candles.length > config.maximumCandles) {
      return {
        status: "WAIT",
        valid: false,
        timeframe,
        adapterId: identified.adapterId,
        reason:
          `Candle count exceeds configured maximum ${config.maximumCandles}.`
      };
    }

    if (
      candles.length <
      config.minimumCandles
    ) {
      return {
        status: "WAIT",
        valid: false,
        timeframe,
        adapterId: identified.adapterId,
        reason:
          `Minimum runtime candle requirement is ${config.minimumCandles}; received ${candles.length}.`,
        availableCandles: candles.length,
        minimumCandles: config.minimumCandles
      };
    }

    let result;

    try {
      result = calculateBuiltin(
        identified,
        candles
      );
    } catch (error) {
      return {
        status: "CALCULATION_ERROR",
        valid: false,
        timeframe,
        adapterId: identified.adapterId,
        reason: safeString(error?.message)
      };
    }

    if (!result.valid) {
      return {
        status: "WAIT",
        valid: false,
        timeframe,
        adapterId: identified.adapterId,
        reason: result.reason,
        validationStatus: result.status,
        requiredCandles: result.requiredCandles,
        availableCandles: result.availableCandles
      };
    }

    const interpretation =
      interpretResult(result);

    return {
      status: "VALID",
      valid: true,
      timeframe,
      adapterId: result.adapterId,
      indicatorType: result.type,
      indicatorId: safeString(indicator?.id),
      indicatorName: safeString(
        indicator?.name,
        result.type
      ),
      latestValue: result.latestValue,
      previousValue: result.previousValue,
      marketClose: result.marketClose,
      details: result.details,
      interpretation,
      candlesUsed: candles.length,
      requiredCandles: result.requiredCandles,
      sourceExecution: false,
      orderExecution: false,
      disclaimer:
        "Indicator context is educational and historical/live-data dependent. It is not a forecast, trading signal, or financial advice."
    };
  }

  function snapshot() {
    return {
      status: "READY",
      module: MODULE,
      version: VERSION,
      config: {
        ...config,
        supportedTimeframes: [
          ...config.supportedTimeframes
        ]
      },
      builtinAdapterCount: 5,
      customAdapterCount: adapters.size,
      adapters: listAdapters(),
      safety: {
        importedSourceExecuted: false,
        arbitraryCodeExecution: false,
        runtimeDataValidationRequired: true,
        chartOnlyFallback: true,
        orderExecution: false
      }
    };
  }

  return {
    registerAdapter,
    unregisterAdapter,
    listAdapters,
    validateIndicator,
    analyzeIndicator,
    snapshot,

    config: {
      ...config,
      supportedTimeframes: [
        ...config.supportedTimeframes
      ],
      executeImportedCode: false,
      orderExecution: false
    }
  };
}

export const CUSTOM_INDICATOR_ADAPTER_ENGINE_CONFIG = {
  version: VERSION,
  module: MODULE,
  supportedTimeframes: SUPPORTED_TIMEFRAMES,
  builtinAdapters: [
    "SMA",
    "EMA",
    "RSI",
    "MACD",
    "ATR"
  ],
  executeImportedCode: false,
  runtimeValidationRequired: true,
  unsupportedIndicatorsMayBeSaved: true,
  chartOnlyFallback: true,
  orderExecution: false
};
