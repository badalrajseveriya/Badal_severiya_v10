
import assert from "node:assert/strict";

import {
  formatHistoricalDashboardData
} from "./dashboard-data.js";

import {
  generateHistoricalReport
} from "./historical-analysis-report.js";

const START = Date.UTC(2026, 0, 1, 3, 45);

function makeCandles(count = 300) {
  return Array.from({ length: count }, (_, i) => {
    const close =
      25000 + Math.sin(i / 5) * 100 + i * 0.5;

    return {
      timestamp: new Date(
        START + i * 15 * 60 * 1000
      ).toISOString(),
      open: close - 2,
      high: close + 10,
      low: close - 10,
      close,
      volume: 1000 + i
    };
  });
}

function makeDashboardData() {
  const report = generateHistoricalReport({
    candles: makeCandles(),
    timeframe: "15m"
  });

  assert.equal(report.status, "OK");

  return formatHistoricalDashboardData(report);
}

// 1. Formatter output status
{
  const result = makeDashboardData();

  assert.equal(result.status, "OK");
}

// 2. Historical-only data type
{
  const result = makeDashboardData();

  assert.equal(
    result.dataType,
    "HISTORICAL_ONLY"
  );
}

// 3. Correct module name
{
  const result = makeDashboardData();

  assert.equal(
    result.module,
    "HISTORICAL_DASHBOARD_DATA"
  );
}

// 4. Correct version
{
  const result = makeDashboardData();

  assert.equal(result.version, "12.0");
}

// 5. Timeframe consistency
{
  const result = makeDashboardData();

  assert.equal(
    result.dashboardInfo.timeframe,
    "15m"
  );
}

// 6. Candle count consistency
{
  const result = makeDashboardData();

  assert.equal(
    result.dashboardInfo.candleCount,
    300
  );
}

// 7. Six panels are present
{
  const result = makeDashboardData();

  assert.equal(
    result.dashboardInfo.panelCount,
    6
  );

  assert.equal(
    Object.keys(result.panels).length,
    6
  );
}

// 8. Required panel names
{
  const result = makeDashboardData();

  assert.deepEqual(
    Object.keys(result.panels),
    [
      "dataQuality",
      "marketIndicators",
      "marketStructure",
      "supportResistance",
      "fibonacci",
      "candlePatterns"
    ]
  );
}

// 9. Validation metadata
{
  const result = makeDashboardData();

  assert.equal(result.validation.status, "OK");
  assert.equal(result.validation.valid, true);
  assert.equal(result.validation.checkedSections, 6);
  assert.deepEqual(result.validation.errors, []);
}

// 10. Support and resistance counts
{
  const result = makeDashboardData();

  assert.equal(
    result.panels.supportResistance.supportCount,
    result.panels.supportResistance.supports.length
  );

  assert.equal(
    result.panels.supportResistance.resistanceCount,
    result.panels.supportResistance.resistances.length
  );
}

// 11. Candle pattern count
{
  const result = makeDashboardData();

  assert.equal(
    result.panels.candlePatterns.totalPatterns,
    result.panels.candlePatterns.patterns.length
  );
}

// 12. Market indicator count
{
  const result = makeDashboardData();

  assert.equal(
    result.panels.marketIndicators.count,
    Object.keys(
      result.panels.marketIndicators.indicators
    ).length
  );
}

// 13. Historical-only restriction note
{
  const result = makeDashboardData();

  assert.match(result.note, /Historical educational dashboard/);
  assert.match(result.note, /No forecasts/);
  assert.match(result.note, /trading recommendations/);
}

// 14. Invalid report returns error
{
  const result =
    formatHistoricalDashboardData(null);

  assert.equal(result.status, "ERROR");
}

console.log(
  "All 14 dashboard consistency tests passed."
);
