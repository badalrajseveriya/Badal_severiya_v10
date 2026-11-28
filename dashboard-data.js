
// ======================================================
// BADAL SEVERIYA V12
// HISTORICAL DASHBOARD DATA FORMATTER
// Educational and historical analysis only
// No live trading signals, forecasts or order execution
// ======================================================

const NOTE =
  "Historical educational dashboard only. No forecasts, probabilities or trading recommendations.";

const REQUIRED_SECTIONS = [
  "dataQuality",
  "marketIndicators",
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

function safeCount(value, fallback = 0) {
  return isFiniteNumber(value) && value >= 0
    ? value
    : fallback;
}

// ------------------------------------------------------
// REPORT VALIDATION
// ------------------------------------------------------

function validateDashboardReport(report) {
  const errors = [];

  if (!isObject(report)) {
    return {
      valid: false,
      errors: ["Historical report must be an object."]
    };
  }

  if (report.status !== "OK") {
    errors.push("Historical report status is not OK.");
  }

  if (report.dataType !== "HISTORICAL_ONLY") {
    errors.push("Report must contain historical data only.");
  }

  if (!isObject(report.reportInfo)) {
    errors.push("Report information is missing.");
  }

  if (!isObject(report.summary)) {
    errors.push("Report summary is missing.");
  }

  if (!isObject(report.sections)) {
    errors.push("Report sections are missing.");
  } else {
    for (const name of REQUIRED_SECTIONS) {
      if (!isObject(report.sections[name])) {
        errors.push(
          `${name} dashboard section is missing.`
        );
      }
    }
  }

  if (
    report.reportInfo &&
    (
      !Number.isInteger(report.reportInfo.candleCount) ||
      report.reportInfo.candleCount < 1
    )
  ) {
    errors.push("Report candle count is invalid.");
  }

  if (
    report.reportInfo &&
    (
      typeof report.reportInfo.generatedAt !== "string" ||
      !Number.isFinite(
        Date.parse(report.reportInfo.generatedAt)
      )
    )
  ) {
    errors.push("Report generatedAt timestamp is invalid.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ------------------------------------------------------
// DATA QUALITY PANEL
// ------------------------------------------------------

function buildDataQualityPanel(section) {
  return {
    status: section.status ?? "UNKNOWN",
    quality: section.quality ?? "UNKNOWN",

    issueCount: safeCount(section.issueCount),

    checks: safeObject(section.checks)
  };
}

// ------------------------------------------------------
// MARKET INDICATORS PANEL
// ------------------------------------------------------

function buildMarketIndicatorsPanel(section) {
  const indicators = {};

  for (const [name, value] of Object.entries(
    safeObject(section)
  )) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      isFiniteNumber(value)
    ) {
      indicators[name] = value;
    }
  }

  return {
    count: Object.keys(indicators).length,
    indicators
  };
}

// ------------------------------------------------------
// MARKET STRUCTURE PANEL
// ------------------------------------------------------

function buildMarketStructurePanel(section) {
  const pivotHighs = safeArray(
    section.recentPivotHighs
  );

  const pivotLows = safeArray(
    section.recentPivotLows
  );

  const structureEvents = safeArray(
    section.recentStructureEvents
  );

  const liquidity = safeArray(
    section.liquidity
  );

  const fairValueGaps = safeArray(
    section.recentFairValueGaps
  );

  const orderBlocks = safeArray(
    section.recentOrderBlocks
  );

  return {
    trend: section.trend ?? "UNKNOWN",

    pivotHighCount: safeCount(
      section.pivotHighCount
    ),

    pivotLowCount: safeCount(
      section.pivotLowCount
    ),

    structureEventCount: safeCount(
      section.structureEventCount
    ),

    liquidityCount: safeCount(
      section.liquidityCount,
      liquidity.length
    ),

    fairValueGapCount: safeCount(
      section.fairValueGapCount
    ),

    orderBlockCount: safeCount(
      section.orderBlockCount
    ),

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

    detailLimitPerGroup: safeCount(
      section.detailLimitPerGroup,
      RECENT_STRUCTURE_LIMIT
    )
  };
}

// ------------------------------------------------------
// SUPPORT AND RESISTANCE PANEL
// ------------------------------------------------------

function buildSupportResistancePanel(section) {
  const supports = safeArray(section.supports);
  const resistances = safeArray(section.resistances);

  return {
    supportCount: supports.length,
    resistanceCount: resistances.length,
    supports,
    resistances
  };
}

// ------------------------------------------------------
// FIBONACCI PANEL
// ------------------------------------------------------

function buildFibonacciPanel(section) {
  return {
    swing: section.swing ?? null,
    retracement: safeArray(section.retracement),
    extensions: safeArray(section.extensions)
  };
}

// ------------------------------------------------------
// CANDLE PATTERNS PANEL
// ------------------------------------------------------

function buildCandlePatternsPanel(section) {
  const patterns = safeArray(section.patterns);

  return {
    totalPatterns: safeCount(
      section.totalPatterns,
      patterns.length
    ),

    counts: safeObject(section.counts),

    patterns
  };
}

// ------------------------------------------------------
// MAIN DASHBOARD FORMATTER
// ------------------------------------------------------

export function formatHistoricalDashboardData(report) {
  try {
    const validation =
      validateDashboardReport(report);

    if (!validation.valid) {
      throw new Error(
        `Dashboard validation failed: ${validation.errors.join(" ")}`
      );
    }

    const sections = report.sections;

    const panels = {
      dataQuality: buildDataQualityPanel(
        sections.dataQuality
      ),

      marketIndicators: buildMarketIndicatorsPanel(
        sections.marketIndicators
      ),

      marketStructure: buildMarketStructurePanel(
        sections.marketStructure
      ),

      supportResistance: buildSupportResistancePanel(
        sections.supportResistance
      ),

      fibonacci: buildFibonacciPanel(
        sections.fibonacci
      ),

      candlePatterns: buildCandlePatternsPanel(
        sections.candlePatterns
      )
    };

    return {
      status: "OK",
      version: "12.0",
      module: "HISTORICAL_DASHBOARD_DATA",
      dataType: "HISTORICAL_ONLY",

      dashboardInfo: {
        timeframe: report.reportInfo.timeframe ?? "15m",

        candleCount: report.reportInfo.candleCount,

        generatedAt: report.reportInfo.generatedAt,

        panelCount: Object.keys(panels).length
      },

      validation: {
        status: "OK",
        valid: true,
        checkedSections: REQUIRED_SECTIONS.length,
        errors: []
      },

      overview: {
        dataQuality: report.summary.dataQuality,

        dataQualityIssues:
          report.summary.dataQualityIssues,

        totalCandlePatterns:
          panels.candlePatterns.totalPatterns,

        supportZones:
          panels.supportResistance.supportCount,

        resistanceZones:
          panels.supportResistance.resistanceCount
      },

      panels,

      note: NOTE
    };

  } catch (error) {
    return {
      status: "ERROR",
      version: "12.0",
      module: "HISTORICAL_DASHBOARD_DATA",
      dataType: "HISTORICAL_ONLY",
      error: error.message,
      note: NOTE
    };
  }
}
