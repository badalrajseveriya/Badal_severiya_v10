
/* ==========================================================
   BADAL SEVERIYA V12
   CUSTOM INDICATOR ANALYSIS BRIDGE

   Connects:
   - Custom Indicator Manager
   - Custom Indicator Adapter Engine

   Responsibilities:
   - Compatibility validation
   - Three-slot indicator orchestration
   - Analysis mode gating
   - 1D / 15M runtime separation
   - Runtime result validation
   - Safe WAIT fallback

   SAFETY:
   - Imported scripts are never executed.
   - Unsupported indicators remain chart-only.
   - Invalid calculations never enter analysis context.
   - No order execution.
   - No forecasts or trading advice.
   ========================================================== */

import {
  createCustomIndicatorManager
} from "./custom-indicator-manager.js";

import {
  createCustomIndicatorAdapterEngine
} from "./custom-indicator-adapter-engine.js";

const VERSION = "12.0";

const MODULE =
  "CUSTOM_INDICATOR_ANALYSIS_BRIDGE";

const SUPPORTED_TIMEFRAMES = [
  "1D",
  "15M"
];

const MAX_INDICATORS = 3;

const DISCLAIMER =
  "Custom indicator context is educational and data-dependent. " +
  "Not a forecast, trading signal, or financial advice.";

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeString(value, fallback = "") {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  try {
    return String(value);
  } catch {
    return fallback;
  }
}

function normalizeTimeframe(value) {
  const timeframe = safeString(value)
    .trim()
    .toUpperCase();

  return SUPPORTED_TIMEFRAMES.includes(
    timeframe
  )
    ? timeframe
    : null;
}

function safeClone(value) {
  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {
    return null;
  }
}

function unavailable(
  status,
  reason,
  timeframe = null
) {
  return {
    status,
    valid: false,
    module: MODULE,
    version: VERSION,
    timeframe,
    indicatorResults: [],
    analysisContext: [],
    validCount: 0,
    rejectedCount: 0,
    reason,
    disclaimer: DISCLAIMER,

    safety: {
      importedSourceExecuted: false,
      arbitraryCodeExecution: false,
      orderExecution: false
    }
  };
}

