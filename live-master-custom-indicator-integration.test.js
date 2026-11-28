
// ==========================================================
// BADAL SEVERIYA V12
// LIVE MASTER + CUSTOM INDICATOR INTEGRATION TESTS
// ==========================================================

import assert from "node:assert/strict";

import {
  createLiveMasterCustomIndicatorIntegration,
  LIVE_MASTER_CUSTOM_INDICATOR_INTEGRATION_CONFIG
} from "./live-master-custom-indicator-integration.js";

import {
  createCustomIndicatorManager
} from "./custom-indicator-manager.js";

import {
  createCustomIndicatorAdapterEngine
} from "./custom-indicator-adapter-engine.js";

import {
  createCustomIndicatorAnalysisBridge
} from "./custom-indicator-analysis-bridge.js";

const NOW = Date.UTC(2026, 10, 28, 10, 0, 0);

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

function makeCandles(direction = "BULLISH", count = 100) {
  const output = [];

  for (let i = 0; i < count; i++) {
    const trend =
      direction === "BULLISH"
        ? i * 2
        : direction === "BEARISH"
          ? -i * 2
          : 0;

    const close = 25000 + trend;

    let open =
      direction === "BEARISH"
        ? close + 0.5
        : close - 0.5;

    let high = Math.max(open, close) + 0.2;
    let low = Math.min(open, close) - 0.2;

    if (i === count - 1 && direction === "BULLISH") {
      open = close - 0.5;
      high = close + 0.2;
      low = close - 3;
    }

    if (i === count - 1 && direction === "BEARISH") {
      open = close + 0.5;
      high = close + 3;
      low = close - 0.2;
    }

    output.push({
      timestamp: NOW - (count - 1 - i) * 60 * 1000,
      open,
      high,
      low,
      close,
      volume: i === count - 1 ? 3000 : 1000
    });
  }

  return output;
}

