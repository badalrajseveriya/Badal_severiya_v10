
// ======================================================
// BADAL SEVERIYA V12
// MASTER HISTORICAL ANALYSIS ENGINE
// 1D + 15M | Historical Educational Analysis Only
// No forecasts, future probabilities or trading signals
// ======================================================

import {
  calculateHistoricalCandleComposition
} from "./historical-candle-composition.js";

const NOTE =
  "Historical educational analysis only. No forecasts, future probabilities or trading recommendations.";

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function nearestBelow(zones, price) {
  return zones
    .filter(zone =>
      isFiniteNumber(zone.price) &&
      zone.price < price
    )
    .sort((a, b) => b.price - a.price)[0] ?? null;
}

function nearestAbove(zones, price) {
  return zones
    .filter(zone =>
      isFiniteNumber(zone.price) &&
      zone.price > price
    )
    .sort((a, b) => a.price - b.price)[0] ?? null;
}

function isPriceInsideZone(price, zone) {
  return (
    isFiniteNumber(zone?.lower) &&
    isFiniteNumber(zone?.upper) &&
    zone.lower <= zone.upper &&
    price >= zone.lower &&
    price <= zone.upper
  );
}

function recentDirectionalEvent(events, direction, candleCount) {
  const recentStart = Math.max(0, candleCount - 20);

  return events.some(event =>
    event?.direction === direction &&
    Number.isInteger(event.index) &&
    event.index >= recentStart &&
    event.index < candleCount
  );
}

function calculateHistoricalLevels(report, candles) {
  const structure = report.sections.marketStructure;
  const sr = report.sections.supportResistance;

  const currentPrice = candles[candles.length - 1].close;
  const supports = Array.isArray(sr.supports) ? sr.supports : [];
  const resistances = Array.isArray(sr.resistances)
    ? sr.resistances
    : [];

  const support = nearestBelow(supports, currentPrice);
  const resistance = nearestAbove(resistances, currentPrice);
  const trend = structure.trend ?? "UNKNOWN";

  if (trend === "BULLISH") {
    return {
      status: "OK",
      trend,
      currentPrice,
      levels: [
        {
          name: "TARGET",
          price: resistance?.price ?? null,
          source: "HISTORICAL_RESISTANCE",
          color: "GREEN"
        },
        {
          name: "ENTRY",
          price: support?.price ?? null,
          source: "HISTORICAL_SUPPORT",
          color: "YELLOW"
        },
        {
          name: "STOP_LOSS",
          price: support?.lower ?? null,
          source: "HISTORICAL_SUPPORT_ZONE_LOWER",
          color: "RED"
        }
      ],
      note: "Historical reference levels only. Not actionable trade levels."
    };
  }

  if (trend === "BEARISH") {
    return {
      status: "OK",
      trend,
      currentPrice,
      levels: [
        {
          name: "STOP_LOSS",
          price: resistance?.upper ?? null,
          source: "HISTORICAL_RESISTANCE_ZONE_UPPER",
          color: "RED"
        },
        {
          name: "ENTRY",
          price: resistance?.price ?? null,
          source: "HISTORICAL_RESISTANCE",
          color: "YELLOW"
        },
        {
          name: "TARGET",
          price: support?.price ?? null,
          source: "HISTORICAL_SUPPORT",
          color: "GREEN"
        }
      ],
      note: "Historical reference levels only. Not actionable trade levels."
    };
  }

  return {
    status: "INSUFFICIENT_DATA",
    trend: "UNKNOWN",
    currentPrice,
    levels: [],
    note: "Historical direction is not sufficiently classified."
  };
}