export function createCustomIndicatorAnalysisBridge(
  options = {}
) {
  const manager =
    options.manager ||
    createCustomIndicatorManager({
      storage: options.storage,
      storageKey: options.storageKey
    });

  const adapterEngine =
    options.adapterEngine ||
    createCustomIndicatorAdapterEngine({
      config: options.adapterConfig
    });

  if (
    !manager ||
    typeof manager.listIndicators !== "function" ||
    typeof manager.setCompatibility !== "function"
  ) {
    throw new Error(
      "A compatible Custom Indicator Manager is required."
    );
  }

  if (
    !adapterEngine ||
    typeof adapterEngine.validateIndicator !== "function" ||
    typeof adapterEngine.analyzeIndicator !== "function"
  ) {
    throw new Error(
      "A compatible Custom Indicator Adapter Engine is required."
    );
  }

  // --------------------------------------------------------
  // Manager access
  // --------------------------------------------------------

  function listSlots() {
    try {
      const slots =
        manager.listIndicators();

      if (!Array.isArray(slots)) {
        return [];
      }

      return slots.slice(
        0,
        MAX_INDICATORS
      );
    } catch {
      return [];
    }
  }

  function listIndicators() {
    return listSlots().map(slot => ({
      slot: slot.slot,
      occupied: slot.occupied === true,

      indicator:
        slot.occupied === true &&
        isObject(slot.indicator)
          ? safeClone(slot.indicator)
          : null
    }));
  }

  // --------------------------------------------------------
  // Compatibility validation
  // --------------------------------------------------------

  function validateIndicator(id) {
    const indicator =
      manager.getIndicator(id);

    if (!indicator) {
      return {
        validated: false,
        status: "NOT_FOUND",
        indicatorId: safeString(id),
        reason:
          "Indicator was not found in the manager."
      };
    }

    let validation;

    try {
      validation =
        adapterEngine.validateIndicator(
          indicator
        );
    } catch (error) {
      validation = {
        valid: false,
        validated: false,
        status: "VALIDATION_ERROR",
        adapterId: null,
        analysisSupported: false,
        reason: safeString(
          error?.message,
          "Compatibility validation failed."
        )
      };
    }

    const safeValidation = {
      validated:
        validation?.validated === true &&
        validation?.valid === true &&
        validation?.analysisSupported === true &&
        Boolean(validation?.adapterId),

      analysisSupported:
        validation?.analysisSupported === true,

      adapterId:
        validation?.adapterId ?? null,

      status: safeString(
        validation?.status,
        "UNVERIFIED"
      ),

      reason: safeString(
        validation?.reason,
        "Compatibility validation did not provide a reason."
      )
    };

    const managerUpdate =
      manager.setCompatibility(
        indicator.id,
        safeValidation
      );

    const updated =
      manager.getIndicator(
        indicator.id
      );

    return {
      validated:
        safeValidation.validated &&
        managerUpdate?.updated === true,

      status:
        managerUpdate?.status ||
        "COMPATIBILITY_UPDATE_FAILED",

      slot:
        managerUpdate?.slot ?? null,

      indicatorId:
        indicator.id,

      indicatorName:
        indicator.name,

      indicatorType:
        validation?.indicatorType ?? null,

      adapterId:
        safeValidation.adapterId,

      analysisSupported:
        safeValidation.analysisSupported,

      reason:
        safeValidation.reason,

      analysisActive:
        updated?.analysis?.active === true,

      compatibility:
        safeClone(
          updated?.compatibility
        ),

      managerUpdate:
        managerUpdate?.updated === true
          ? "UPDATED"
          : "UPDATE_FAILED"
    };
  }

  function validateAll() {
    const results = [];

    for (const slot of listSlots()) {
      if (
        slot.occupied !== true ||
        !isObject(slot.indicator)
      ) {
        continue;
      }

      results.push(
        validateIndicator(
          slot.indicator.id
        )
      );
    }

    return {
      status: "VALIDATION_COMPLETE",
      total: results.length,

      validatedCount:
        results.filter(
          result => result.validated
        ).length,

      unsupportedCount:
        results.filter(
          result => !result.validated
        ).length,

      results
    };
  }

  // --------------------------------------------------------
  // Runtime analysis
  // Each timeframe is analyzed independently.
  // --------------------------------------------------------

  function analyzeTimeframe(input = {}) {
    const timeframe =
      normalizeTimeframe(
        input.timeframe
      );

    if (!timeframe) {
      return unavailable(
        "UNSUPPORTED_TIMEFRAME",
        "Only 1D and 15M are supported.",
        input.timeframe ?? null
      );
    }

    if (
      !Array.isArray(input.candles) ||
      input.candles.length === 0
    ) {
      return unavailable(
        "WAITING_FOR_DATA",
        "No candle data is available for this timeframe.",
        timeframe
      );
    }

    const indicatorResults = [];
    const analysisContext = [];

    for (const slot of listSlots()) {
      if (
        slot.occupied !== true ||
        !isObject(slot.indicator)
      ) {
        continue;
      }

      const indicator =
        slot.indicator;

      const resultBase = {
        slot: slot.slot,
        indicatorId: indicator.id,
        indicatorName: indicator.name,
        timeframe,
        mode: indicator.mode,
        enabled: indicator.enabled === true
      };

      // Disabled indicators must not run.
      if (
        indicator.enabled !== true ||
        indicator.mode === "DISABLED"
      ) {
        indicatorResults.push({
          ...resultBase,
          status: "DISABLED",
          valid: false,
          included: false,
          reason:
            "Indicator is disabled."
        });

        continue;
      }

      // Chart-only indicators are not part
      // of master analysis.
      if (
        indicator.mode !==
        "ANALYSIS_ENABLED"
      ) {
        indicatorResults.push({
          ...resultBase,
          status: "CHART_ONLY",
          valid: false,
          included: false,
          reason:
            "Indicator is configured for chart-only mode."
        });

        continue;
      }

      // Compatibility must be validated first.
      if (
        indicator.compatibility?.validated !== true ||
        indicator.compatibility?.analysisSupported !== true ||
        !indicator.compatibility?.adapterId
      ) {
        indicatorResults.push({
          ...resultBase,
          status: "WAIT_COMPATIBILITY",
          valid: false,
          included: false,
          reason:
            "Indicator compatibility has not been validated."
        });

        continue;
      }

      // Mode selection alone is insufficient.
      if (
        indicator.analysis?.active !== true
      ) {
        indicatorResults.push({
          ...resultBase,
          status: "WAIT_ACTIVATION",
          valid: false,
          included: false,
          reason:
            "Indicator analysis activation is not valid."
        });

        continue;
      }

      let runtime;

      try {
        runtime =
          adapterEngine.analyzeIndicator({
            indicator,
            timeframe,
            candles: input.candles
          });
      } catch (error) {
        runtime = {
          status: "CALCULATION_ERROR",
          valid: false,
          reason: safeString(
            error?.message,
            "Runtime analysis failed."
          )
        };
      }

      const runtimeValid =
        runtime?.status === "VALID" &&
        runtime?.valid === true &&
        Number.isFinite(
          Number(runtime.latestValue)
        ) &&
        runtime.timeframe === timeframe &&
        runtime.orderExecution !== true &&
        runtime.sourceExecution !== true;

      if (!runtimeValid) {
        indicatorResults.push({
          ...resultBase,
          status:
            runtime?.status ||
            "INVALID_RUNTIME_RESULT",

          valid: false,
          included: false,

          adapterId:
            runtime?.adapterId ??
            indicator.compatibility.adapterId,

          reason: safeString(
            runtime?.reason,
            "Runtime result failed validation."
          ),

          runtimeValidation: {
            finiteLatestValue:
              Number.isFinite(
                Number(runtime?.latestValue)
              ),

            timeframeMatch:
              runtime?.timeframe === timeframe,

            sourceExecution:
              runtime?.sourceExecution === true,

            orderExecution:
              runtime?.orderExecution === true
          }
        });

        continue;
      }

      const safeRuntime = {
        status: "VALID",
        valid: true,
        slot: slot.slot,
        indicatorId: indicator.id,
        indicatorName: indicator.name,
        indicatorType:
          runtime.indicatorType,

        adapterId:
          runtime.adapterId,

        timeframe,

        latestValue:
          Number(runtime.latestValue),

        previousValue:
          Number.isFinite(
            Number(runtime.previousValue)
          )
            ? Number(runtime.previousValue)
            : null,

        marketClose:
          Number(runtime.marketClose),

        details:
          isObject(runtime.details)
            ? safeClone(runtime.details)
            : {},

        interpretation:
          safeString(
            runtime.interpretation,
            "NEUTRAL"
          ),

        candlesUsed:
          Number(runtime.candlesUsed) || 0,

        requiredCandles:
          Number(runtime.requiredCandles) || 0,

        sourceExecution: false,
        orderExecution: false
      };

      indicatorResults.push({
        ...resultBase,
        status: "VALID",
        valid: true,
        included: true,
        adapterId:
          safeRuntime.adapterId,
        latestValue:
          safeRuntime.latestValue,
        interpretation:
          safeRuntime.interpretation
      });

      analysisContext.push(
        safeRuntime
      );
    }

    return {
      status: "VALID",
      valid: true,
      module: MODULE,
      version: VERSION,
      timeframe,

      indicatorResults,
      analysisContext,

      totalIndicators:
        indicatorResults.length,

      validCount:
        analysisContext.length,

      rejectedCount:
        indicatorResults.filter(
          result => result.included !== true
        ).length,

      contextAvailable:
        analysisContext.length > 0,

      reason:
        analysisContext.length > 0
          ? "Validated custom indicator context is available."
          : "No validated custom indicators are currently included.",

      disclaimer: DISCLAIMER,

      safety: {
        importedSourceExecuted: false,
        arbitraryCodeExecution: false,
        orderExecution: false
      }
    };
  }

  // --------------------------------------------------------
  // Independent 1D and 15M execution
  // --------------------------------------------------------

  function analyzeBothTimeframes(input = {}) {
    const daily =
      analyzeTimeframe({
        timeframe: "1D",
        candles:
          input.candles1D
      });

    const intraday =
      analyzeTimeframe({
        timeframe: "15M",
        candles:
          input.candles15M
      });

    return {
      status: "READY",
      module: MODULE,
      version: VERSION,

      timeframes: {
        "1D": daily,
        "15M": intraday
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

  // --------------------------------------------------------
  // Bridge snapshot
  // --------------------------------------------------------

  function snapshot() {
    const indicators =
      listIndicators();

    const occupied =
      indicators.filter(
        slot => slot.occupied
      );

    const validated =
      occupied.filter(
        slot =>
          slot.indicator?.compatibility?.validated === true &&
          slot.indicator?.compatibility?.analysisSupported === true
      );

    const active =
      occupied.filter(
        slot =>
          slot.indicator?.enabled === true &&
          slot.indicator?.mode === "ANALYSIS_ENABLED" &&
          slot.indicator?.analysis?.active === true &&
          slot.indicator?.compatibility?.validated === true
      );

    return {
      status: "READY",
      module: MODULE,
      version: VERSION,

      slots: {
        maximum: MAX_INDICATORS,
        occupied: occupied.length,
        available:
          MAX_INDICATORS - occupied.length
      },

      compatibility: {
        validated: validated.length,
        unvalidated:
          occupied.length - validated.length
      },

      analysis: {
        active: active.length,
        supportedTimeframes: [
          ...SUPPORTED_TIMEFRAMES
        ]
      },

      indicators,

      safety: {
        importedSourceExecuted: false,
        arbitraryCodeExecution: false,
        unsupportedIndicatorsMayBeSaved: true,
        analysisRequiresCompatibilityValidation: true,
        runtimeValidationRequired: true,
        orderExecution: false
      },

      disclaimer: DISCLAIMER
    };
  }

  return {
    manager,
    adapterEngine,

    listIndicators,
    validateIndicator,
    validateAll,

    analyzeTimeframe,
    analyzeBothTimeframes,

    snapshot,

    config: {
      version: VERSION,
      module: MODULE,
      maximumIndicators: MAX_INDICATORS,
      supportedTimeframes: [
        ...SUPPORTED_TIMEFRAMES
      ],
      importedSourceExecution: false,
      arbitraryCodeExecution: false,
      orderExecution: false
    }
  };
}

export const CUSTOM_INDICATOR_ANALYSIS_BRIDGE_CONFIG = {
  version: VERSION,
  module: MODULE,
  maximumIndicators: MAX_INDICATORS,
  supportedTimeframes:
    SUPPORTED_TIMEFRAMES,
  connectsManagerAndAdapter: true,
  importedSourceExecution: false,
  arbitraryCodeExecution: false,
  runtimeValidationRequired: true,
  orderExecution: false,
  forecasts: false,
  tradingAdvice: false
};
