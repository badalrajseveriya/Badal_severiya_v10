
import assert from "node:assert/strict";

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

// 1. Null report should not crash
{
  const result =
    formatHistoricalDashboardData(null);

  assert.equal(result.status, "ERROR");
}

// 2. Undefined report should not crash
{
  const result =
    formatHistoricalDashboardData(undefined);

  assert.equal(result.status, "ERROR");
}

// 3. Invalid report should return an error
{
  const result =
    formatHistoricalDashboardData({
      status: "INVALID"
    });

  assert.equal(result.status, "ERROR");
}

// 4. Null dashboard data should not crash
{
  const result =
    createHistoricalDashboardDisplay(null);

  assert.equal(result.status, "ERROR");
}

// 5. Undefined dashboard data should not crash
{
  const result =
    createHistoricalDashboardDisplay(undefined);

  assert.equal(result.status, "ERROR");
}

// 6. Null display should not crash
{
  const result =
    createHistoricalDashboardUIModel(null);

  assert.equal(result.status, "ERROR");
}

// 7. Undefined display should not crash
{
  const result =
    createHistoricalDashboardUIModel(undefined);

  assert.equal(result.status, "ERROR");
}

// 8. Null renderer input should return error
{
  const result =
    renderHistoricalDashboard(null);

  assert.equal(result.status, "ERROR");
}

// 9. Undefined renderer input should return error
{
  const result =
    renderHistoricalDashboard(undefined);

  assert.equal(result.status, "ERROR");
}

// 10. Invalid data type should be rejected
{
  const result = renderHistoricalDashboard({
    status: "OK",
    dataType: "LIVE",
    screen: {},
    layout: {
      cards: []
    }
  });

  assert.equal(result.status, "ERROR");
}

// 11. Historical-only output restriction
{
  const result =
    renderHistoricalDashboard(null);

  assert.equal(
    result.dataType,
    "HISTORICAL_ONLY"
  );
}

console.log(
  "All 11 dashboard validation tests passed."
);