function createReadyIntegration(type = "SMA") {
  const manager = createCustomIndicatorManager();

  const saved = manager.saveIndicator({
    name: `Integration ${type}`,
    type,
    indicatorType: type,
    source: type,
    settings: { period: 10 }
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

  const integration =
    createLiveMasterCustomIndicatorIntegration({
      analysisBridge: bridge
    });

  return {
    integration,
    bridge,
    manager,
    indicator: manager.getIndicator(saved.indicator.id)
  };
}

function createIntegrationWithoutIndicators() {
  const bridge = createCustomIndicatorAnalysisBridge();

  return createLiveMasterCustomIndicatorIntegration({
    analysisBridge: bridge
  });
}

// 1. Configuration contract
test("Config supports only 1D and 15M", () => {
  assert.deepEqual(
    LIVE_MASTER_CUSTOM_INDICATOR_INTEGRATION_CONFIG.supportedTimeframes,
    ["1D", "15M"]
  );

  assert.equal(
    LIVE_MASTER_CUSTOM_INDICATOR_INTEGRATION_CONFIG.maximumCustomIndicators,
    3
  );
});

// 2. Imported code and orders disabled
test("Unsafe execution remains disabled", () => {
  assert.equal(
    LIVE_MASTER_CUSTOM_INDICATOR_INTEGRATION_CONFIG.importedSourceExecution,
    false
  );

  assert.equal(
    LIVE_MASTER_CUSTOM_INDICATOR_INTEGRATION_CONFIG.arbitraryCodeExecution,
    false
  );

  assert.equal(
    LIVE_MASTER_CUSTOM_INDICATOR_INTEGRATION_CONFIG.orderExecution,
    false
  );
});

// 3. Integration initializes
test("Integration initializes with connected modules", () => {
  const integration = createIntegrationWithoutIndicators();
  const snapshot = integration.snapshot();

  assert.equal(snapshot.status, "READY");
  assert.equal(snapshot.connectedModules.liveMasterAnalyzer, true);
  assert.equal(snapshot.connectedModules.customIndicatorAnalysisBridge, true);
});

// 4. Valid 1D feed
test("Fresh 1D feed produces READY live analysis", () => {
  const { integration } = createReadyIntegration();

  const result = integration.analyzeTimeframe({
    timeframe: "1D",
    candles: makeCandles(),
    now: NOW
  });

  assert.equal(result.status, "READY");
  assert.equal(result.timeframe, "1D");
  assert.equal(result.liveAnalysis.feed.fresh, true);
  assert.equal(result.liveAnalysis.market.close, 25198);
});

// 5. Valid 15M feed
test("Fresh 15M feed produces READY live analysis", () => {
  const { integration } = createReadyIntegration();

  const result = integration.analyzeTimeframe({
    timeframe: "15M",
    candles: makeCandles(),
    now: NOW
  });

  assert.equal(result.status, "READY");
  assert.equal(result.timeframe, "15M");
  assert.equal(result.liveAnalysis.feed.fresh, true);
});

// 6. Unsupported timeframe
test("1H timeframe is blocked without fallback", () => {
  const { integration } = createReadyIntegration();

  const result = integration.analyzeTimeframe({
    timeframe: "1H",
    candles: makeCandles(),
    now: NOW
  });

  assert.equal(result.status, "UNSUPPORTED_TIMEFRAME");
  assert.equal(result.direction, "WAIT");
  assert.equal(result.safety.timeframeFallback, false);
});

// 7. Stale feed blocks custom context
test("Stale live feed blocks custom indicators", () => {
  const { integration } = createReadyIntegration();

  const result = integration.analyzeTimeframe({
    timeframe: "15M",
    candles: makeCandles(),
    now: NOW + 60 * 60 * 1000,
    maxAgeMs: 10 * 60 * 1000
  });

  assert.equal(result.status, "WAIT");
  assert.equal(result.direction, "WAIT");
  assert.equal(result.customIndicators.validCount, 0);
  assert.equal(result.customIndicators.status, "WAIT_LIVE_FEED");
});

// 8. Missing timestamps block live context
test("Missing candle timestamps block custom context", () => {
  const { integration } = createReadyIntegration();
  const candles = makeCandles();

  candles.forEach(candle => {
    delete candle.timestamp;
  });

  const result = integration.analyzeTimeframe({
    timeframe: "1D",
    candles,
    now: NOW
  });

  assert.equal(result.status, "WAIT");
  assert.equal(result.direction, "WAIT");
  assert.equal(result.customIndicators.validCount, 0);
});

// 9. Insufficient candles
test("Insufficient candles return WAIT", () => {
  const { integration } = createReadyIntegration();

  const result = integration.analyzeTimeframe({
    timeframe: "15M",
    candles: makeCandles("BULLISH", 30),
    now: NOW
  });

  assert.equal(result.status, "WAIT");
  assert.equal(result.direction, "WAIT");
});

// 10. Valid custom indicator context
test("Validated SMA context is connected", () => {
  const { integration } = createReadyIntegration("SMA");

  const result = integration.analyzeTimeframe({
    timeframe: "1D",
    candles: makeCandles(),
    now: NOW
  });

  assert.equal(result.status, "READY");
  assert.equal(result.customIndicators.valid, true);
  assert.equal(result.customIndicators.validCount, 1);
  assert.equal(result.customIndicators.contextAvailable, true);
  assert.equal(
    result.customIndicators.analysisContext[0].indicatorType,
    "SMA"
  );
});

// 11. Market close matches Live Master
test("Custom context must match exact live market close", () => {
  const { integration } = createReadyIntegration("SMA");

  const result = integration.analyzeTimeframe({
    timeframe: "15M",
    candles: makeCandles(),
    now: NOW
  });

  assert.equal(
    result.customIndicators.marketValidation.liveMarketClose,
    result.liveAnalysis.market.close
  );

  assert.equal(
    result.customIndicators.marketValidation
      .allAcceptedIndicatorsMatchLiveMarket,
    true
  );
});

// 12. Original eight rules preserved
test("Custom indicators do not replace original eight rules", () => {
  const { integration } = createReadyIntegration("EMA");

  const result = integration.analyzeTimeframe({
    timeframe: "1D",
    candles: makeCandles(),
    now: NOW
  });

  assert.equal(result.liveAnalysis.rules.length, 8);
  assert.equal(result.integration.originalEightRulesPreserved, true);
  assert.equal(
    result.integration.customIndicatorsChangeEightRulePercentages,
    false
  );
});

// 13. Bearish direction is retained
test("Bearish Live Master direction is retained", () => {
  const { integration } = createReadyIntegration();

  const result = integration.analyzeTimeframe({
    timeframe: "1D",
    candles: makeCandles("BEARISH"),
    now: NOW
  });

  assert.equal(result.status, "READY");
  assert.equal(result.direction, "BEARISH");
});

// 14. Independent timeframe execution
test("1D and 15M run independently", () => {
  const { integration } = createReadyIntegration();

  const result = integration.analyzeBothTimeframes({
    candles1D: makeCandles(),
    candles15M: makeCandles(),
    now: NOW
  });

  assert.equal(result.status, "READY");
  assert.equal(result.timeframes["1D"].status, "READY");
  assert.equal(result.timeframes["15M"].status, "READY");
  assert.equal(result.summary.independentExecution, true);
  assert.equal(result.summary.timeframeFallback, false);
});

// 15. One timeframe may wait independently
test("Missing 15M does not block valid 1D", () => {
  const { integration } = createReadyIntegration();

  const result = integration.analyzeBothTimeframes({
    candles1D: makeCandles(),
    candles15M: [],
    now: NOW
  });

  assert.equal(result.status, "PARTIAL");
  assert.equal(result.timeframes["1D"].status, "READY");
  assert.equal(result.timeframes["15M"].status, "WAIT");
});

// 16. No indicators does not break Live Master
test("Live Master remains READY with no custom indicators", () => {
  const integration = createIntegrationWithoutIndicators();

  const result = integration.analyzeTimeframe({
    timeframe: "1D",
    candles: makeCandles(),
    now: NOW
  });

  assert.equal(result.status, "READY");
  assert.equal(result.customIndicators.validCount, 0);
  assert.equal(result.integration.customContextAvailable, false);
});

// 17. Safety contract
test("No imported source or order execution", () => {
  const { integration } = createReadyIntegration();

  const result = integration.analyzeBothTimeframes({
    candles1D: makeCandles(),
    candles15M: makeCandles(),
    now: NOW
  });

  assert.equal(result.safety.importedSourceExecuted, false);
  assert.equal(result.safety.arbitraryCodeExecution, false);
  assert.equal(result.safety.orderExecution, false);
  assert.equal(result.safety.timeframeFallback, false);
});

// 18. Snapshot contract
test("Snapshot reports three-slot custom indicator limit", () => {
  const { integration } = createReadyIntegration();

  const snapshot = integration.snapshot();

  assert.equal(snapshot.integrationRules.maximumCustomIndicators, 3);
  assert.equal(snapshot.integrationRules.originalEightRulesPreserved, true);
  assert.equal(snapshot.integrationRules.missingDataMeansWait, true);
});

// 19. Invalid candle input safely waits
test("Invalid candle input returns WAIT without custom context", () => {
  const { integration } = createReadyIntegration();
  const candles = makeCandles();

  candles[10].high = candles[10].low - 1;

  const result = integration.analyzeTimeframe({
    timeframe: "1D",
    candles,
    now: NOW
  });

  assert.equal(result.status, "WAIT");
  assert.equal(result.direction, "WAIT");
  assert.equal(result.customIndicators.validCount, 0);
});

// 20. Educational disclaimer
test("Output contains educational disclaimer", () => {
  const { integration } = createReadyIntegration();

  const result = integration.analyzeTimeframe({
    timeframe: "15M",
    candles: makeCandles(),
    now: NOW
  });

  assert.match(result.disclaimer, /Educational/);
  assert.match(result.disclaimer, /Not a forecast/);
});

// Final result
console.log("");
console.log(`LIVE MASTER + CUSTOM INDICATOR INTEGRATION: ${passed}/20 TESTS PASSED`);

assert.equal(passed, 20);

console.log("LIVE MASTER + CUSTOM INDICATOR INTEGRATION TESTS: ALL PASSED");
