/* ======================================================
   BADAL SEVERIYA V12
   HISTORICAL MASTER API INTEGRATION
   API -> GAP CHECK -> REPORT -> MASTER ANALYSIS
   ====================================================== */

import {
  fetchAllHistoricalCandles,
  getAutomaticCompletedSessionDates
} from "./intraday-gap-api-runner.js";

import {
  analyzeIntradayGaps
} from "./intraday-gap-check.js";

import {
  generateHistoricalReport
} from "./historical-analysis-report.js";

import {
  analyzeMarketStructure
} from "./market-structure.js";

import {
  calculateHistoricalMasterAnalysis
} from "./historical-master-analysis.js";

const NOTE =
  "Historical educational analysis only. No forecasts, future probabilities or trading recommendations.";

const DEFAULT_MAX_CANDLES = 10000;

// ------------------------------------------------------
// DATE VALIDATION
// ------------------------------------------------------

function isValidDateKey(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const [year, month, day] =
    value.split("-").map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

// ------------------------------------------------------
// ERROR RESULT
// ------------------------------------------------------

function errorResult({
  error,
  fetch = null,
  gapValidation = null,
  report = null,
  structure = null,
  masterAnalysis = null,
  candleCount = 0
}) {
  return {
    status: "ERROR",
    version: "1.0",
    module: "HISTORICAL_MASTER_API_INTEGRATION",
    dataType: "HISTORICAL_ONLY",
    timeframe: "15m",
    candleCount,
    fetch,
    gapValidation,
    report,
    structure,
    masterAnalysis,
    error:
      error ||
      "Historical Master API Integration failed.",
    note: NOTE
  };
}

// ------------------------------------------------------
// MAIN PIPELINE
// ------------------------------------------------------

export async function runHistoricalMasterApiIntegration({
  apiBaseUrl,
  index = "NIFTY",
  timeframe = "15m",
  pageSize = 5000,
  maxCandles = DEFAULT_MAX_CANDLES,
  fetchImpl = globalThis.fetch,
  completedSessionDates,
  now = Date.now(),
  onProgress
} = {}) {
  try {
    // STEP 1: CONFIGURATION

    if (timeframe !== "15m") {
      throw new Error(
        "Master API Integration currently supports 15m only."
      );
    }

    if (
      !Number.isSafeInteger(maxCandles) ||
      maxCandles < 200 ||
      maxCandles > 100000
    ) {
      throw new Error(
        "maxCandles must be between 200 and 100000."
      );
    }

    // STEP 2: FETCH API DATA

    const fetched =
      await fetchAllHistoricalCandles({
        apiBaseUrl,
        index,
        timeframe,
        pageSize,
        fetchImpl,
        onProgress
      });

    if (fetched.status !== "OK") {
      return errorResult({
        error: fetched.error,
        fetch: fetched
      });
    }

    // STEP 3: EMPTY DATA

    if (fetched.candleCount === 0) {
      return {
        status: "WAITING_FOR_DATA",
        version: "1.0",
        module: "HISTORICAL_MASTER_API_INTEGRATION",
        dataType: "HISTORICAL_ONLY",
        timeframe,
        candleCount: 0,
        fetch: {
          status: fetched.status,
          candleCount: 0,
          pagesRead: fetched.pagesRead,
          source: fetched.source
        },
        gapValidation: null,
        report: null,
        structure: null,
        masterAnalysis: null,
        error: null,
        note: NOTE
      };
    }

    // STEP 4: CANDLE LIMIT

    if (fetched.candleCount > maxCandles) {
      return errorResult({
        error:
          `Fetched ${fetched.candleCount} candles. ` +
          `Configured maximum is ${maxCandles}.`,
        fetch: {
          status: fetched.status,
          candleCount: fetched.candleCount,
          pagesRead: fetched.pagesRead,
          source: fetched.source
        },
        candleCount: fetched.candleCount
      });
    }

    // STEP 5: COMPLETED SESSION DATES

    const automaticDates =
      getAutomaticCompletedSessionDates(
        fetched.candles,
        now
      );

    const manualDates =
      Array.isArray(completedSessionDates)
        ? completedSessionDates.filter(
            isValidDateKey
          )
        : [];

    const datesToCheck = [
      ...new Set([
        ...automaticDates,
        ...manualDates
      ])
    ].sort();

    // STEP 6: GAP / SESSION VALIDATION

    const gapValidation =
      analyzeIntradayGaps(
        fetched.candles,
        {
          intervalMinutes: 15,
          checkSessionBoundaries:
            datesToCheck.length > 0,
          completedSessionDates:
            datesToCheck
        }
      );

    if (
      gapValidation.status !== "OK" ||
      gapValidation.quality !== "VALID"
    ) {
      return errorResult({
        error:
          gapValidation.error ||
          "Gap validation failed. Master analysis blocked.",
        fetch: {
          status: fetched.status,
          candleCount: fetched.candleCount,
          pagesRead: fetched.pagesRead,
          source: fetched.source
        },
        gapValidation,
        candleCount: fetched.candleCount
      });
    }

    // STEP 7: HISTORICAL REPORT

    const report =
      generateHistoricalReport(
        {
          candles: fetched.candles,
          timeframe
        },
        {
          maxCandles
        }
      );

    if (
      !report ||
      report.status !== "OK"
    ) {
      return errorResult({
        error:
          report?.error ||
          "Historical report failed. Master analysis blocked.",
        fetch: {
          status: fetched.status,
          candleCount: fetched.candleCount,
          pagesRead: fetched.pagesRead,
          source: fetched.source
        },
        gapValidation,
        report,
        candleCount: fetched.candleCount
      });
    }

    // STEP 8: RAW MARKET STRUCTURE

    const structure =
      analyzeMarketStructure(
        fetched.candles
      );

    if (
      !structure ||
      structure.status !== "OK" ||
      structure.dataType !== "HISTORICAL_ONLY" ||
      structure.summary?.candleCount !==
        fetched.candleCount
    ) {
      return errorResult({
        error:
          "Market structure validation failed. Master analysis blocked.",
        fetch: {
          status: fetched.status,
          candleCount: fetched.candleCount,
          pagesRead: fetched.pagesRead,
          source: fetched.source
        },
        gapValidation,
        report,
        structure,
        candleCount: fetched.candleCount
      });
    }

    // STEP 9: MASTER HISTORICAL ANALYSIS

    const masterAnalysis =
      calculateHistoricalMasterAnalysis({
        report,
        structure,
        candles: fetched.candles,
        timeframe
      });

    if (
      !masterAnalysis ||
      masterAnalysis.status !== "OK" ||
      masterAnalysis.dataType !==
        "HISTORICAL_ONLY" ||
      masterAnalysis.candleCount !==
        fetched.candleCount
    ) {
      return errorResult({
        error:
          masterAnalysis?.error ||
          "Master Historical Analysis failed.",
        fetch: {
          status: fetched.status,
          candleCount: fetched.candleCount,
          pagesRead: fetched.pagesRead,
          source: fetched.source
        },
        gapValidation,
        report,
        structure,
        masterAnalysis,
        candleCount: fetched.candleCount
      });
    }

    // STEP 10: FINAL RESULT

    return {
      status: "OK",
      version: "1.0",
      module: "HISTORICAL_MASTER_API_INTEGRATION",
      dataType: "HISTORICAL_ONLY",
      timeframe,
      index,
      candleCount: fetched.candleCount,

      fetch: {
        status: fetched.status,
        candleCount: fetched.candleCount,
        pagesRead: fetched.pagesRead,
        source: fetched.source
      },

      sessionValidation: {
        status: gapValidation.status,
        quality: gapValidation.quality,
        automaticCompletedSessionDates:
          automaticDates,
        completedSessionDates:
          datesToCheck
      },

      gapValidation,
      report,
      structure,
      masterAnalysis,

      validation: {
        apiFetchValid: true,
        intradayGapCheckValid: true,
        historicalReportValid: true,
        marketStructureValid: true,
        masterAnalysisValid: true,
        percentagesTotal100:
          masterAnalysis.validation
            .percentagesTotal100
      },

      error: null,
      note: NOTE
    };

  } catch (error) {
    return errorResult({
      error:
        error?.message ||
        "Unknown Master API Integration error."
    });
  }
}

// ------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------

export const HISTORICAL_MASTER_API_INTEGRATION_CONFIG = {
  version: "1.0",
  index: "NIFTY",
  timeframe: "15m",
  defaultPageSize: 5000,
  defaultMaxCandles: DEFAULT_MAX_CANDLES,
  timezone: "Asia/Kolkata",
  source: "D1_HISTORICAL_STORAGE",

  steps: [
    "API_FETCH",
    "PAGINATION_VALIDATION",
    "CANDLE_LIMIT_VALIDATION",
    "INTRADAY_GAP_VALIDATION",
    "SESSION_BOUNDARY_VALIDATION",
    "HISTORICAL_REPORT",
    "MARKET_STRUCTURE",
    "MASTER_HISTORICAL_ANALYSIS"
  ],

  blockMasterOnInvalidData: true,
  historicalOnly: true
};