
// ==========================================================
// BADAL SEVERIYA V12
// CUSTOM INDICATOR ANALYSIS BRIDGE TESTS
// VERSION 12.1
// ==========================================================

import assert from "node:assert/strict";

import {
  createCustomIndicatorAnalysisBridge,
  CUSTOM_INDICATOR_ANALYSIS_BRIDGE_CONFIG
} from "./custom-indicator-analysis-bridge.js";

import {
  createCustomIndicatorManager
} from "./custom-indicator-manager.js";

import {
  createCustomIndicatorAdapterEngine
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

function candles(count = 80, mode = "up") {
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

function createReadyBridge(type = "SMA", settings = {}) {
  const manager = createCustomIndicatorManager();

  const saved = manager.saveIndicator({
    name: `Bridge ${type}`,
    type,
    indicatorType: type,
    source: type,
    settings
  });

  assert.equal(saved.saved, true);

  manager.setMode(
    saved.indicator.id,
    "ANALYSIS_ENABLED"
  );

  const adapterEngine =
    createCustomIndicatorAdapterEngine();

  const bridge = createCustomIndicatorAnalysisBridge({
    manager,
    adapterEngine
  });

  const validation = bridge.validateIndicator(
    saved.indicator.id
  );

  assert.equal(validation.validated, true);
  assert.equal(validation.analysisActive, true);

  return {
    bridge,
    manager,
    adapterEngine,
    indicator: manager.getIndicator(saved.indicator.id)
  };
}

function createMockBridge(runtime, type = "SMA") {
  const manager = createCustomIndicatorManager();

  const saved = manager.saveIndicator({
    name: `Mock ${type}`,
    type,
    indicatorType: type,
    source: type,
    settings: { period: 10 }
  });

  manager.setMode(
    saved.indicator.id,
    "ANALYSIS_ENABLED"
  );

  const adapterEngine = {
    validateIndicator: () => ({
      valid: true,
      validated: true,
      status: "VALIDATED",
      adapterId: "test-adapter",
      indicatorType: type,
      analysisSupported: true,
      reason: "Test adapter validation"
    }),

    analyzeIndicator: () => ({
      ...runtime
    })
  };

  const bridge = createCustomIndicatorAnalysisBridge({
    manager,
    adapterEngine
  });

  const validation = bridge.validateIndicator(
    saved.indicator.id
  );

  assert.equal(validation.validated, true);

  return {
    bridge,
    manager,
    indicator: manager.getIndicator(saved.indicator.id)
  };
}

function validRuntime(overrides = {}) {
  return {
    status: "VALID",
    valid: true,
    timeframe: "1D",
    adapterId: "test-adapter",
    indicatorType: "SMA",
    latestValue: 110,
    previousValue: 109,
    marketClose: 112,
    details: { period: 10 },
    interpretation: {
      direction: "NEUTRAL",
      context: "PRICE_ABOVE_AVERAGE"
    },
    candlesUsed: 80,
    requiredCandles: 10,
    sourceExecution: false,
    orderExecution: false,
    ...overrides
  };
}

// 1
test("Bridge config supports only 1D and 15M", () => {
  assert.deepEqual(
    CUSTOM_INDICATOR_ANALYSIS_BRIDGE_CONFIG.supportedTimeframes,
    ["1D", "15M"]
  );

  assert.equal(
    CUSTOM_INDICATOR_ANALYSIS_BRIDGE_CONFIG.maximumIndicators,
    3
  );
});

// 2
test("Bridge config disables imported code and order execution", () => {
  assert.equal(
    CUSTOM_INDICATOR_ANALYSIS_BRIDGE_CONFIG.importedSourceExecution,
    false
  );

  assert.equal(
    CUSTOM_INDICATOR_ANALYSIS_BRIDGE_CONFIG.arbitraryCodeExecution,
    false
  );

  assert.equal(
    CUSTOM_INDICATOR_ANALYSIS_BRIDGE_CONFIG.orderExecution,
    false
  );
});

// 3
test("Bridge initializes with three empty indicator slots", () => {
  const bridge = createCustomIndicatorAnalysisBridge();
  const snapshot = bridge.snapshot();

  assert.equal(snapshot.status, "READY");
  assert.equal(snapshot.version, "12.1");
  assert.equal(snapshot.slots.maximum, 3);
  assert.equal(snapshot.slots.occupied, 0);
  assert.equal(snapshot.slots.available, 3);
});

// 4
test("Bridge lists saved indicators from manager", () => {
  const manager = createCustomIndicatorManager();

  manager.saveIndicator({
    name: "Saved RSI",
    type: "RSI",
    source: "RSI"
  });

  const bridge = createCustomIndicatorAnalysisBridge({
    manager
  });

  const list = bridge.listIndicators();

  assert.equal(list.length, 3);
  assert.equal(list[0].occupied, true);
  assert.equal(list[0].indicator.name, "Saved RSI");
});

// 5
test("Missing indicator validation returns NOT_FOUND", () => {
  const bridge = createCustomIndicatorAnalysisBridge();

  const result = bridge.validateIndicator("missing-id");

  assert.equal(result.validated, false);
  assert.equal(result.status, "NOT_FOUND");
});

// 6
test("Unsupported indicator remains outside analysis", () => {
  const manager = createCustomIndicatorManager();

  const saved = manager.saveIndicator({
    name: "Unknown Custom",
    type: "UNKNOWN",
    source: "my unknown formula"
  });

  manager.setMode(
    saved.indicator.id,
    "ANALYSIS_ENABLED"
  );

  const bridge = createCustomIndicatorAnalysisBridge({
    manager
  });

  const validation = bridge.validateIndicator(
    saved.indicator.id
  );

  assert.equal(validation.validated, false);

  const result = bridge.analyzeTimeframe({
    timeframe: "1D",
    candles: candles()
  });

  assert.equal(result.validCount, 0);
  assert.equal(
    result.indicatorResults[0].included,
    false
  );
});

// 7
test("Built-in SMA is validated and included in analysis", () => {
  const { bridge } = createReadyBridge(
    "SMA",
    { period: 20 }
  );

  const result = bridge.analyzeTimeframe({
    timeframe: "1D",
    candles: candles()
  });

  assert.equal(result.status, "VALID");
  assert.equal(result.validCount, 1);
  assert.equal(result.analysisContext[0].indicatorType, "SMA");
  assert.ok(Number.isFinite(result.analysisContext[0].latestValue));
});

// 8
test("Built-in EMA is validated and included in analysis", () => {
  const { bridge } = createReadyBridge(
    "EMA",
    { period: 10 }
  );

  const result = bridge.analyzeTimeframe({
    timeframe: "15M",
    candles: candles()
  });

  assert.equal(result.validCount, 1);
  assert.equal(result.analysisContext[0].timeframe, "15M");
  assert.equal(result.analysisContext[0].indicatorType, "EMA");
});

// 9
test("Built-in RSI returns bounded numeric context", () => {
  const { bridge } = createReadyBridge(
    "RSI",
    { period: 14 }
  );

  const result = bridge.analyzeTimeframe({
    timeframe: "1D",
    candles: candles(80, "volatile")
  });

  const value = result.analysisContext[0].latestValue;

  assert.equal(result.validCount, 1);
  assert.ok(value >= 0);
  assert.ok(value <= 100);
});

// 10
test("Built-in ATR returns positive volatility value", () => {
  const { bridge } = createReadyBridge(
    "ATR",
    { period: 14 }
  );

  const result = bridge.analyzeTimeframe({
    timeframe: "15M",
    candles: candles(80, "volatile")
  });

  assert.equal(result.validCount, 1);
  assert.ok(result.analysisContext[0].latestValue > 0);
});

// 11
test("Built-in MACD is normalized to numeric histogram", () => {
  const { bridge } = createReadyBridge(
    "MACD",
    {
      fast: 12,
      slow: 26,
      signal: 9
    }
  );

  const result = bridge.analyzeTimeframe({
    timeframe: "1D",
    candles: candles(100, "volatile")
  });

  assert.equal(result.validCount, 1);

  const context = result.analysisContext[0];

  assert.equal(context.indicatorType, "MACD");
  assert.ok(Number.isFinite(context.latestValue));

  assert.ok(context.values);
  assert.ok(Number.isFinite(context.values.macd));
  assert.ok(Number.isFinite(context.values.signal));
  assert.ok(Number.isFinite(context.values.histogram));

  assert.equal(
    context.latestValue,
    context.values.histogram
  );
});

// 12
test("MACD previous values remain safely separated", () => {
  const { bridge } = createReadyBridge(
    "MACD",
    {
      fast: 12,
      slow: 26,
      signal: 9
    }
  );

  const result = bridge.analyzeTimeframe({
    timeframe: "15M",
    candles: candles(100, "volatile")
  });

  const context = result.analysisContext[0];

  assert.ok(context);
  assert.ok(context.values);

  if (context.previousValues !== null) {
    assert.ok(Number.isFinite(context.previousValues.macd));
    assert.ok(Number.isFinite(context.previousValues.signal));
    assert.ok(Number.isFinite(context.previousValues.histogram));
  }
});

// 13
test("Unsupported 1H timeframe returns WAIT-style unavailable result", () => {
  const { bridge } = createReadyBridge("SMA");

  const result = bridge.analyzeTimeframe({
    timeframe: "1H",
    candles: candles()
  });

  assert.equal(result.status, "UNSUPPORTED_TIMEFRAME");
  assert.equal(result.valid, false);
  assert.equal(result.validCount, 0);
});

// 14
test("Missing candles return WAITING_FOR_DATA", () => {
  const { bridge } = createReadyBridge("SMA");

  const result = bridge.analyzeTimeframe({
    timeframe: "1D",
    candles: []
  });

  assert.equal(result.status, "WAITING_FOR_DATA");
  assert.equal(result.valid, false);
});

// 15
test("Missing marketClose is rejected", () => {
  const runtime = validRuntime({
    marketClose: undefined
  });

  const { bridge } = createMockBridge(runtime);

  const result = bridge.analyzeTimeframe({
    timeframe: "1D",
    candles: candles()
  });

  assert.equal(result.validCount, 0);
  assert.equal(
    result.indicatorResults[0].included,
    false
  );

  assert.equal(
    result.indicatorResults[0].runtimeValidation.finiteMarketClose,
    false
  );
});

// 16
test("Non-finite marketClose is rejected", () => {
  const runtime = validRuntime({
    marketClose: NaN
  });

  const { bridge } = createMockBridge(runtime);

  const result = bridge.analyzeTimeframe({
    timeframe: "1D",
    candles: candles()
  });

  assert.equal(result.validCount, 0);
});

// 17
test("Mismatched adapter ID is rejected", () => {
  const runtime = validRuntime({
    adapterId: "wrong-adapter"
  });

  const { bridge } = createMockBridge(runtime);

  const result = bridge.analyzeTimeframe({
    timeframe: "1D",
    candles: candles()
  });

  assert.equal(result.validCount, 0);
  assert.equal(
    result.indicatorResults[0].runtimeValidation.adapterMatch,
    false
  );
});

// 18
test("Mismatched timeframe is rejected", () => {
  const runtime = validRuntime({
    timeframe: "15M"
  });

  const { bridge } = createMockBridge(runtime);

  const result = bridge.analyzeTimeframe({
    timeframe: "1D",
    candles: candles()
  });

  assert.equal(result.validCount, 0);
  assert.equal(
    result.indicatorResults[0].runtimeValidation.timeframeMatch,
    false
  );
});

// 19
test("MACD with invalid object values is rejected", () => {
  const runtime = validRuntime({
    indicatorType: "MACD",
    latestValue: {
      macd: 1.5,
      signal: 1.1,
      histogram: NaN
    }
  });

  const { bridge } = createMockBridge(runtime, "MACD");

  const result = bridge.analyzeTimeframe({
    timeframe: "1D",
    candles: candles()
  });

  assert.equal(result.validCount, 0);
  assert.equal(
    result.indicatorResults[0].runtimeValidation.macdValuesValid,
    false
  );
});

// 20
test("Imported source and order execution remain disabled in output", () => {
  const { bridge } = createReadyBridge("SMA");

  const result = bridge.analyzeBothTimeframes({
    candles1D: candles(80),
    candles15M: candles(80)
  });

  assert.equal(
    result.safety.importedSourceExecuted,
    false
  );

  assert.equal(
    result.safety.arbitraryCodeExecution,
    false
  );

  assert.equal(
    result.safety.orderExecution,
    false
  );

  assert.equal(
    result.safety.timeframeFallback,
    false
  );

  assert.equal(result.timeframes["1D"].validCount, 1);
  assert.equal(result.timeframes["15M"].validCount, 1);
});

console.log("");
console.log(`CUSTOM INDICATOR ANALYSIS BRIDGE: ${passed}/20 TESTS PASSED`);

assert.equal(passed, 20);

console.log("CUSTOM INDICATOR ANALYSIS BRIDGE TESTS: ALL PASSED");
