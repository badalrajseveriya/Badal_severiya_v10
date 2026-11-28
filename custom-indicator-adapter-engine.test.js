// ==========================================================
// BADAL SEVERIYA V12
// CUSTOM INDICATOR ADAPTER ENGINE TESTS
// ==========================================================

import assert from "node:assert/strict";

import {
  createCustomIndicatorAdapterEngine,
  CUSTOM_INDICATOR_ADAPTER_ENGINE_CONFIG
} from "./custom-indicator-adapter-engine.js";

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

function engine(options = {}) {
  return createCustomIndicatorAdapterEngine(options);
}

function candles(count = 60, mode = "up") {
  const output = [];
  let close = 100;

  for (let i = 0; i < count; i++) {
    if (mode === "up") close += 1;
    else if (mode === "down") close -= 1;
    else if (mode === "flat") close = 100;
    else if (mode === "volatile") close += i % 2 ? 4 : -3;

    output.push({
      timestamp: 1700000000000 + i * 900000,
      open: close - 0.25,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1000 + i
    });
  }

  return output;
}

function indicator(type, settings = {}) {
  return {
    id: `test-${type.toLowerCase()}`,
    name: `Test ${type}`,
    type,
    indicatorType: type,
    settings
  };
}

// 1
test("Config: 1D and 15M only, imported code execution disabled", () => {
  assert.deepEqual(
    CUSTOM_INDICATOR_ADAPTER_ENGINE_CONFIG.supportedTimeframes,
    ["1D", "15M"]
  );

  assert.equal(
    CUSTOM_INDICATOR_ADAPTER_ENGINE_CONFIG.executeImportedCode,
    false
  );

  assert.equal(
    CUSTOM_INDICATOR_ADAPTER_ENGINE_CONFIG.orderExecution,
    false
  );
});

// 2
test("Engine initializes in READY state", () => {
  const s = engine().snapshot();

  assert.equal(s.status, "READY");
  assert.equal(s.module, "CUSTOM_INDICATOR_ADAPTER_ENGINE");
  assert.equal(s.version, "12.0");
});

// 3
test("Five builtin adapters are listed", () => {
  const e = engine();
  const s = e.snapshot();

  assert.equal(s.builtinAdapterCount, 5);
  assert.equal(s.customAdapterCount, 0);

  const ids = s.adapters.map(a => a.id);

  assert.ok(ids.includes("builtin-sma"));
  assert.ok(ids.includes("builtin-ema"));
  assert.ok(ids.includes("builtin-rsi"));
  assert.ok(ids.includes("builtin-macd"));
  assert.ok(ids.includes("builtin-atr"));
});

// 4
test("Supported timeframe 1D analysis", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("SMA", { period: 20 }),
    candles: candles(60)
  });

  assert.equal(result.status, "VALID");
  assert.equal(result.valid, true);
  assert.equal(result.timeframe, "1D");
});

// 5
test("Supported timeframe 15M analysis", () => {
  const result = engine().analyzeIndicator({
    timeframe: "15M",
    indicator: indicator("EMA", { period: 10 }),
    candles: candles(60)
  });

  assert.equal(result.status, "VALID");
  assert.equal(result.timeframe, "15M");
});

// 6
test("Unsupported timeframe is WAIT", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1H",
    indicator: indicator("SMA"),
    candles: candles()
  });

  assert.equal(result.status, "WAIT");
  assert.equal(result.valid, false);
});

// 7
test("Timeframe is case normalized", () => {
  const result = engine().analyzeIndicator({
    timeframe: "15m",
    indicator: indicator("SMA"),
    candles: candles()
  });

  assert.equal(result.timeframe, "15M");
  assert.equal(result.valid, true);
});

// 8
test("SMA calculation returns numeric result", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("SMA", { period: 20 }),
    candles: candles(60)
  });

  assert.equal(result.indicatorType, "SMA");
  assert.equal(result.details.period, 20);
  assert.ok(Number.isFinite(result.latestValue));
  assert.ok(Number.isFinite(result.previousValue));
});

// 9
test("SMA price-above-average context is identified", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("SMA", { period: 20 }),
    candles: candles(60, "up")
  });

  assert.equal(
    result.interpretation.context,
    "PRICE_ABOVE_AVERAGE"
  );
});

