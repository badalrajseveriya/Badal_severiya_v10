/* ======================================================
   BADAL SEVERIYA V12
   HISTORICAL MASTER DASHBOARD INTEGRATION
   API PIPELINE -> DASHBOARD DATA -> DISPLAY + MASTER CARD
   ====================================================== */

import {
  formatHistoricalDashboardData
} from "./dashboard-data.js";

import {
  createHistoricalDashboardDisplay
} from "./dashboard-display.js";

const NOTE =
  "Historical educational dashboard only. No forecasts, future probabilities or trading recommendations.";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(error, pipelineResult = null) {
  return {
    status: "ERROR",
    version: "1.0",
    module: "HISTORICAL_MASTER_DASHBOARD_INTEGRATION",
    dataType: "HISTORICAL_ONLY",
    dashboard: null,
    masterAnalysis: pipelineResult?.masterAnalysis ?? null,
    error: error || "Dashboard integration failed.",
    note: NOTE
  };
}

function validatePipelineResult(result) {
  const errors = [];

  if (!isObject(result)) {
    errors.push("Pipeline result must be an object.");
  } else {
    if (result.status !== "OK") {
      errors.push("API Master pipeline status is not OK.");
    }

    if (result.dataType !== "HISTORICAL_ONLY") {
      errors.push("Pipeline must be historical-only.");
    }

    if (result.timeframe !== "15m") {
      errors.push("Dashboard integration currently supports 15m.");
    }

    if (
      !Number.isInteger(result.candleCount) ||
      result.candleCount < 200
    ) {
      errors.push("Pipeline candle count is invalid.");
    }

    if (
      !isObject(result.report) ||
      result.report.status !== "OK"
    ) {
      errors.push("Historical report is missing or invalid.");
    }

    if (
      !isObject(result.masterAnalysis) ||
      result.masterAnalysis.status !== "OK"
    ) {
      errors.push("Master analysis is missing or invalid.");
    }

    if (
      result.masterAnalysis?.dataType !== "HISTORICAL_ONLY"
    ) {
      errors.push("Master analysis must be historical-only.");
    }

    if (
      result.masterAnalysis?.timeframe !== result.timeframe
    ) {
      errors.push("Master analysis timeframe mismatch.");
    }

    if (
      result.masterAnalysis?.candleCount !==
      result.candleCount
    ) {
      errors.push("Master analysis candle count mismatch.");
    }

    if (
      result.report?.reportInfo?.candleCount !==
      result.candleCount
    ) {
      errors.push("Report candle count mismatch.");
    }

    if (
      result.report?.reportInfo?.timeframe !==
      result.timeframe
    ) {
      errors.push("Report timeframe mismatch.");
    }

    if (
      result.masterAnalysis?.validation
        ?.percentagesTotal100 !== true
    ) {
      errors.push(
        "Historical composition percentage validation failed."
      );
    }

    const percentages =
      result.masterAnalysis?.composition?.percentages;

    if (
      !isObject(percentages) ||
      !["bullish", "bearish", "neutral"].every(
        key => Number.isFinite(percentages[key])
      ) ||
      Math.abs(
        percentages.bullish +
        percentages.bearish +
        percentages.neutral -
        100
      ) > 0.2
    ) {
      errors.push(
        "Historical composition percentages are invalid."
      );
    }
  }

  return errors;
}

function buildMasterCard(master) {
  const composition = master.composition;

  return {
    id: "historical-master-analysis",
    title: "Master Historical Analysis",
    timeframe: master.timeframe,
    candleCount: master.candleCount,

    composition: {
      sampleSize: composition.sampleSize,
      counts: composition.counts,
      percentages: composition.percentages,
      percentageTotal: composition.percentageTotal
    },

    historicalLevels:
      master.historicalLevels ?? null,

    smc:
      master.smc ?? null,

    validation:
      master.validation,

    note:
      master.note ?? NOTE
  };
}

export function createHistoricalMasterDashboardIntegration(
  pipelineResult
) {
  try {
    const errors =
      validatePipelineResult(pipelineResult);

    if (errors.length) {
      return fail(
        errors.join(" "),
        pipelineResult
      );
    }

    const dashboardData =
      formatHistoricalDashboardData(
        pipelineResult.report
      );

    if (dashboardData.status !== "OK") {
      return fail(
        dashboardData.error ||
        "Dashboard data formatting failed.",
        pipelineResult
      );
    }

    const display =
      createHistoricalDashboardDisplay(
        dashboardData
      );

    if (display.status !== "OK") {
      return fail(
        display.error ||
        "Dashboard display generation failed.",
        pipelineResult
      );
    }

    const masterCard =
      buildMasterCard(
        pipelineResult.masterAnalysis
      );

    display.layout.cards.push(masterCard);

    display.layout.cardCount =
      display.layout.cards.length;

    display.screen.timeframe =
      pipelineResult.timeframe;

    display.screen.candleCount =
      pipelineResult.candleCount;

    display.screen.title =
      "BADAL SEVERIYA V12";

    display.screen.subtitle =
      "Historical Analysis Dashboard + Master Summary";

    return {
      status: "OK",
      version: "1.0",
      module:
        "HISTORICAL_MASTER_DASHBOARD_INTEGRATION",
      dataType: "HISTORICAL_ONLY",

      index:
        pipelineResult.index ?? "NIFTY",

      timeframe:
        pipelineResult.timeframe,

      candleCount:
        pipelineResult.candleCount,

      dashboard: display,

      masterAnalysis:
        pipelineResult.masterAnalysis,

      validation: {
        pipelineValid: true,
        reportValid: true,
        dashboardDataValid:
          dashboardData.validation.valid,
        dashboardDisplayValid:
          display.validation.valid,
        masterAnalysisValid: true,
        masterCardAdded:
          display.layout.cards.some(
            card => card.id === masterCard.id
          ),
        cardCount:
          display.layout.cardCount
      },

      error: null,
      note: NOTE
    };

  } catch (error) {
    return fail(
      error?.message,
      pipelineResult
    );
  }
}

export const
  HISTORICAL_MASTER_DASHBOARD_INTEGRATION_CONFIG = {
    version: "1.0",
    inputModule:
      "HISTORICAL_MASTER_API_INTEGRATION",
    outputModule:
      "HISTORICAL_MASTER_DASHBOARD_INTEGRATION",
    timeframe: "15m",
    requiredExistingPanels: 6,
    addedMasterCards: 1,
    historicalOnly: true,
    blockDashboardOnInvalidPipeline: true
  };