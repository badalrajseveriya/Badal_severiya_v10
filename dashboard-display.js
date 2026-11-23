
// ======================================================
// BADAL SEVERIYA V12
// HISTORICAL DASHBOARD DISPLAY STRUCTURE
// Educational and historical analysis only
// No forecasts, probabilities or trading recommendations
// ======================================================

const NOTE =
  "Historical educational display only. No forecasts, probabilities or trading recommendations.";

const REQUIRED_PANELS = [
  "dataQuality",
  "marketIndicators",
  "marketStructure",
  "supportResistance",
  "fibonacci",
  "candlePatterns"
];

// ------------------------------------------------------
// HELPERS
// ------------------------------------------------------

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value) {
  return isObject(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

// ------------------------------------------------------
// DISPLAY VALIDATION
// ------------------------------------------------------

function validateDashboardData(data) {
  const errors = [];

  if (!isObject(data)) {
    return {
      valid: false,
      errors: ["Dashboard data must be an object."]
    };
  }

  if (data.status !== "OK") {
    errors.push("Dashboard data status is invalid.");
  }

  if (data.dataType !== "HISTORICAL_ONLY") {
    errors.push("Only historical data is permitted.");
  }

  if (!isObject(data.dashboardInfo)) {
    errors.push("Dashboard information is missing.");
  }

  if (!isObject(data.panels)) {
    errors.push("Dashboard panels are missing.");
  } else {
    for (const panel of REQUIRED_PANELS) {
      if (!isObject(data.panels[panel])) {
        errors.push(`Missing dashboard panel: ${panel}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ------------------------------------------------------
// DISPLAY CARD BUILDERS
// ------------------------------------------------------

function createDataQualityCard(panel) {
  return {
    id: "data-quality",
    title: "Data Quality",
    status: panel.quality ?? "UNKNOWN",
    details: {
      issueCount: panel.issueCount ?? 0,
      checks: safeObject(panel.checks)
    }
  };
}

function createMarketIndicatorsCard(panel) {
  return {
    id: "market-indicators",
    title: "Market Indicators",
    count: panel.count ?? 0,
    indicators: safeObject(panel.indicators)
  };
}

function createMarketStructureCard(panel) {
  return {
    id: "market-structure",
    title: "Market Structure",
    trend: panel.trend ?? null,
    details: {
      pivotHighCount: panel.pivotHighCount ?? 0,
      pivotLowCount: panel.pivotLowCount ?? 0,
      structureEventCount:
        panel.structureEventCount ?? 0,
      fairValueGapCount:
        panel.fairValueGapCount ?? 0,
      orderBlockCount:
        panel.orderBlockCount ?? 0
    },
    liquidity: safeArray(panel.liquidity)
  };
}

function createSupportResistanceCard(panel) {
  return {
    id: "support-resistance",
    title: "Support & Resistance",
    supportCount: safeArray(panel.supports).length,
    resistanceCount: safeArray(panel.resistances).length,
    supports: safeArray(panel.supports),
    resistances: safeArray(panel.resistances)
  };
}

function createFibonacciCard(panel) {
  return {
    id: "fibonacci",
    title: "Fibonacci Analysis",
    swing: panel.swing ?? null,
    retracement: safeArray(panel.retracement),
    extensions: safeArray(panel.extensions)
  };
}

function createCandlePatternsCard(panel) {
  return {
    id: "candle-patterns",
    title: "Candle Pattern Summary",
    totalPatterns: panel.totalPatterns ?? 0,
    counts: safeObject(panel.counts),
    patterns: safeArray(panel.patterns)
  };
}

// ------------------------------------------------------
// MAIN DISPLAY STRUCTURE
// ------------------------------------------------------

export function createHistoricalDashboardDisplay(data) {
  try {
    const validation = validateDashboardData(data);

    if (!validation.valid) {
      throw new Error(
        `Display validation failed: ${validation.errors.join(" ")}`
      );
    }

    const panels = data.panels;

    const cards = [
      createDataQualityCard(panels.dataQuality),
      createMarketIndicatorsCard(panels.marketIndicators),
      createMarketStructureCard(panels.marketStructure),
      createSupportResistanceCard(panels.supportResistance),
      createFibonacciCard(panels.fibonacci),
      createCandlePatternsCard(panels.candlePatterns)
    ];

    return {
      status: "OK",
      version: "12.0",
      module: "HISTORICAL_DASHBOARD_DISPLAY",
      dataType: "HISTORICAL_ONLY",

      screen: {
        screenId: "historical-dashboard",
        title: "BADAL SEVERIYA V12",
        subtitle: "Historical Market Analysis",
        timeframe:
          data.dashboardInfo.timeframe ?? "15m",
        candleCount:
          data.dashboardInfo.candleCount ?? 0,
        generatedAt:
          data.dashboardInfo.generatedAt ?? null
      },

      layout: {
        type: "VERTICAL_CARDS",
        cardCount: cards.length,
        cards
      },

      validation: {
        status: "OK",
        valid: true,
        checkedPanels: REQUIRED_PANELS.length,
        errors: []
      },

      note: NOTE
    };

  } catch (error) {
    return {
      status: "ERROR",
      version: "12.0",
      module: "HISTORICAL_DASHBOARD_DISPLAY",
      dataType: "HISTORICAL_ONLY",
      error: error.message,
      note: NOTE
    };
  }
}