// 10
test("EMA calculation returns numeric result", () => {
  const result = engine().analyzeIndicator({
    timeframe: "15M",
    indicator: indicator("EMA", { period: 10 }),
    candles: candles(60)
  });

  assert.equal(result.indicatorType, "EMA");
  assert.ok(Number.isFinite(result.latestValue));
  assert.ok(Number.isFinite(result.previousValue));
});

// 11
test("EMA price context is generated", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("EMA", { period: 10 }),
    candles: candles(60)
  });

  assert.ok([
    "PRICE_ABOVE_AVERAGE",
    "PRICE_BELOW_AVERAGE",
    "PRICE_AT_AVERAGE"
  ].includes(result.interpretation.context));
});

// 12
test("RSI returns bounded value between 0 and 100", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("RSI", { period: 14 }),
    candles: candles(60, "volatile")
  });

  assert.equal(result.indicatorType, "RSI");
  assert.ok(result.latestValue >= 0);
  assert.ok(result.latestValue <= 100);
});

// 13
test("RSI strong rising data reaches overbought context", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("RSI", { period: 14 }),
    candles: candles(60, "up")
  });

  assert.equal(result.latestValue, 100);

  assert.equal(
    result.interpretation.context,
    "OVERBOUGHT_ZONE"
  );
});

// 14
test("RSI strong falling data reaches oversold context", () => {
  const result = engine().analyzeIndicator({
    timeframe: "15M",
    indicator: indicator("RSI", { period: 14 }),
    candles: candles(60, "down")
  });

  assert.equal(result.latestValue, 0);

  assert.equal(
    result.interpretation.context,
    "OVERSOLD_ZONE"
  );
});

// 15
test("ATR calculates volatility, not direction", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("ATR", { period: 14 }),
    candles: candles(60, "volatile")
  });

  assert.equal(result.indicatorType, "ATR");
  assert.ok(result.latestValue > 0);
  assert.equal(result.interpretation.direction, "NEUTRAL");

  assert.equal(
    result.interpretation.context,
    "VOLATILITY_MEASURE"
  );
});

// 16
test("MACD calculates line, signal and histogram", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("MACD", {
      fast: 12,
      slow: 26,
      signal: 9
    }),
    candles: candles(100)
  });

  assert.equal(result.indicatorType, "MACD");
  assert.ok(Number.isFinite(result.latestValue.macd));
  assert.ok(Number.isFinite(result.latestValue.signal));
  assert.ok(Number.isFinite(result.latestValue.histogram));
});

// 17
test("MACD histogram context is generated", () => {
  const result = engine().analyzeIndicator({
    timeframe: "15M",
    indicator: indicator("MACD"),
    candles: candles(100)
  });

  assert.ok([
    "POSITIVE_HISTOGRAM",
    "NEGATIVE_HISTOGRAM",
    "ZERO_HISTOGRAM"
  ].includes(result.interpretation.direction));
});

// 18
test("Custom period settings are respected", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("SMA", { period: 5 }),
    candles: candles(60)
  });

  assert.equal(result.details.period, 5);
  assert.equal(result.requiredCandles, 5);
});

// 19
test("Pine-style SMA source is detected safely", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: {
      name: "Pine SMA",
      source: "plot(ta.sma(close, 10))"
    },
    candles: candles(60)
  });

  assert.equal(result.status, "VALID");
  assert.equal(result.indicatorType, "SMA");
  assert.equal(result.details.period, 10);
});

// 20
test("Pine-style EMA source is detected safely", () => {
  const result = engine().analyzeIndicator({
    timeframe: "15M",
    indicator: {
      name: "Pine EMA",
      source: "plot(ta.ema(close, 12))"
    },
    candles: candles(60)
  });

  assert.equal(result.status, "VALID");
  assert.equal(result.indicatorType, "EMA");
  assert.equal(result.details.period, 12);
});

// 21
test("Pine-style RSI source is detected safely", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: {
      name: "Pine RSI",
      source: "plot(ta.rsi(close, 14))"
    },
    candles: candles(60, "volatile")
  });

  assert.equal(result.status, "VALID");
  assert.equal(result.indicatorType, "RSI");
  assert.equal(result.details.period, 14);
});

