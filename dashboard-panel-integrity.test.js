
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

function makeDisplay() {
  const report = generateHistoricalReport({
    candles: makeCandles(),
    timeframe: "15m"
  });

  assert.equal(report.status, "OK");

  const data =
    formatHistoricalDashboardData(report);

  assert.equal(data.status, "OK");

  return createHistoricalDashboardDisplay(data);
}

// 1. Display status
{
  const result = makeDisplay();

  assert.equal(result.status, "OK");
}

// 2. Historical-only restriction
{
  const result = makeDisplay();

  assert.equal(
    result.dataType,
    "HISTORICAL_ONLY"
  );

  assert.match(result.note, /No forecasts/);
  assert.match(result.note, /trading recommendations/);
}

// 3. Screen identity
{
  const result = makeDisplay();

  assert.equal(
    result.screen.screenId,
    "historical-dashboard"
  );

  assert.equal(
    result.screen.title,
    "BADAL SEVERIYA V12"
  );
}

// 4. Screen timeframe
{
  const result = makeDisplay();

  assert.equal(result.screen.timeframe, "15m");
  assert.equal(result.screen.candleCount, 300);
}

// 5. Layout structure
{
  const result = makeDisplay();

  assert.equal(
    result.layout.type,
    "VERTICAL_CARDS"
  );

  assert.equal(result.layout.cardCount, 6);
  assert.equal(result.layout.cards.length, 6);
}

// 6. Card IDs and order
{
  const result = makeDisplay();

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
}

// 7. Data Quality card
{
  const result = makeDisplay();
  const card = result.layout.cards[0];

  assert.equal(card.title, "Data Quality");
  assert.equal(typeof card.status, "string");
  assert.equal(typeof card.details.issueCount, "number");
  assert.equal(typeof card.details.checks, "object");
}

// 8. Market Indicators card
{
  const result = makeDisplay();
  const card = result.layout.cards[1];

  assert.equal(card.title, "Market Indicators");
  assert.equal(typeof card.count, "number");
  assert.equal(typeof card.indicators, "object");
}

// 9. Market Structure card
{
  const result = makeDisplay();
  const card = result.layout.cards[2];

  assert.equal(card.title, "Market Structure");
  assert.equal(typeof card.details.pivotHighCount, "number");
  assert.equal(typeof card.details.pivotLowCount, "number");
  assert.equal(typeof card.liquidity.length, "number");
}

// 10. Support and Resistance card
{
  const result = makeDisplay();
  const card = result.layout.cards[3];

  assert.equal(card.title, "Support & Resistance");

  assert.equal(
    card.supportCount,
    card.supports.length
  );

  assert.equal(
    card.resistanceCount,
    card.resistances.length
  );
}

// 11. Fibonacci card
{
  const result = makeDisplay();
  const card = result.layout.cards[4];

  assert.equal(card.title, "Fibonacci Analysis");
  assert.ok(Array.isArray(card.retracement));
  assert.ok(Array.isArray(card.extensions));
}

// 12. Candle Patterns card
{
  const result = makeDisplay();
  const card = result.layout.cards[5];

  assert.equal(card.title, "Candle Pattern Summary");

  assert.equal(
    card.totalPatterns,
    card.patterns.length
  );

  assert.ok(Array.isArray(card.patterns));
}

// 13. Validation metadata
{
  const result = makeDisplay();

  assert.equal(result.validation.status, "OK");
  assert.equal(result.validation.valid, true);
  assert.equal(result.validation.checkedPanels, 6);
  assert.deepEqual(result.validation.errors, []);
}

// 14. Invalid input handling
{
  const result =
    createHistoricalDashboardDisplay(null);

  assert.equal(result.status, "ERROR");
}

console.log(
  "All 14 dashboard panel integrity tests passed."
);
