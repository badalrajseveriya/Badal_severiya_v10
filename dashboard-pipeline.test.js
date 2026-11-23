
import assert from "node:assert/strict";

import {
  generateHistoricalReport
} from "./historical-analysis-report.js";

import {
  formatHistoricalDashboardData
} from "./dashboard-data.js";

import {
  createHistoricalDashboardDisplay
} from "./dashboard-display.js";

import {
  createHistoricalDashboardUIModel
} from "./dashboard-ui-model.js";

import {
  renderHistoricalDashboard
} from "./dashboard-renderer.js";

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

// 1. Generate historical report
const report = generateHistoricalReport({
  candles: makeCandles(),
  timeframe: "15m"
});

assert.equal(report.status, "OK");

// 2. Format dashboard data
const dashboardData =
  formatHistoricalDashboardData(report);

assert.equal(dashboardData.status, "OK");

// 3. Create dashboard display
const display =
  createHistoricalDashboardDisplay(dashboardData);

assert.equal(display.status, "OK");

// 4. Create dashboard UI model
const uiModel =
  createHistoricalDashboardUIModel(display);

assert.equal(uiModel.status, "OK");

// 5. Render historical dashboard
const rendered =
  renderHistoricalDashboard(uiModel);

assert.equal(rendered.status, "OK");

// 6. Verify historical-only data
assert.equal(
  rendered.dataType,
  "HISTORICAL_ONLY"
);

// 7. Verify dashboard renderer
assert.equal(
  rendered.module,
  "HISTORICAL_DASHBOARD_RENDERER"
);

// 8. Verify all six dashboard cards
assert.equal(
  rendered.viewport.cardCount,
  6
);

assert.equal(
  rendered.viewport.visibleCardCount,
  6
);

// 9. Verify render tree
assert.equal(
  rendered.renderTree.component,
  "DashboardRoot"
);

assert.equal(
  rendered.renderTree.children.length,
  7
);

// 10. Verify historical restriction
assert.match(
  rendered.note,
  /Historical educational dashboard/
);

assert.match(
  rendered.note,
  /No forecasts/
);

console.log(
  "All dashboard pipeline integration tests passed."
);