// 22
test("Pine-style ATR source is detected safely", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: {
      name: "Pine ATR",
      source: "plot(ta.atr(14))"
    },
    candles: candles(60, "volatile")
  });

  assert.equal(result.status, "VALID");
  assert.equal(result.indicatorType, "ATR");
  assert.equal(result.details.period, 14);
});

// 23
test("JSON SMA definition is detected", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: {
      name: "JSON SMA",
      source: JSON.stringify({
        type: "SMA",
        settings: { period: 10 }
      })
    },
    candles: candles(60)
  });

  assert.equal(result.status, "VALID");
  assert.equal(result.indicatorType, "SMA");
  assert.equal(result.details.period, 10);
});

// 24
test("Unknown indicator remains safely unsupported/chart-only", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: {
      name: "Unknown custom",
      source: "some custom script syntax"
    },
    candles: candles(60)
  });

  assert.equal(result.status, "UNSUPPORTED");
  assert.equal(result.valid, false);
  assert.equal(result.chartOnly, true);
});

// 25
test("Validation recommends chart-only for unsupported indicator", () => {
  const result = engine().validateIndicator({
    name: "Unsupported",
    source: "custom unsupported expression"
  });

  assert.equal(result.validated, false);
  assert.equal(result.analysisSupported, false);
  assert.equal(result.chartOnlyRecommended, true);
});

// 26
test("Missing candle array returns WAIT", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("SMA")
  });

  assert.equal(result.status, "WAIT");
  assert.equal(result.valid, false);
});

// 27
test("Empty candle array returns WAIT", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("SMA"),
    candles: []
  });

  assert.equal(result.status, "WAIT");
  assert.equal(result.valid, false);
});

// 28
test("Malformed candle OHLC returns WAIT", () => {
  const data = candles(60);
  data[10].high = data[10].low - 5;

  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("SMA"),
    candles: data
  });

  assert.equal(result.status, "WAIT");
  assert.equal(result.validationStatus, "INVALID_OHLC");
});

// 29
test("Invalid timestamp returns WAIT", () => {
  const data = candles(60);
  data[5].timestamp = "invalid timestamp";

  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("SMA"),
    candles: data
  });

  assert.equal(result.status, "WAIT");
  assert.equal(result.validationStatus, "INVALID_CANDLE_VALUES");
});

// 30
test("Duplicate timestamps are rejected", () => {
  const data = candles(60);
  data[5].timestamp = data[4].timestamp;

  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("SMA"),
    candles: data
  });

  assert.equal(result.status, "WAIT");
  assert.equal(result.validationStatus, "INVALID_CHRONOLOGY");
});

// 31
test("Out-of-order timestamps are rejected", () => {
  const data = candles(60);
  data[10].timestamp = data[9].timestamp - 1;

  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("SMA"),
    candles: data
  });

  assert.equal(result.status, "WAIT");
  assert.equal(result.validationStatus, "INVALID_CHRONOLOGY");
});

// 32
test("Invalid candle object is rejected", () => {
  const data = candles(60);
  data[2] = null;

  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("SMA"),
    candles: data
  });

  assert.equal(result.status, "WAIT");
  assert.equal(result.validationStatus, "INVALID_CANDLE");
});

// 33
test("Minimum candle count is enforced", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("SMA"),
    candles: candles(10)
  });

  assert.equal(result.status, "WAIT");
  assert.equal(result.minimumCandles, 20);
});

// 34
test("Maximum candle count is enforced", () => {
  const e = engine({
    config: { maximumCandles: 50 }
  });

  const result = e.analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("SMA"),
    candles: candles(60)
  });

  assert.equal(result.status, "WAIT");
  assert.match(result.reason, /maximum 50/);
});

// 35
test("Invalid SMA period is rejected", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("SMA", { period: -5 }),
    candles: candles(60)
  });

  assert.equal(result.status, "WAIT");
  assert.equal(result.validationStatus, "INVALID_PERIOD");
});

// 36
test("RSI period below two is rejected", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("RSI", { period: 1 }),
    candles: candles(60)
  });

  assert.equal(result.status, "WAIT");
  assert.equal(result.validationStatus, "INVALID_PERIOD");
});

