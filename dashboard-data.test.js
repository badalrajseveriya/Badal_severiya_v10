
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

function makeDashboard() {
  const report = generateHistoricalReport({
    candles: makeCandles(),
    timeframe: "15m"
  });

  assert.equal(report.status, "OK");

  return formatHistoricalDashboardData(report);
}

// 1. Complete dashboard output
{
  const result = makeDashboard();

  assert.equal(result.status, "OK");
  assert.equal(result.module, "HISTORICAL_DASHBOARD_DATA");
  assert.equal(result.dataType, "HISTORICAL_ONLY");
}

// 2. All six panels
{
  const result = makeDashboard();

  const expected = [
    "dataQuality",
    "marketIndicators",
    "marketStructure",
    "supportResistance",
    "fibonacci",
    "candlePatterns"
  ];

  assert.deepEqual(
    Object.keys(result.panels),
    expected
  );
}

// 3. Dashboard panel count
{
  const result = makeDashboard();

  assert.equal(result.dashboardInfo.panelCount, 6);
}

// 4. Candle count
{
  const result = makeDashboard();

  assert.equal(result.dashboardInfo.candleCount, 300);
}

// 5. Timeframe
{
  const result = makeDashboard();

  assert.equal(result.dashboardInfo.timeframe, "15m");
}

// 6. Generated timestamp
{
  const result = makeDashboard();

  assert.ok(
    Number.isFinite(
      Date.parse(result.dashboardInfo.generatedAt)
    )
  );
}

// 7. Data quality panel
{
  const result = makeDashboard();

  assert.ok(
    typeof result.panels.dataQuality.quality === "string"
  );

  assert.ok(
    Number.isFinite(
      result.panels.dataQuality.issueCount
    )
  );
}

// 8. Market indicators panel
{
  const result = makeDashboard();

  assert.ok(
    result.panels.marketIndicators.count >= 0
  );

  assert.ok(
    typeof result.panels.marketIndicators.indicators === "object"
  );
}

// 9. Support and resistance arrays
{
  const result = makeDashboard();

  assert.ok(
    Array.isArray(result.panels.supportResistance.supports)
  );

  assert.ok(
    Array.isArray(result.panels.supportResistance.resistances)
  );
}

// 10. Fibonacci arrays
{
  const result = makeDashboard();

  assert.ok(
    Array.isArray(result.panels.fibonacci.retracement)
  );

  assert.ok(
    Array.isArray(result.panels.fibonacci.extensions)
  );
}

// 11. Candle pattern panel
{
  const result = makeDashboard();

  assert.ok(
    Array.isArray(result.panels.candlePatterns.patterns)
  );

  assert.ok(
    Number.isFinite(
      result.panels.candlePatterns.totalPatterns
    )
  );
}

// 12. Invalid report
{
  const result = formatHistoricalDashboardData(null);

  assert.equal(result.status, "ERROR");
}

// 13. Missing sections
{
  const result = formatHistoricalDashboardData({
    status: "OK",
    dataType: "HISTORICAL_ONLY",
    reportInfo: {
      candleCount: 300,
      generatedAt: new Date().toISOString()
    },
    summary: {},
    sections: {}
  });

  assert.equal(result.status, "ERROR");
}

// 14. Invalid report status
{
  const result = formatHistoricalDashboardData({
    status: "ERROR"
  });

  assert.equal(result.status, "ERROR");
}

// 15. Historical-only restriction
{
  const result = makeDashboard();

  assert.equal(result.dataType, "HISTORICAL_ONLY");

  assert.match(result.note, /No forecasts/);
}

console.log("All 15 dashboard tests passed.");
