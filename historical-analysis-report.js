
 // ======================================================
// BADAL SEVERIYA V12
// HISTORICAL ANALYSIS REPORT ENGINE
// Educational and historical analysis only
// No live trading signals, forecasts or order execution
// ======================================================

import {
  analyzeHistoricalIntegrated
} from "./integrated-historical-analysis.js";

const NOTE =
  "Historical educational report only. No forecasts, probabilities or trading recommendations.";

// ------------------------------------------------------
// SAFE NUMBER FORMAT
// ------------------------------------------------------

function isFiniteNumber(value) {
  return typeof value === "number" &&
    Number.isFinite(value);
}

// ------------------------------------------------------
// REPORT BUILDER
// ------------------------------------------------------

export function generateHistoricalReport(input) {
  try {
    const integrated =
      analyzeHistoricalIntegrated(input);

    if (!integrated || integrated.status !== "OK") {
      throw new Error(
        integrated?.error ||
        "Integrated Historical Analysis failed."
      );
    }

    const modules = integrated.modules;

    if (!modules) {
      throw new Error(
        "Integrated analysis modules are missing."
      );
    }

    const dataQuality = modules.dataQuality;
    const marketData = modules.marketData;
    const structure = modules.marketStructure;
    const supportResistance = modules.supportResistance;
    const fibonacci = modules.fibonacci;
    const candlePatterns = modules.candlePatterns;

    // --------------------------------------------------
    // DATA QUALITY SUMMARY
    // --------------------------------------------------

    const qualitySummary = {
      status: dataQuality.status,
      quality: dataQuality.quality,
      issueCount: dataQuality.issueCount,
      checks: dataQuality.checks
    };

    // --------------------------------------------------
    // MARKET INDICATOR SUMMARY
    // --------------------------------------------------

    const indicators = marketData.indicators || {};

    const indicatorSummary = {};

    for (const [name, value] of Object.entries(indicators)) {
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "boolean" ||
        isFiniteNumber(value)
      ) {
        indicatorSummary[name] = value;
      }
    }

    // --------------------------------------------------
    // MARKET STRUCTURE SUMMARY
    // --------------------------------------------------

    const structureSummary = {
      trend: structure.trend ?? null,
      pivotHighCount: structure.pivots?.highs?.length ?? 0,
      pivotLowCount: structure.pivots?.lows?.length ?? 0,
      structureEventCount:
        structure.structureEvents?.length ?? 0,
      liquidity: structure.liquidity ?? [],
      fairValueGapCount:
        structure.fairValueGaps?.length ?? 0,
      orderBlockCount:
        structure.orderBlocks?.length ?? 0
    };

    // --------------------------------------------------
    // SUPPORT AND RESISTANCE SUMMARY
    // --------------------------------------------------

    const supportResistanceSummary = {
      supportCount:
        supportResistance.supports?.length ?? 0,
      resistanceCount:
        supportResistance.resistances?.length ?? 0,
      supports: supportResistance.supports ?? [],
      resistances: supportResistance.resistances ?? []
    };

    // --------------------------------------------------
    // FIBONACCI SUMMARY
    // --------------------------------------------------

    const fibonacciSummary = {
      swing: fibonacci.swing ?? null,
      retracement: fibonacci.retracement ?? [],
      extensions: fibonacci.extensions ?? []
    };

    // --------------------------------------------------
    // CANDLE PATTERN SUMMARY
    // --------------------------------------------------

    const candlePatternSummary = {
      totalPatterns:
        candlePatterns.summary?.totalPatterns ?? 0,
      counts:
        candlePatterns.summary?.counts ?? {},
      patterns:
        candlePatterns.patterns ?? []
    };

    // --------------------------------------------------
    // FINAL REPORT
    // --------------------------------------------------

    return {
      status: "OK",
      version: "12.0",
      module: "HISTORICAL_ANALYSIS_REPORT",
      dataType: "HISTORICAL_ONLY",

      reportInfo: {
        timeframe: integrated.timeframe,
        candleCount: integrated.candleCount,
        generatedAt: new Date().toISOString()
      },

      sections: {
        dataQuality: qualitySummary,
        marketIndicators: indicatorSummary,
        marketStructure: structureSummary,
        supportResistance: supportResistanceSummary,
        fibonacci: fibonacciSummary,
        candlePatterns: candlePatternSummary
      },

      note: NOTE
    };

  } catch (error) {
    return {
      status: "ERROR",
      version: "12.0",
      module: "HISTORICAL_ANALYSIS_REPORT",
      dataType: "HISTORICAL_ONLY",
      error: error.message,
      note: NOTE
    };
  }
}