function calculateHistoricalSMC(structure, candles) {
  if (
    !structure ||
    structure.status !== "OK" ||
    structure.dataType !== "HISTORICAL_ONLY"
  ) {
    return {
      status: "WAITING_FOR_DATA",
      entry: null,
      exit: null,
      note: "Historical SMC data is unavailable."
    };
  }

  const current = candles[candles.length - 1];
  const price = current.close;

  const orderBlocks = Array.isArray(structure.orderBlocks)
    ? structure.orderBlocks
    : [];

  const gaps = Array.isArray(structure.fairValueGaps)
    ? structure.fairValueGaps
    : [];

  const liquidity = Array.isArray(structure.liquidity)
    ? structure.liquidity
    : [];

  const events = Array.isArray(structure.structureEvents)
    ? structure.structureEvents
    : [];

  const bullishOB = orderBlocks.some(zone =>
    zone.type === "BULLISH_ORDER_BLOCK" &&
    isPriceInsideZone(price, zone)
  );

  const bearishOB = orderBlocks.some(zone =>
    zone.type === "BEARISH_ORDER_BLOCK" &&
    isPriceInsideZone(price, zone)
  );

  const bullishFVG = gaps.some(zone =>
    zone.type === "BULLISH_FVG" &&
    zone.status === "UNMITIGATED_IN_AVAILABLE_HISTORY" &&
    isPriceInsideZone(price, zone)
  );

  const bearishFVG = gaps.some(zone =>
    zone.type === "BEARISH_FVG" &&
    zone.status === "UNMITIGATED_IN_AVAILABLE_HISTORY" &&
    isPriceInsideZone(price, zone)
  );

  const bullishEvent = recentDirectionalEvent(
    events,
    "BULLISH",
    candles.length
  );

  const bearishEvent = recentDirectionalEvent(
    events,
    "BEARISH",
    candles.length
  );

  const nearEqualLows = liquidity.some(zone =>
    zone.type === "EQUAL_LOWS" &&
    isFiniteNumber(zone.price) &&
    zone.price !== 0 &&
    Math.abs(zone.price - current.low) / zone.price <= 0.002
  );

  const nearEqualHighs = liquidity.some(zone =>
    zone.type === "EQUAL_HIGHS" &&
    isFiniteNumber(zone.price) &&
    zone.price !== 0 &&
    Math.abs(zone.price - current.high) / zone.price <= 0.002
  );

  const entryChecks = [
    bullishOB,
    bullishFVG,
    bullishEvent,
    nearEqualLows
  ];

  const exitChecks = [
    bearishOB,
    bearishFVG,
    bearishEvent,
    nearEqualHighs
  ];

  const entryEvidence = entryChecks.filter(Boolean).length;
  const exitEvidence = exitChecks.filter(Boolean).length;

  return {
    status: "OK",

    entry: {
      evidenceCount: entryEvidence,
      totalChecks: 4,
      historicalPatternScore: entryEvidence * 25,
      checks: {
        bullishOrderBlock: bullishOB,
        bullishFVG: bullishFVG,
        recentBullishStructureEvent: bullishEvent,
        nearEqualLows: nearEqualLows
      }
    },

    exit: {
      evidenceCount: exitEvidence,
      totalChecks: 4,
      historicalPatternScore: exitEvidence * 25,
      checks: {
        bearishOrderBlock: bearishOB,
        bearishFVG: bearishFVG,
        recentBearishStructureEvent: bearishEvent,
        nearEqualHighs: nearEqualHighs
      }
    },

    note:
      "Historical SMC pattern-match score only. It does not establish actual institutional orders or future probability."
  };
}

// ------------------------------------------------------
// PUBLIC MASTER ANALYSIS FUNCTION
// ------------------------------------------------------

export function calculateHistoricalMasterAnalysis(input) {
  try {
    if (!input || typeof input !== "object") {
      throw new Error("Master analysis input is required.");
    }

    const {
      report,
      structure,
      candles,
      timeframe
    } = input;

    if (!["1d", "15m"].includes(timeframe)) {
      throw new Error("Timeframe must be 1d or 15m.");
    }

    if (!Array.isArray(candles) || candles.length === 0) {
      return {
        status: "WAITING_FOR_DATA",
        version: "12.0",
        module: "MASTER_HISTORICAL_ANALYSIS",
        timeframe,
        dataType: "HISTORICAL_ONLY",
        candleCount: 0,
        composition: null,
        historicalLevels: null,
        smc: null,
        note: NOTE
      };
    }

    if (
      !report ||
      report.status !== "OK" ||
      report.dataType !== "HISTORICAL_ONLY" ||
      !report.sections ||
      !report.reportInfo ||
      report.reportInfo.timeframe !== timeframe
    ) {
      throw new Error("A valid matching historical report is required.");
    }

    if (
      report.reportInfo.candleCount !== candles.length
    ) {
      throw new Error("Report and candle counts do not match.");
    }

    if (
      !structure ||
      structure.status !== "OK" ||
      structure.dataType !== "HISTORICAL_ONLY"
    ) {
      throw new Error("Valid historical market structure is required.");
    }

    if (
      structure.summary?.candleCount !== candles.length
    ) {
      throw new Error("Market structure and candle counts do not match.");
    }

    const composition = calculateHistoricalCandleComposition(
      candles,
      { timeframe }
    );

    if (composition.status !== "OK") {
      throw new Error("Historical candle composition calculation failed.");
    }

    const percentageTotal =
      composition.percentages.bullish +
      composition.percentages.bearish +
      composition.percentages.neutral;

    if (Math.abs(percentageTotal - 100) > 0.2) {
      throw new Error("Historical composition percentages do not total 100%.");
    }

    const historicalLevels = calculateHistoricalLevels(
      report,
      candles
    );

    const smc = calculateHistoricalSMC(
      structure,
      candles
    );

    return {
      status: "OK",
      version: "12.0",
      module: "MASTER_HISTORICAL_ANALYSIS",
      timeframe,
      dataType: "HISTORICAL_ONLY",

      candleCount: candles.length,

      composition: {
        sampleSize: composition.sampleSize,
        counts: composition.counts,
        percentages: composition.percentages,
        percentageTotal: percentageTotal
      },

      historicalLevels,
      smc,

      validation: {
        reportValid: true,
        structureValid: true,
        candleCountsMatch: true,
        percentagesTotal100:
          Math.abs(percentageTotal - 100) <= 0.2
      },

      note: NOTE
    };

  } catch (error) {
    return {
      status: "ERROR",
      version: "12.0",
      module: "MASTER_HISTORICAL_ANALYSIS",
      dataType: "HISTORICAL_ONLY",
      error: error.message,
      note: NOTE
    };
  }
}
