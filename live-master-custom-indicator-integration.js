
/* ==========================================================
   BADAL SEVERIYA V12
   LIVE MASTER + CUSTOM INDICATOR INTEGRATION
   Version 12.0

   - Connects Live Master Analyzer with Custom Indicator Bridge.
   - 1D and 15M are analyzed independently.
   - Custom indicators require validated runtime context.
   - Stale or invalid live data blocks custom live context.
   - Custom indicators do not silently alter the original
     eight-rule evidence percentages.
   - No 1H fallback.
   - No imported source execution.
   - No order execution.
   ========================================================== */

import {
  analyzeLiveMaster
} from "./live-master-analysis.js";

import {
  createCustomIndicatorAnalysisBridge
} from "./custom-indicator-analysis-bridge.js";

const VERSION = "12.0";
const MODULE = "LIVE_MASTER_CUSTOM_INDICATOR_INTEGRATION";

const SUPPORTED_TIMEFRAMES = ["1D", "15M"];

const DISCLAIMER =
  "Educational live market context only. " +
  "Not a forecast, trading signal, or financial advice.";

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeString(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  try {
    return String(value);
  } catch {
    return fallback;
  }
}

function unavailableCustomContext(
  status,
  reason,
  timeframe
) {
  return {
    status,
    valid: false,
    module: MODULE,
    timeframe,
    indicatorResults: [],
    analysisContext: [],
    validCount: 0,
    rejectedCount: 0,
    contextAvailable: false,
    reason,
    safety: {
      importedSourceExecuted: false,
      arbitraryCodeExecution: false,
      orderExecution: false
    },
    disclaimer: DISCLAIMER
  };
}

function validateBridge(bridge) {
  if (
    !bridge ||
    typeof bridge.analyzeTimeframe !== "function" ||
    typeof bridge.snapshot !== "function"
  ) {
    throw new Error(
      "A compatible Custom Indicator Analysis Bridge is required."
    );
  }

  return true;
}

function validateContextAgainstLiveMarket(
  customResult,
  liveResult,
  timeframe
) {
  if (
    !isObject(customResult) ||
    customResult.valid !== true ||
    customResult.timeframe !== timeframe ||
    !Array.isArray(customResult.analysisContext) ||
    !Array.isArray(customResult.indicatorResults)
  ) {
    return unavailableCustomContext(
      "INVALID_BRIDGE_RESULT",
      "Custom indicator bridge returned an invalid result.",
      timeframe
    );
  }

  const liveClose = Number(liveResult?.market?.close);

  if (
    !Number.isFinite(liveClose) ||
    liveClose <= 0
  ) {
    return unavailableCustomContext(
      "WAIT_MARKET_PRICE",
      "A valid live market close is unavailable.",
      timeframe
    );
  }

  const acceptedContext = [];
  const rejectedIds = new Set();

  for (const item of customResult.analysisContext) {
    if (
      !isObject(item) ||
      item.timeframe !== timeframe ||
      !Number.isFinite(Number(item.marketClose)) ||
      Number(item.marketClose) <= 0
    ) {
      if (item?.indicatorId) {
        rejectedIds.add(item.indicatorId);
      }

      continue;
    }

    const customClose = Number(item.marketClose);

    // The custom adapter and Live Master must use
    // the exact same latest candle close.
    if (customClose !== liveClose) {
      rejectedIds.add(item.indicatorId);
      continue;
    }

    acceptedContext.push({
      ...item,
      marketClose: liveClose,
      sourceExecution: false,
      orderExecution: false
    });
  }

  const indicatorResults =
    customResult.indicatorResults.map(result => {
      if (rejectedIds.has(result.indicatorId)) {
        return {
          ...result,
          status: "MARKET_CLOSE_MISMATCH",
          valid: false,
          included: false,
          reason:
            "Custom indicator market close does not match Live Master."
        };
      }

      return { ...result };
    });

  const acceptedIds = new Set(
    acceptedContext.map(item => item.indicatorId)
  );

  const finalResults = indicatorResults.map(result => {
    if (
      result.included === true &&
      !acceptedIds.has(result.indicatorId)
    ) {
      return {
        ...result,
        status: "CONTEXT_REJECTED",
        valid: false,
        included: false
      };
    }

    return result;
  });

  return {
    status:
      acceptedContext.length > 0
        ? "VALID"
        : "NO_VALID_INDICATORS",

    valid: true,
    module: MODULE,
    version: VERSION,
    timeframe,

    indicatorResults: finalResults,
    analysisContext: acceptedContext,

    totalIndicators: finalResults.length,
    validCount: acceptedContext.length,

    rejectedCount:
      finalResults.filter(
        result => result.included !== true
      ).length,

    contextAvailable: acceptedContext.length > 0,

    marketValidation: {
      liveMarketClose: liveClose,
      allAcceptedIndicatorsMatchLiveMarket:
        acceptedContext.every(
          item => item.marketClose === liveClose
        )
    },

    safety: {
      importedSourceExecuted: false,
      arbitraryCodeExecution: false,
      orderExecution: false
    },

    disclaimer: DISCLAIMER
  };
}

