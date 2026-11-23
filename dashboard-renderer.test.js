
import assert from "node:assert/strict";

import {
  renderHistoricalDashboard
} from "./dashboard-renderer.js";

import {
  createHistoricalDashboardUIModel
} from "./dashboard-ui-model.js";

import {
  createHistoricalDashboardDisplay
} from "./dashboard-display.js";

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

function makeRenderer() {
  const report = generateHistoricalReport({
    candles: makeCandles(),
    timeframe: "15m"
  });

  assert.equal(report.status, "OK");

  const dashboardData =
    formatHistoricalDashboardData(report);

  assert.equal(dashboardData.status, "OK");

  const display =
    createHistoricalDashboardDisplay(dashboardData);

  assert.equal(display.status, "OK");

  const uiModel =
    createHistoricalDashboardUIModel(display);

  assert.equal(uiModel.status, "OK");

  return renderHistoricalDashboard(uiModel);
}

// 1. Complete renderer output
{
  const result = makeRenderer();

  assert.equal(result.status, "OK");
  assert.equal(
    result.module,
    "HISTORICAL_DASHBOARD_RENDERER"
  );
  assert.equal(result.dataType, "HISTORICAL_ONLY");
}

// 2. Screen component
{
  const result = makeRenderer();

  assert.equal(
    result.screen.component,
    "DashboardScreen"
  );
}

// 3. Dashboard title
{
  const result = makeRenderer();

  assert.equal(
    result.screen.header.title,
    "BADAL SEVERIYA V12"
  );
}

// 4. Timeframe
{
  const result = makeRenderer();

  assert.equal(result.screen.metadata.timeframe, "15m");
}

// 5. Candle count
{
  const result = makeRenderer();

  assert.equal(result.screen.metadata.candleCount, 300);
}

// 6. Responsive viewport
{
  const result = makeRenderer();

  assert.equal(
    result.viewport.scrollable,
    true
  );

  assert.equal(
    result.viewport.cardCount,
    6
  );
}

// 7. Visible card count
{
  const result = makeRenderer();

  assert.equal(
    result.viewport.visibleCardCount,
    6
  );
}

// 8. Render tree root
{
  const result = makeRenderer();

  assert.equal(
    result.renderTree.component,
    "DashboardRoot"
  );

  assert.equal(
    result.renderTree.direction,
    "VERTICAL"
  );
}

// 9. Header component
{
  const result = makeRenderer();

  assert.equal(
    result.renderTree.children[0].component,
    "DashboardHeader"
  );
}

// 10. Six dashboard cards
{
  const result = makeRenderer();

  const cards =
    result.renderTree.children.slice(1);

  assert.equal(cards.length, 6);
}

// 11. Card component type
{
  const result = makeRenderer();

  const cards =
    result.renderTree.children.slice(1);

  for (const card of cards) {
    assert.equal(card.component, "DashboardCard");
  }
}

// 12. Card order
{
  const result = makeRenderer();

  const cards =
    result.renderTree.children.slice(1);

  assert.equal(cards[0].order, 1);
  assert.equal(cards[5].order, 6);
}

// 13. Card IDs
{
  const result = makeRenderer();

  const cards =
    result.renderTree.children.slice(1);

  assert.deepEqual(
    cards.map(card => card.id),
    [
      "data-quality",
      "market-indicators",
      "market-structure",
      "support-resistance",
      "fibonacci",
      "candle-patterns"
    ]
  );
}

// 14. Empty state
{
  const result = makeRenderer();

  assert.equal(
    result.emptyState.component,
    "EmptyState"
  );

  assert.equal(
    result.emptyState.visible,
    false
  );
}

// 15. Validation metadata
{
  const result = makeRenderer();

  assert.equal(result.validation.status, "OK");
  assert.equal(result.validation.valid, true);
  assert.equal(result.validation.checkedCards, 6);
}

// 16. Invalid input
{
  const result = renderHistoricalDashboard(null);

  assert.equal(result.status, "ERROR");
}

// 17. Historical-only restriction
{
  const result = makeRenderer();

  assert.equal(result.dataType, "HISTORICAL_ONLY");

  assert.match(result.note, /No forecasts/);
  assert.match(result.note, /trading recommendations/);
}

console.log("All 17 dashboard renderer tests passed.");
