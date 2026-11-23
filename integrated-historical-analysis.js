
 // ======================================================
// BADAL SEVERIYA V12
// INTEGRATED HISTORICAL ANALYSIS ENGINE
// Educational and historical analysis only
// No live trading signals, forecasts or order execution
// ======================================================

import { analyzeMarket } from "./market-data.js";

import {
  analyzeMarketStructure
} from "./market-structure.js";

import {
  analyzeSupportResistance
} from "./support-resistance.js";

import {
  analyzeFibonacci
} from "./fibonacci-engine.js";

import {
  analyzeCandlePatterns
} from "./candle-patterns.js";

import {
  analyzeDataQuality
} from "./data-quality.js";

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

// ------------------------------------------------------
// CANONICAL HISTORICAL CANDLES
// ------------------------------------------------------

function prepareTimestampCandles(input) {
  let source = input;

  if (!Array.isArray(source)) {
    if (Array.isArray(input?.candles)) {
      source = input.candles;
    } else if (Array.isArray(input?.data)) {
      source = input.data;
    } else {
      throw new Error("Candle data must be an array.");
    }
  }

  if (source.length === 0) {
    throw new Error("Historical candle data is empty.");
  }

  return source.map((item, index) => {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {
      throw new Error(
        `Invalid candle object at index ${index + 1}.`
      );
    }

    const timestamp =
      item.timestamp ??
      item.time ??
      item.date ??
      item.datetime;

    if (
      timestamp === null ||
      timestamp === undefined ||
      timestamp === ""
    ) {
      throw new Error(
        `Timestamp is required at candle ${index + 1}.`
      );
    }

    let milliseconds;

    if (
      typeof timestamp === "number" ||
      /^\d+$/.test(String(timestamp))
    ) {
      const numeric = Number(timestamp);

      milliseconds =
        numeric < 1e12 ? numeric * 1000 : numeric;
    } else {
      milliseconds = Date.parse(String(timestamp));
    }

    if (!Number.isFinite(milliseconds)) {
      throw new Error(
        `Invalid timestamp at candle ${index + 1}.`
      );
    }

    return {
      ...item,
      timestamp: new Date(milliseconds).toISOString()
    };
  });
}

// ------------------------------------------------------
// MODULE OUTPUT VALIDATION
// ------------------------------------------------------

