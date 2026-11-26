
/* ======================================================
   BADAL SEVERIYA V12
   HISTORICAL ANALYSIS API PIPELINE
   API FETCH -> GAP VALIDATION -> HISTORICAL REPORT
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

const NOTE =
  "Historical educational analysis only. No forecasts, probabilities or trading recommendations.";

const DEFAULT_MAX_CANDLES = 5000;

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
// SAFE ERROR RESULT
// ------------------------------------------------------

function createErrorResult({
  error,
  fetch = null,
  gapValidation = null,
  report = null,
  candleCount = 0
}) {
  return {
    status: "ERROR",
    version: "1.0",
    module: "HISTORICAL_ANALYSIS_API_PIPELINE",
    dataType: "HISTORICAL_ONLY",
    timeframe: "15m",
    candleCount,
    fetch,
    gapValidation,
    report,
    error:
      error ||
      "Historical analysis API pipeline failed.",
    note: NOTE
  };
}

// ------------------------------------------------------
// MAIN PIPELINE
// ------------------------------------------------------

export async function runHistoricalAnalysisApiPipeline({
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
    // STEP 1: CONFIGURATION VALIDATION

    if (timeframe !== "15m") {
      throw new Error(
        "Historical API pipeline currently supports 15m timeframe only."
      );
    }

    if (
      !Number.isSafeInteger(maxCandles) ||
      maxCandles < 200 ||
      maxCandles > 100000
    ) {
      throw new Error(
        "maxCandles must be an integer between 200 and 100000."
      );
    }

    // STEP 2: FETCH HISTORICAL API DATA

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
      return createErrorResult({
        error: fetched.error,
        fetch: fetched
      });
    }

    // STEP 3: EMPTY DATA HANDLING

    if (fetched.candleCount === 0) {
      return {
        status: "NO_DATA",
        version: "1.0",
        module: "HISTORICAL_ANALYSIS_API_PIPELINE",
        dataType: "HISTORICAL_ONLY",
        timeframe,
        candleCount: 0,
        fetch: {
          status: fetched.status,
          candleCount: fetched.candleCount,
          pagesRead: fetched.pagesRead,
          source: fetched.source
        },
        gapValidation: null,
        report: null,
        error: null,
        note: NOTE
      };
    }

    // STEP 4: AUTOMATIC COMPLETED SESSION DATES

    const automaticDates =
      getAutomaticCompletedSessionDates(
        fetched.candles,
        now
      );

    // STEP 5: MANUAL COMPLETED SESSION DATES

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

    // STEP 6: INTRADAY GAP / SESSION VALIDATION

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
      return createErrorResult({
        error:
          gapValidation.error ||
          "Historical candle gap validation failed. Report generation blocked.",
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

    // STEP 7: CANDLE COUNT SAFETY

    if (
      fetched.candleCount > maxCandles
    ) {
      return createErrorResult({
        error:
          `Maximum ${maxCandles} candles allowed by pipeline configuration.`,
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

    // STEP 8: GENERATE HISTORICAL REPORT

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
      return createErrorResult({
        error:
          report?.error ||
          "Historical Analysis Report generation failed.",
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

    // STEP 9: FINAL PIPELINE RESULT

    return {
      status: "OK",
      version: "1.0",
      module: "HISTORICAL_ANALYSIS_API_PIPELINE",
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

      validation: {
        apiFetchValid: true,
        intradayGapCheckValid: true,
        sessionBoundaryCheckValid:
          gapValidation.boundaryCheckStatus ===
            "NOT_REQUESTED" ||
          gapValidation.boundaryCheckStatus ===
            "NO_COMPLETED_DATES" ||
          gapValidation.boundaryMissingCandleCount === 0,
        historicalReportValid: true
      },

      error: null,
      note: NOTE
    };

  } catch (error) {
    return createErrorResult({
      error:
        error?.message ||
        "Unknown historical analysis pipeline error."
    });
  }
}

// ------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------

export const HISTORICAL_ANALYSIS_API_PIPELINE_CONFIG = {
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
    "INTRADAY_GAP_VALIDATION",
    "SESSION_BOUNDARY_VALIDATION",
    "HISTORICAL_REPORT"
  ],
  blockReportOnInvalidData: true,
  historicalOnly: true
};
