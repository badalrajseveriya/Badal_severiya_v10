
import {
  calculateHistoricalCandleComposition
} from "./historical-candle-composition.js";

// ======================================================
// BADAL SEVERIYA V12
// HISTORICAL PERIOD STABILITY CHECK
// Retrospective analysis only
// ======================================================

const DEFAULTS = {
  segments: 4,
  minCandlesPerSegment: 20
};

export function calculateHistoricalPeriodStability(
  candles,
  options = {}
) {
  if (!Array.isArray(candles)) {
    throw new Error("Historical candles must be an array.");
  }

  const config = {
    ...DEFAULTS,
    ...options
  };

  if (
    !Number.isInteger(config.segments) ||
    config.segments < 2 ||
    config.segments > 12 ||
    !Number.isInteger(config.minCandlesPerSegment) ||
    config.minCandlesPerSegment < 1
  ) {
    throw new Error("Invalid stability configuration.");
  }

  // Validate the complete historical series first.
  const overall = calculateHistoricalCandleComposition(
    candles,
    {
      timeframe: options.timeframe ?? "UNKNOWN",
      minCandles: 1
    }
  );

  const requiredCandles =
    config.segments * config.minCandlesPerSegment;

  if (candles.length < requiredCandles) {
    return {
      status: "INSUFFICIENT_DATA",
      dataType: "HISTORICAL_ONLY",
      timeframe: options.timeframe ?? "UNKNOWN",
      sampleSize: candles.length,
      requiredCandles,
      segments: [],
      note:
        "Not enough historical candles to compare all periods."
    };
  }

  const periods = [];

  for (let i = 0; i < config.segments; i++) {
    const startIndex = Math.floor(
      (i * candles.length) / config.segments
    );

    const endIndex = Math.floor(
      ((i + 1) * candles.length) / config.segments
    );

    const periodCandles = candles.slice(
      startIndex,
      endIndex
    );

    const result = calculateHistoricalCandleComposition(
      periodCandles,
      {
        timeframe: options.timeframe ?? "UNKNOWN",
        minCandles: config.minCandlesPerSegment
      }
    );

    periods.push({
      period: i + 1,
      startIndex,
      endIndex: endIndex - 1,
      startTime: periodCandles[0].timestamp,
      endTime: periodCandles[
        periodCandles.length - 1
      ].timestamp,
      sampleSize: result.sampleSize,
      counts: result.counts,
      percentages: result.percentages
    });
  }

  function spreadFor(key) {
    const values = periods.map(
      period => period.percentages[key]
    );

    return Number(
      (Math.max(...values) - Math.min(...values)).toFixed(1)
    );
  }

  return {
    status: "OK",
    dataType: "HISTORICAL_ONLY",
    timeframe: options.timeframe ?? "UNKNOWN",
    sampleSize: candles.length,
    overallPercentages: overall.percentages,
    segmentCount: periods.length,
    segments: periods,
    percentageSpread: {
      bullish: spreadFor("bullish"),
      bearish: spreadFor("bearish"),
      neutral: spreadFor("neutral")
    },
    note:
      "This report compares past candle composition across historical periods. It does not predict future market movement or provide trading signals."
  };
}
