
import assert from "node:assert/strict";

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

function makeDisplay() {
  const report = generateHistoricalReport({
    candles: makeCandles(),
    timeframe: "15m"
  });

  assert.equal(report.status, "OK");

  const dashboardData =
    formatHistoricalDashboardData(report);

  assert.equal(dashboardData.status, "OK");

  return createHistoricalDashboardDisplay(
    dashboardData
  );
}

// 1. Complete display output
{
  const result = makeDisplay();

  assert.equal(result.status, "OK");
  assert.equal(
    result.module,
    "HISTORICAL_DASHBOARD_DISPLAY"
  );
  assert.equal(result.dataType, "HISTORICAL_ONLY");
}

// 2. Screen information
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

// 3. Timeframe
{
  const result = makeDisplay();

  assert.equal(result.screen.timeframe, "15m");
}

// 4. Candle count
{
  const result = makeDisplay();

  assert.equal(result.screen.candleCount, 300);
}

// 5. Vertical card layout
{
  const result = makeDisplay();

  assert.equal(
    result.layout.type,
    "VERTICAL_CARDS"
  );
}

// 6. Six display cards
{
  const result = makeDisplay();

  assert.equal(result.layout.cardCount, 6);
  assert.equal(result.layout.cards.length, 6);
}

// 7. Data quality card
{
  const result = makeDisplay();

  assert.equal(
    result.layout.cards[0].id,
    "data-quality"
  );
}

// 8. Market indicators card
{
  const result = makeDisplay();

  assert.equal(
    result.layout.cards[1].id,
    "market-indicators"
  );
}

// 9. Market structure card
{
  const result = makeDisplay();

  assert.equal(
    result.layout.cards[2].id,
    "market-structure"
  );
}

// 10. Support resistance card
{
  const result = makeDisplay();

  assert.equal(
    result.layout.cards[3].id,
    "support-resistance"
  );

  assert.ok(
    Array.isArray(
      result.layout.cards[3].supports
    )
  );
}

// 11. Fibonacci card
{
  const result = makeDisplay();

  assert.equal(
    result.layout.cards[4].id,
    "fibonacci"
  );
}

// 12. Candle patterns card
{
  const result = makeDisplay();

  assert.equal(
    result.layout.cards[5].id,
    "candle-patterns"
  );

  assert.ok(
    Array.isArray(
      result.layout.cards[5].patterns
    )
  );
}

// 13. Validation metadata
{
  const result = makeDisplay();

  assert.equal(result.validation.status, "OK");
  assert.equal(result.validation.valid, true);
  assert.equal(result.validation.checkedPanels, 6);
}

// 14. Invalid input
{
  const result =
    createHistoricalDashboardDisplay(null);

  assert.equal(result.status, "ERROR");
}

// 15. Missing panels
{
  const result =
    createHistoricalDashboardDisplay({
      status: "OK",
      dataType: "HISTORICAL_ONLY",
      dashboardInfo: {},
      panels: {}
    });

  assert.equal(result.status, "ERROR");
}

// 16. Invalid data type
{
  const result =
    createHistoricalDashboardDisplay({
      status: "OK",
      dataType: "LIVE",
      dashboardInfo: {},
      panels: {}
    });

  assert.equal(result.status, "ERROR");
}

// 17. Historical-only note
{
  const result = makeDisplay();

  assert.match(result.note, /Historical educational/);
  assert.match(result.note, /No forecasts/);
}

console.log("All 17 dashboard display tests passed.");