export function createLiveMasterCustomIndicatorIntegration(
  options = {}
) {
  const bridge =
    options.analysisBridge ||
    createCustomIndicatorAnalysisBridge(
      options.bridgeOptions || {}
    );

  validateBridge(bridge);

  function analyzeTimeframe(input = {}) {
    const timeframe = input.timeframe;

    if (!SUPPORTED_TIMEFRAMES.includes(timeframe)) {
      return {
        status: "UNSUPPORTED_TIMEFRAME",
        timeframe: timeframe ?? null,
        direction: "WAIT",
        liveAnalysis: null,

        customIndicators:
          unavailableCustomContext(
            "UNSUPPORTED_TIMEFRAME",
            "Only 1D and 15M are supported.",
            timeframe ?? null
          ),

        safety: {
          timeframeFallback: false,
          importedSourceExecuted: false,
          orderExecution: false
        },

        disclaimer: DISCLAIMER
      };
    }

    let liveResult;

    try {
      liveResult = analyzeLiveMaster({
        timeframe,
        candles: input.candles,
        now: input.now,
        maxAgeMs: input.maxAgeMs,
        externalEvidence: input.externalEvidence
      });
    } catch (error) {
      return {
        status: "ERROR",
        timeframe,
        direction: "WAIT",
        liveAnalysis: null,

        customIndicators:
          unavailableCustomContext(
            "LIVE_ANALYSIS_ERROR",
            safeString(error?.message),
            timeframe
          ),

        safety: {
          timeframeFallback: false,
          importedSourceExecuted: false,
          orderExecution: false
        },

        disclaimer: DISCLAIMER
      };
    }

    // Custom live context is permitted only when
    // Live Master confirms a fresh, valid live feed.
    if (
      !isObject(liveResult) ||
      liveResult.feed?.fresh !== true ||
      liveResult.direction === "WAIT" ||
      !isObject(liveResult.market)
    ) {
      return {
        status: "WAIT",
        timeframe,
        direction: "WAIT",
        liveAnalysis: liveResult,

        customIndicators:
          unavailableCustomContext(
            "WAIT_LIVE_FEED",
            liveResult?.feed?.reason ||
              liveResult?.error ||
              "Live Master data is not valid and fresh.",
            timeframe
          ),

        safety: {
          timeframeFallback: false,
          importedSourceExecuted: false,
          orderExecution: false
        },

        disclaimer: DISCLAIMER
      };
    }

    let customRaw;

    try {
      customRaw = bridge.analyzeTimeframe({
        timeframe,
        candles: input.candles
      });
    } catch (error) {
      customRaw = null;
    }

    const customIndicators =
      customRaw === null
        ? unavailableCustomContext(
            "BRIDGE_ERROR",
            "Custom Indicator Bridge analysis failed.",
            timeframe
          )
        : validateContextAgainstLiveMarket(
            customRaw,
            liveResult,
            timeframe
          );

    return {
      status: "READY",
      module: MODULE,
      version: VERSION,
      timeframe,

      direction: liveResult.direction,

      liveAnalysis: liveResult,

      customIndicators,

      integration: {
        liveFeedFresh: true,
        customBridgeConnected: true,
        customContextAvailable:
          customIndicators.contextAvailable === true,

        originalEightRulesPreserved:
          liveResult.rules?.length === 8,

        customIndicatorsChangeEightRulePercentages:
          false
      },

      safety: {
        timeframeFallback: false,
        importedSourceExecuted: false,
        arbitraryCodeExecution: false,
        orderExecution: false
      },

      disclaimer: DISCLAIMER
    };
  }

  function analyzeBothTimeframes(input = {}) {
    const daily = analyzeTimeframe({
      timeframe: "1D",
      candles: input.candles1D,
      now: input.now,
      maxAgeMs: input.maxAgeMs1D,
      externalEvidence: input.externalEvidence1D
    });

    const intraday = analyzeTimeframe({
      timeframe: "15M",
      candles: input.candles15M,
      now: input.now,
      maxAgeMs: input.maxAgeMs15M,
      externalEvidence: input.externalEvidence15M
    });

    const readyCount = [
      daily,
      intraday
    ].filter(result => result.status === "READY").length;

    return {
      status:
        readyCount === 2
          ? "READY"
          : readyCount === 1
            ? "PARTIAL"
            : "WAIT",

      module: MODULE,
      version: VERSION,

      timeframes: {
        "1D": daily,
        "15M": intraday
      },

      summary: {
        readyTimeframes: readyCount,
        supportedTimeframes: [...SUPPORTED_TIMEFRAMES],
        independentExecution: true,
        timeframeFallback: false
      },

      safety: {
        importedSourceExecuted: false,
        arbitraryCodeExecution: false,
        orderExecution: false
      },

      disclaimer: DISCLAIMER
    };
  }

  function snapshot() {
    let bridgeSnapshot;

    try {
      bridgeSnapshot = bridge.snapshot();
    } catch {
      bridgeSnapshot = null;
    }

    return {
      status: "READY",
      module: MODULE,
      version: VERSION,

      connectedModules: {
        liveMasterAnalyzer: true,
        customIndicatorAnalysisBridge: true
      },

      supportedTimeframes: [...SUPPORTED_TIMEFRAMES],

      customIndicatorBridge: bridgeSnapshot,

      integrationRules: {
        liveFeedMustBeFresh: true,
        marketCloseMustMatch: true,
        maximumCustomIndicators: 3,
        originalEightRulesPreserved: true,
        customIndicatorsChangeOriginalPercentages: false,
        missingDataMeansWait: true,
        timeframeFallback: false
      },

      safety: {
        importedSourceExecuted: false,
        arbitraryCodeExecution: false,
        orderExecution: false
      },

      disclaimer: DISCLAIMER
    };
  }

  return {
    bridge,
    analyzeTimeframe,
    analyzeBothTimeframes,
    snapshot,

    config: {
      version: VERSION,
      module: MODULE,
      supportedTimeframes: [...SUPPORTED_TIMEFRAMES],
      maximumCustomIndicators: 3,
      originalEightRulesPreserved: true,
      timeframeFallback: false,
      importedSourceExecution: false,
      orderExecution: false
    }
  };
}

export const LIVE_MASTER_CUSTOM_INDICATOR_INTEGRATION_CONFIG = {
  version: VERSION,
  module: MODULE,
  supportedTimeframes: SUPPORTED_TIMEFRAMES,
  maximumCustomIndicators: 3,
  requiresFreshLiveFeed: true,
  requiresMarketCloseMatch: true,
  preservesOriginalEightRules: true,
  customIndicatorsChangeOriginalPercentages: false,
  timeframeFallback: false,
  importedSourceExecution: false,
  arbitraryCodeExecution: false,
  orderExecution: false,
  forecasts: false,
  tradingAdvice: false
};