// 37
test("Invalid MACD settings are rejected", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("MACD", {
      fast: 30,
      slow: 10,
      signal: 9
    }),
    candles: candles(100)
  });

  assert.equal(result.status, "WAIT");

  assert.equal(
    result.validationStatus,
    "INVALID_MACD_PARAMETERS"
  );
});

// 38
test("Imported source is not executed", () => {
  let executed = false;

  const source = `
    globalThis.__indicatorTestExecuted = true;
    plot(ta.sma(close, 20));
  `;

  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: {
      name: "Unsafe import test",
      source
    },
    candles: candles(60)
  });

  assert.equal(result.status, "VALID");
  assert.equal(result.sourceExecution, false);
  assert.equal(executed, false);
  assert.equal(globalThis.__indicatorTestExecuted, undefined);
});

// 39
test("Output clearly states no source/order execution", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("SMA"),
    candles: candles(60)
  });

  assert.equal(result.sourceExecution, false);
  assert.equal(result.orderExecution, false);
  assert.equal(result.disclaimer.includes("not a forecast"), true);
});

// 40
test("Adapter registration accepts valid trusted engine adapter", () => {
  const e = engine();

  const result = e.registerAdapter({
    id: "test-adapter",
    name: "Test Adapter",
    version: "1.0",
    supportedTypes: ["CUSTOM"],
    trustedAdapter: true,
    detect: () => false,
    calculate: () => null
  });

  assert.equal(result.registered, true);
  assert.equal(result.status, "REGISTERED");
  assert.equal(e.snapshot().customAdapterCount, 1);
});

// 41
test("Adapter registration rejects missing ID", () => {
  const result = engine().registerAdapter({
    detect: () => false,
    calculate: () => null
  });

  assert.equal(result.registered, false);
  assert.equal(result.status, "MISSING_ADAPTER_ID");
});

// 42
test("Adapter registration rejects missing methods", () => {
  const result = engine().registerAdapter({
    id: "bad-adapter"
  });

  assert.equal(result.registered, false);
  assert.equal(result.status, "INVALID_ADAPTER_INTERFACE");
});

// 43
test("Duplicate adapter ID is rejected", () => {
  const e = engine();

  const adapter = {
    id: "duplicate",
    detect: () => false,
    calculate: () => null
  };

  assert.equal(e.registerAdapter(adapter).registered, true);

  assert.equal(
    e.registerAdapter(adapter).status,
    "ADAPTER_ID_EXISTS"
  );
});

// 44
test("Adapter unregister works", () => {
  const e = engine();

  e.registerAdapter({
    id: "remove-me",
    detect: () => false,
    calculate: () => null
  });

  assert.equal(
    e.unregisterAdapter("remove-me").removed,
    true
  );

  assert.equal(e.snapshot().customAdapterCount, 0);
});

// 45
test("Unknown adapter unregister returns NOT_FOUND", () => {
  assert.equal(
    engine().unregisterAdapter("unknown").status,
    "ADAPTER_NOT_FOUND"
  );
});

// 46
test("Custom adapters appear in registry", () => {
  const e = engine();

  e.registerAdapter({
    id: "custom-visible",
    name: "Custom Visible Adapter",
    version: "2.0",
    supportedTypes: ["CUSTOM"],
    detect: () => false,
    calculate: () => null
  });

  const ids = e.listAdapters().map(a => a.id);

  assert.ok(ids.includes("custom-visible"));
});

// 47
test("Default configuration uses minimum 20 candles", () => {
  assert.equal(engine().config.minimumCandles, 20);
});

// 48
test("Runtime config can override minimum candles", () => {
  const e = engine({
    config: { minimumCandles: 25 }
  });

  assert.equal(e.config.minimumCandles, 25);
});

// 49
test("Snapshot safety reports imported code execution disabled", () => {
  const s = engine().snapshot();

  assert.equal(s.safety.importedSourceExecuted, false);
  assert.equal(s.safety.arbitraryCodeExecution, false);
  assert.equal(s.safety.orderExecution, false);
  assert.equal(s.safety.runtimeDataValidationRequired, true);
});

// 50
test("Analysis output includes educational disclaimer", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("SMA"),
    candles: candles(60)
  });

  assert.ok(result.disclaimer);
  assert.match(result.disclaimer, /educational/i);
  assert.match(result.disclaimer, /financial advice/i);
});

