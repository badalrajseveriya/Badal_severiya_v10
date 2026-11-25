
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
  "Historical educational analysis only. No forecasts, probabilities or trading recommendations.";

const REQUIRED_MODULES = [
  "dataQuality",
  "marketData",
  "marketStructure",
  "supportResistance",
  "fibonacci",
  "candlePatterns"
];

function isFiniteNumber(value) {
  return typeof value === "number" &&
    Number.isFinite(value);
}

function validateModules(modules) {
  const errors = [];

  if (!modules || typeof modules !== "object") {
    return {
      valid: false,
      errors: ["Integrated modules are missing."]
    };
  }

  for (const name of REQUIRED_MODULES) {
    const result = modules[name];

    if (!result || result.status !== "OK") {
      errors.push(`${name} module is missing or invalid.`);
    }
  }

  if (
    modules.dataQuality &&
    modules.dataQuality.quality !== "VALID"
  ) {
    errors.push("Data quality is not VALID.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ------------------------------------------------------
// MAIN REPORT GENERATOR
// ------------------------------------------------------

export function generateHistoricalReport(
  input,
  options = {}
) {
  try {
    // STEP 1: INTEGRATED HISTORICAL ANALYSIS
    // Pass custom candle limit to the integration engine.

    const integrated =
      analyzeHistoricalIntegrated(input, options);

    if (!integrated || integrated.status !== "OK") {
      throw new Error(
        integrated?.error ||
        "Integrated Historical Analysis failed."
      );
    }

    // STEP 2: MODULE VALIDATION

    const modules = integrated.modules;
    const validation = validateModules(modules);

    if (!validation.valid) {
      throw new Error(
        `Report validation failed: ${validation.errors.join(" ")}`
      );
    }

    const dataQuality = modules.dataQuality;
    const marketData = modules.marketData;
    const structure = modules.marketStructure;
    const supportResistance = modules.supportResistance;
    const fibonacci = modules.fibonacci;
    const candlePatterns = modules.candlePatterns;

    // STEP 3: DATA QUALITY

    const qualitySummary = {
      status: dataQuality.status,
      quality: dataQuality.quality,
      issueCount: dataQuality.issueCount,
      checks: dataQuality.checks
    };

    // STEP 4: MARKET INDICATORS

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

    // STEP 5: MARKET STRUCTURE

    const rawTrend =
      structure.summary?.historicalTrendClassification ??
      structure.trend ??
      structure.historicalTrendClassification;

    const historicalTrend =
      typeof rawTrend === "string" && rawTrend.trim() !== ""
        ? rawTrend.trim()
        : "UNKNOWN";

    const structureSummary = {
      trend: historicalTrend,
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

    // STEP 6: SUPPORT AND RESISTANCE

    const supportResistanceSummary = {
      supportCount:
        supportResistance.supports?.length ?? 0,
      resistanceCount:
        supportResistance.resistances?.length ?? 0,
      supports: supportResistance.supports ?? [],
      resistances: supportResistance.resistances ?? []
    };

    // STEP 7: FIBONACCI

    const fibonacciSummary = {
      swing: fibonacci.swing ?? null,
      retracement: fibonacci.retracement ?? [],
      extensions: fibonacci.extensions ?? []
    };

    // STEP 8: CANDLE PATTERNS

    const candlePatternCounts =
      candlePatterns.summary?.patternCounts ??
      candlePatterns.summary?.counts ??
      {};

    const candlePatternSummary = {
      totalPatterns:
        candlePatterns.summary?.totalPatterns ?? 0,
      counts: candlePatternCounts,
      patterns: candlePatterns.patterns ?? []
    };

    // STEP 9: REPORT SECTIONS

    const sections = {
      dataQuality: qualitySummary,
      marketIndicators: indicatorSummary,
      marketStructure: structureSummary,
      supportResistance: supportResistanceSummary,
      fibonacci: fibonacciSummary,
      candlePatterns: candlePatternSummary
    };

    // STEP 10: FINAL REPORT

    return {
      status: "OK",
      version: "12.0",
      module: "HISTORICAL_ANALYSIS_REPORT",
      dataType: "HISTORICAL_ONLY",

      reportInfo: {
        timeframe: integrated.timeframe,
        candleCount: integrated.candleCount,
        maxCandlesAllowed:
          integrated.maxCandlesAllowed,
        generatedAt: new Date().toISOString(),
        sectionCount: Object.keys(sections).length
      },

      validation: {
        status: "OK",
        valid: true,
        checkedModules: REQUIRED_MODULES.length,
        errors: []
      },

      summary: {
        dataQuality: dataQuality.quality,
        dataQualityIssues: dataQuality.issueCount,
        totalCandlePatterns:
          candlePatterns.summary?.totalPatterns ?? 0,
        supportZones:
          supportResistance.supports?.length ?? 0,
        resistanceZones:
          supportResistance.resistances?.length ?? 0
      },

      sections,

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
