
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

  return source.map((item, index) => {
    const timestamp =
      item.timestamp ?? item.time ?? item.date ?? item.datetime;

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

    const timeframe = input?.timeframe || "15m";

    // STEP 1: DATA QUALITY CHECK

    const dataQualityResult =
      analyzeDataQuality(candles);

    if (
      !dataQualityResult ||
      dataQualityResult.status !== "OK"
    ) {
      throw new Error(
        "Data Quality Engine failed."
      );
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

    if (marketResult.status !== "OK") {
      throw new Error(
        `Market Data Engine failed: ${marketResult.error}`
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

    for (const [name, result] of Object.entries(modules)) {
      if (!result || result.status !== "OK") {
        throw new Error(
          `${name} engine returned an invalid result.`
        );
      }
    }

    // STEP 8: FINAL HISTORICAL REPORT

    return {
      status: "OK",
      version: "12.0",
      module: "INTEGRATED_HISTORICAL_ANALYSIS",
      dataType: "HISTORICAL_ONLY",
      timeframe,
      candleCount: candles.length,
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
