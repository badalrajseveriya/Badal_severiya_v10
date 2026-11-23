
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

function makeUIModel() {
  const report = generateHistoricalReport({
    candles: makeCandles(),
    timeframe: "15m"
  });

  assert.equal(report.status, "OK");

  const data =
    formatHistoricalDashboardData(report);

  assert.equal(data.status, "OK");

  const display =
    createHistoricalDashboardDisplay(data);

  assert.equal(display.status, "OK");

  return createHistoricalDashboardUIModel(display);
}

// 1. UI model status
{
  const result = makeUIModel();

  assert.equal(result.status, "OK");
}

// 2. Module identity
{
  const result = makeUIModel();

  assert.equal(
    result.module,
    "HISTORICAL_DASHBOARD_UI_MODEL"
  );
}

// 3. Historical-only restriction
{
  const result = makeUIModel();

  assert.equal(result.dataType, "HISTORICAL_ONLY");
  assert.match(result.note, /No forecasts/);
  assert.match(result.note, /trading recommendations/);
}

// 4. Screen information
{
  const result = makeUIModel();

  assert.equal(
    result.screen.id,
    "historical-dashboard"
  );

  assert.equal(
    result.screen.title,
    "BADAL SEVERIYA V12"
  );

  assert.equal(result.screen.timeframe, "15m");
  assert.equal(result.screen.candleCount, 300);
}

// 5. Responsive layout type
{
  const result = makeUIModel();

  assert.equal(result.layout.type, "RESPONSIVE");
}

// 6. Six cards
{
  const result = makeUIModel();

  assert.equal(result.layout.cardCount, 6);
  assert.equal(result.layout.cards.length, 6);
}

// 7. Card IDs and order
{
  const result = makeUIModel();

  assert.deepEqual(
    result.layout.cards.map(card => card.id),
    [
      "data-quality",
      "market-indicators",
      "market-structure",
      "support-resistance",
      "fibonacci",
      "candle-patterns"
    ]
  );

  assert.deepEqual(
    result.layout.cards.map(card => card.order),
    [1, 2, 3, 4, 5, 6]
  );
}

// 8. Card visibility
{
  const result = makeUIModel();

  assert.equal(
    result.layout.cards.every(card => card.visible === true),
    true
  );
}

// 9. Card collapsibility
{
  const result = makeUIModel();

  assert.equal(
    result.layout.cards.every(card => card.collapsible === true),
    true
  );
}

// 10. Default expanded cards
{
  const result = makeUIModel();

  assert.deepEqual(
    result.layout.cards.map(card => card.defaultExpanded),
    [true, true, true, false, false, false]
  );
}

// 11. Card content
{
  const result = makeUIModel();

  for (const card of result.layout.cards) {
    assert.equal(typeof card.content, "object");
    assert.equal(card.content.id, card.id);
  }
}

// 12. Mobile layout
{
  const result = makeUIModel();

  assert.equal(result.layout.responsive.mobile.columns, 1);
  assert.equal(
    result.layout.responsive.mobile.cardDirection,
    "VERTICAL"
  );
  assert.equal(result.layout.responsive.mobile.scrollable, true);
}

// 13. Tablet layout
{
  const result = makeUIModel();

  assert.equal(result.layout.responsive.tablet.columns, 2);
  assert.equal(
    result.layout.responsive.tablet.cardDirection,
    "GRID"
  );
  assert.equal(result.layout.responsive.tablet.scrollable, true);
}

// 14. Desktop layout
{
  const result = makeUIModel();

  assert.equal(result.layout.responsive.desktop.columns, 3);
  assert.equal(
    result.layout.responsive.desktop.cardDirection,
    "GRID"
  );
  assert.equal(result.layout.responsive.desktop.scrollable, true);
}

// 15. Navigation sections
{
  const result = makeUIModel();

  assert.equal(result.navigation.type, "SINGLE_SCREEN");

  assert.deepEqual(
    result.navigation.sections,
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

// 16. Validation metadata
{
  const result = makeUIModel();

  assert.equal(result.validation.status, "OK");
  assert.equal(result.validation.valid, true);
  assert.equal(result.validation.checkedCards, 6);
  assert.deepEqual(result.validation.errors, []);
}

// 17. Invalid input
{
  const result =
    createHistoricalDashboardUIModel(null);

  assert.equal(result.status, "ERROR");
}

console.log(
  "All 17 dashboard UI integrity tests passed."
);