// 51
test("Unsupported custom source remains unexecuted and safely chart-only", () => {
  const result = engine().analyzeIndicator({
    timeframe: "15M",
    indicator: {
      name: "Unknown Pine",
      source: "indicator('custom')\\nplot(close * 2)"
    },
    candles: candles(60)
  });

  assert.equal(result.status, "UNSUPPORTED");
  assert.equal(result.chartOnly, true);
});

// 52
test("Engine config flags imported code and order execution disabled", () => {
  const e = engine();

  assert.equal(e.config.executeImportedCode, false);
  assert.equal(e.config.orderExecution, false);
});

// 53
test("Empty indicator definition is safely rejected", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: {},
    candles: candles(60)
  });

  assert.equal(result.status, "UNSUPPORTED");
  assert.equal(result.valid, false);
});

// 54
test("Non-object indicator is rejected safely", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: "SMA",
    candles: candles(60)
  });

  assert.equal(result.status, "UNSUPPORTED");
  assert.equal(result.valid, false);
});

// 55
test("Candle normalization supports ISO timestamps", () => {
  const data = candles(60);

  data.forEach((c, i) => {
    c.timestamp = new Date(
      1700000000000 + i * 900000
    ).toISOString();
  });

  const result = engine().analyzeIndicator({
    timeframe: "15M",
    indicator: indicator("SMA"),
    candles: data
  });

  assert.equal(result.status, "VALID");
});

// 56
test("Missing volume defaults to zero", () => {
  const data = candles(60);

  data.forEach(c => {
    delete c.volume;
  });

  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("SMA"),
    candles: data
  });

  assert.equal(result.status, "VALID");
});

// 57
test("Invalid volume is rejected", () => {
  const data = candles(60);
  data[5].volume = -10;

  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("SMA"),
    candles: data
  });

  assert.equal(result.status, "WAIT");
  assert.equal(result.validationStatus, "INVALID_OHLC");
});

// 58
test("Analysis output reports source execution false", () => {
  const result = engine().analyzeIndicator({
    timeframe: "1D",
    indicator: indicator("EMA"),
    candles: candles(60)
  });

  assert.equal(result.sourceExecution, false);
  assert.equal(result.orderExecution, false);
});

// 59
test("Indicator validation confirms supported builtin", () => {
  const result = engine().validateIndicator(
    indicator("EMA", { period: 20 })
  );

  assert.equal(result.validated, true);
  assert.equal(result.analysisSupported, true);
  assert.equal(result.adapterId, "builtin-ema");
});

// 60
test("Final safety check: no execution and no trading actions", () => {
  const s = engine().snapshot();

  assert.equal(s.safety.importedSourceExecuted, false);
  assert.equal(s.safety.arbitraryCodeExecution, false);
  assert.equal(s.safety.orderExecution, false);

  console.log("Safety:", JSON.stringify(s.safety));
});

// 61
test("Untrusted registered adapter cannot run in analysis", () => {
  const e = engine();
  let called = false;

  e.registerAdapter({
    id: "untrusted-runtime",
    name: "Untrusted Runtime",
    supportedTypes: ["CUSTOM"],
    detect: () => true,
    calculate: () => {
      called = true;
      return 123;
    }
  });

  const result = e.analyzeIndicator({
    timeframe: "1D",
    indicator: {
      name: "Untrusted custom",
      source: "unknown syntax"
    },
    candles: candles(60)
  });

  assert.equal(result.status, "UNSUPPORTED");
  assert.equal(result.chartOnly, true);
  assert.equal(called, false);
});