function validateModuleOutputs(modules) {
  const errors = [];

  if (!modules || typeof modules !== "object") {
    return {
      valid: false,
      errors: ["Integrated modules are missing."]
    };
  }

  for (const name of REQUIRED_MODULES) {
    const result = modules[name];

    if (
      !result ||
      typeof result !== "object" ||
      result.status !== "OK"
    ) {
      errors.push(
        `${name} module is missing or has invalid status.`
      );
    }
  }

  const dataQuality = modules.dataQuality;

  if (
    dataQuality &&
    (
      dataQuality.quality !== "VALID" ||
      !dataQuality.checks ||
      typeof dataQuality.checks !== "object"
    )
  ) {
    errors.push("Data quality output is invalid.");
  }

  const marketData = modules.marketData;

  if (
    marketData &&
    (
      !marketData.indicators ||
      typeof marketData.indicators !== "object" ||
      Array.isArray(marketData.indicators)
    )
  ) {
    errors.push("Market data indicators are invalid.");
  }

  const structure = modules.marketStructure;

  if (structure) {
    const requiredArrays = [
      "highs",
      "lows"
    ];

    for (const key of requiredArrays) {
      if (!Array.isArray(structure.pivots?.[key])) {
        errors.push(
          `Market structure pivots.${key} must be an array.`
        );
      }
    }

    const structureArrays = [
      "structureEvents",
      "liquidity",
      "fairValueGaps",
      "orderBlocks"
    ];

    for (const key of structureArrays) {
      if (!Array.isArray(structure[key])) {
        errors.push(
          `Market structure ${key} must be an array.`
        );
      }
    }
  }

  const supportResistance = modules.supportResistance;

  if (supportResistance) {
    if (!Array.isArray(supportResistance.supports)) {
      errors.push("Support zones must be an array.");
    }

    if (!Array.isArray(supportResistance.resistances)) {
      errors.push("Resistance zones must be an array.");
    }
  }

  const fibonacci = modules.fibonacci;

  if (fibonacci) {
    if (!Array.isArray(fibonacci.retracement)) {
      errors.push("Fibonacci retracement must be an array.");
    }

    if (!Array.isArray(fibonacci.extensions)) {
      errors.push("Fibonacci extensions must be an array.");
    }
  }

  const candlePatterns = modules.candlePatterns;

  if (candlePatterns) {
    if (!Array.isArray(candlePatterns.patterns)) {
      errors.push("Candle patterns must be an array.");
    }

    if (
      !candlePatterns.summary ||
      typeof candlePatterns.summary !== "object" ||
      typeof candlePatterns.summary.totalPatterns !== "number" ||
      !Number.isFinite(candlePatterns.summary.totalPatterns)
    ) {
      errors.push("Candle pattern summary is invalid.");
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ------------------------------------------------------
// MAIN INTEGRATION
// ------------------------------------------------------

export function analyzeHistoricalIntegrated(input) {
  try {
    if (!input) {
      throw new Error("Historical input is required.");
    }

    const candles = prepareTimestampCandles(input);

    if (candles.length < 200) {
      throw new Error(
        "At least 200 historical candles are required for full integration."
      );
    }

    const timeframe =
      typeof input?.timeframe === "string" &&
      input.timeframe.trim() !== ""
        ? input.timeframe.trim()
        : "15m";

    // STEP 1: DATA QUALITY CHECK

    const dataQualityResult =
      analyzeDataQuality(candles);

    if (
      !dataQualityResult ||
      dataQualityResult.status !== "OK"
    ) {
      throw new Error("Data Quality Engine failed.");
    }

    if (dataQualityResult.quality !== "VALID") {
      throw new Error(
        `Historical data quality check failed. Issues found: ${dataQualityResult.issueCount}`
      );
    }

    // STEP 2: MARKET DATA ENGINE

    const marketResult = analyzeMarket({
      candles,
      timeframe
    });

    if (
      !marketResult ||
      marketResult.status !== "OK"
    ) {
      throw new Error(
        `Market Data Engine failed: ${marketResult?.error || "Unknown error"}`
      );
    }

    // STEP 3: MARKET STRUCTURE

    const structureResult =
      analyzeMarketStructure(candles);

    // STEP 4: SUPPORT AND RESISTANCE

    const supportResistanceResult =
      analyzeSupportResistance(candles);

    // STEP 5: FIBONACCI

    const fibonacciResult =
      analyzeFibonacci(candles);

    // STEP 6: CANDLE PATTERNS

    const candlePatternResult =
      analyzeCandlePatterns(candles);

    // STEP 7: COMBINE ALL MODULES

    const modules = {
      dataQuality: dataQualityResult,
      marketData: marketResult,
      marketStructure: structureResult,
      supportResistance: supportResistanceResult,
      fibonacci: fibonacciResult,
      candlePatterns: candlePatternResult
    };

    // STEP 8: VALIDATE MODULE OUTPUTS

    const validation =
      validateModuleOutputs(modules);

    if (!validation.valid) {
      throw new Error(
        `Integrated output validation failed: ${validation.errors.join(" ")}`
      );
    }

    // STEP 9: FINAL HISTORICAL REPORT

    return {
      status: "OK",
      version: "12.0",
      module: "INTEGRATED_HISTORICAL_ANALYSIS",
      dataType: "HISTORICAL_ONLY",

      timeframe,
      candleCount: candles.length,

      validation: {
        status: "OK",
        valid: true,
        checkedModules: REQUIRED_MODULES.length,
        errors: []
      },

      modules,

      note: NOTE
    };

  } catch (error) {
    return {
      status: "ERROR",
      version: "12.0",
      module: "INTEGRATED_HISTORICAL_ANALYSIS",
      dataType: "HISTORICAL_ONLY",
      error: error.message,
      note: NOTE
    };
  }
}
