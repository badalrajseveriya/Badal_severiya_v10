
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

const RECENT_STRUCTURE_LIMIT = 20;

// ------------------------------------------------------
// SAFE HELPERS
// ------------------------------------------------------

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isFiniteNumber(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function recentRecords(value) {
  return safeArray(value).slice(-RECENT_STRUCTURE_LIMIT);
}

// ------------------------------------------------------
// MODULE VALIDATION
// ------------------------------------------------------

function validateModules(modules) {
  const errors = [];

  if (!isObject(modules)) {
    return {
      valid: false,
      errors: ["Integrated modules are missing."]
    };
  }

  for (const name of REQUIRED_MODULES) {
    const result = modules[name];

    if (!isObject(result) || result.status !== "OK") {
      errors.push(
        `${name} module is missing or invalid.`
      );
    }
  }

  if (
    modules.dataQuality &&
    modules.dataQuality.quality !== "VALID"
  ) {
    errors.push("Data quality is not VALID.");
  }

  const structure = modules.marketStructure;

  if (structure) {
    if (
      !isObject(structure.pivots) ||
      !Array.isArray(structure.pivots.highs) ||
      !Array.isArray(structure.pivots.lows)
    ) {
      errors.push("Market structure pivots are invalid.");
    }

    for (const key of [
      "structureEvents",
      "liquidity",
      "fairValueGaps",
      "orderBlocks"
    ]) {
      if (!Array.isArray(structure[key])) {
        errors.push(
          `Market structure ${key} must be an array.`
        );
      }
    }
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

    const integrated =
      analyzeHistoricalIntegrated(input, options);

    if (!integrated || integrated.status !== "OK") {
      throw new Error(
        integrated?.error ||
        "Integrated Historical Analysis failed."
      );
    }

    // STEP 2: VALIDATE MODULES

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
      checks: safeObject(dataQuality.checks)
    };

    // STEP 4: MARKET INDICATORS

    const indicators = safeObject(marketData.indicators);
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

    const pivots = safeObject(structure.pivots);

    const pivotHighs = safeArray(pivots.highs);
    const pivotLows = safeArray(pivots.lows);
    const structureEvents = safeArray(
      structure.structureEvents
    );
    const liquidity = safeArray(structure.liquidity);
    const fairValueGaps = safeArray(
      structure.fairValueGaps
    );
    const orderBlocks = safeArray(
      structure.orderBlocks
    );

    const rawTrend =
      structure.summary?.historicalTrendClassification ??
      structure.trend ??
      structure.historicalTrendClassification;

    const historicalTrend =
      typeof rawTrend === "string" &&
      rawTrend.trim() !== ""
        ? rawTrend.trim()
        : "UNKNOWN";

    const structureSummary = {
      trend: historicalTrend,

      pivotHighCount: pivotHighs.length,
      pivotLowCount: pivotLows.length,

      structureEventCount: structureEvents.length,
      liquidityCount: liquidity.length,
      fairValueGapCount: fairValueGaps.length,
      orderBlockCount: orderBlocks.length,

      recentPivotHighs:
        recentRecords(pivotHighs),

      recentPivotLows:
        recentRecords(pivotLows),

      recentStructureEvents:
        recentRecords(structureEvents),

      liquidity:
        recentRecords(liquidity),

      recentFairValueGaps:
        recentRecords(fairValueGaps),

      recentOrderBlocks:
        recentRecords(orderBlocks),

      detailLimitPerGroup: RECENT_STRUCTURE_LIMIT
    };

    // STEP 6: SUPPORT AND RESISTANCE

    const supports = safeArray(
      supportResistance.supports
    );

    const resistances = safeArray(
      supportResistance.resistances
    );

    const supportResistanceSummary = {
      supportCount: supports.length,
      resistanceCount: resistances.length,
      supports,
      resistances
    };

    // STEP 7: FIBONACCI

    const fibonacciSummary = {
      swing: fibonacci.swing ?? null,
      retracement: safeArray(fibonacci.retracement),
      extensions: safeArray(fibonacci.extensions)
    };

    // STEP 8: CANDLE PATTERNS

    const patternSummary = safeObject(
      candlePatterns.summary
    );

    const candlePatternCounts =
      patternSummary.patternCounts ??
      patternSummary.counts ??
      {};

    const candlePatternSummary = {
      totalPatterns: isFiniteNumber(
        patternSummary.totalPatterns
      )
        ? patternSummary.totalPatterns
        : safeArray(candlePatterns.patterns).length,

      counts: safeObject(candlePatternCounts),
      patterns: safeArray(candlePatterns.patterns)
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

    // STEP 10: FINAL HISTORICAL REPORT

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
          candlePatternSummary.totalPatterns,

        supportZones: supports.length,
        resistanceZones: resistances.length
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