// 62
test("Trusted custom adapter runtime returns validated numeric result", () => {
  const e = engine();

  e.registerAdapter({
    id: "trusted-runtime",
    name: "Trusted Runtime",
    supportedTypes: ["CUSTOM"],
    trustedAdapter: true,

    detect: indicator =>
      indicator?.name === "Trusted custom",

    calculate: ({ candles: normalized, timeframe }) => ({
      latestValue: normalized.at(-1).close + 5,
      previousValue: normalized.at(-2).close + 5,

      details: {
        candleCount: normalized.length,
        timeframe
      }
    })
  });

  const result = e.analyzeIndicator({
    timeframe: "15M",
    indicator: {
      name: "Trusted custom",
      source: "not executed"
    },
    candles: candles(60)
  });

  assert.equal(result.status, "VALID");
  assert.equal(result.indicatorType, "CUSTOM");
  assert.equal(result.adapterId, "trusted-runtime");

  assert.equal(
    result.latestValue,
    candles(60).at(-1).close + 5
  );

  assert.equal(
    result.previousValue,
    candles(60).at(-2).close + 5
  );

  assert.equal(result.details.candleCount, 60);
  assert.equal(result.details.timeframe, "15M");
  assert.equal(result.sourceExecution, false);
  assert.equal(result.orderExecution, false);
});

// 63
test("Trusted custom adapter accepts value field result", () => {
  const e = engine();

  e.registerAdapter({
    id: "value-runtime",
    trustedAdapter: true,

    detect: indicator =>
      indicator?.name === "Value custom",

    calculate: () => ({
      value: 7.5
    })
  });

  const result = e.analyzeIndicator({
    timeframe: "1D",
    indicator: {
      name: "Value custom"
    },
    candles: candles(60)
  });

  assert.equal(result.status, "VALID");
  assert.equal(result.latestValue, 7.5);
  assert.equal(result.previousValue, null);
});

// 64
test("Trusted custom adapter rejects nonfinite output safely", () => {
  const e = engine();

  e.registerAdapter({
    id: "bad-output-runtime",
    trustedAdapter: true,

    detect: indicator =>
      indicator?.name === "Bad output custom",

    calculate: () => ({
      latestValue: NaN
    })
  });

  const result = e.analyzeIndicator({
    timeframe: "1D",
    indicator: {
      name: "Bad output custom"
    },
    candles: candles(60)
  });

  assert.equal(result.status, "WAIT");
  assert.equal(result.valid, false);

  assert.equal(
    result.validationStatus,
    "CUSTOM_ADAPTER_INVALID_RESULT"
  );
});

// 65
test("Trusted custom adapter minimum candle requirement enforced", () => {
  const e = engine();

  e.registerAdapter({
    id: "minimum-runtime",
    trustedAdapter: true,
    minimumCandles: 30,

    detect: indicator =>
      indicator?.name === "Minimum custom",

    calculate: () => 1
  });

  const result = e.analyzeIndicator({
    timeframe: "1D",
    indicator: {
      name: "Minimum custom"
    },
    candles: candles(25)
  });

  assert.equal(result.status, "WAIT");
  assert.equal(result.requiredCandles, 30);
  assert.equal(result.availableCandles, 25);
});

// 66
test("Trusted custom adapter runtime error is handled without crashing", () => {
  const e = engine();

  e.registerAdapter({
    id: "throw-runtime",
    trustedAdapter: true,

    detect: indicator =>
      indicator?.name === "Throw custom",

    calculate: () => {
      throw new Error("adapter test failure");
    }
  });

  const result = e.analyzeIndicator({
    timeframe: "1D",
    indicator: {
      name: "Throw custom"
    },
    candles: candles(60)
  });

  assert.equal(result.status, "CALCULATION_ERROR");
  assert.equal(result.valid, false);
  assert.match(result.reason, /adapter test failure/);
});

// 67
test("Custom adapter receives candle copies, not original references", () => {
  const e = engine();
  let received;

  const sourceCandles = candles(60);

  e.registerAdapter({
    id: "copy-runtime",
    trustedAdapter: true,

    detect: indicator =>
      indicator?.name === "Copy custom",

    calculate: payload => {
      received = payload.candles;

      payload.candles[0].close = -999;

      return 2;
    }
  });

  const result = e.analyzeIndicator({
    timeframe: "1D",
    indicator: {
      name: "Copy custom"
    },
    candles: sourceCandles
  });

  assert.equal(result.status, "VALID");
  assert.notEqual(received, sourceCandles);
  assert.notEqual(received[0], sourceCandles[0]);
  assert.notEqual(sourceCandles[0].close, -999);
});

console.log(`\nTOTAL TESTS PASSED: ${passed}/67`);
assert.equal(passed, 67);

console.log("CUSTOM INDICATOR ADAPTER ENGINE TESTS: ALL PASSED");