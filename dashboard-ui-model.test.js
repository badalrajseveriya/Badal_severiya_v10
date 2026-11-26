import assert from "node:assert/strict";

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

function makeUIModel() {
  const report =
    generateHistoricalReport({
      candles: makeCandles(),
      timeframe: "15m"
    });

  assert.equal(report.status, "OK");

  const dashboardData =
    formatHistoricalDashboardData(report);

  assert.equal(dashboardData.status, "OK");

  const display =
    createHistoricalDashboardDisplay(
      dashboardData
    );

  assert.equal(display.status, "OK");

  return createHistoricalDashboardUIModel(display);
}

function makeSevenCardDisplay() {
  const model = makeUIModel();

  assert.equal(model.status, "OK");

  const displayCards =
    model.layout.cards.map(card => card.content);

  displayCards.push({
    id: "historical-master-analysis",
    title: "Master Historical Analysis",
    timeframe: "15m",
    candleCount: 300,

    composition: {
      sampleSize: 300,
      counts: {
        bullish: 120,
        bearish: 100,
        neutral: 80
      },
      percentages: {
        bullish: 40,
        bearish: 33.333,
        neutral: 26.667
      },
      percentageTotal: 100
    },

    historicalLevels: {
      status: "OK",
      trend: "UNKNOWN",
      levels: []
    },

    smc: {
      status: "OK"
    },

    validation: {
      percentagesTotal100: true
    }
  });

  return {
    status: "OK",
    dataType: "HISTORICAL_ONLY",
    screen: {
      ...model.screen,
      screenId: "historical-dashboard",
      subtitle: "Historical Dashboard + Master"
    },
    layout: {
      type: "VERTICAL_CARDS",
      cardCount: 7,
      cards: displayCards
    }
  };
}

// 1. Complete UI model
{
  const result = makeUIModel();

  assert.equal(result.status, "OK");
  assert.equal(
    result.module,
    "HISTORICAL_DASHBOARD_UI_MODEL"
  );
  assert.equal(result.dataType, "HISTORICAL_ONLY");
}

// 2. Screen title
{
  const result = makeUIModel();

  assert.equal(
    result.screen.title,
    "BADAL SEVERIYA V12"
  );
}

// 3. Screen timeframe
{
  const result = makeUIModel();

  assert.equal(result.screen.timeframe, "15m");
}

// 4. Responsive layout
{
  const result = makeUIModel();

  assert.equal(result.layout.type, "RESPONSIVE");
}

// 5. Six standard cards
{
  const result = makeUIModel();

  assert.equal(result.layout.cardCount, 6);
  assert.equal(result.layout.cards.length, 6);
}

// 6. Mobile layout
{
  const result = makeUIModel();

  assert.equal(
    result.layout.responsive.mobile.columns,
    1
  );

  assert.equal(
    result.layout.responsive.mobile.scrollable,
    true
  );
}

// 7. Tablet layout
{
  const result = makeUIModel();

  assert.equal(
    result.layout.responsive.tablet.columns,
    2
  );
}

// 8. Desktop layout
{
  const result = makeUIModel();

  assert.equal(
    result.layout.responsive.desktop.columns,
    3
  );
}

// 9. First card
{
  const result = makeUIModel();

  assert.equal(
    result.layout.cards[0].id,
    "data-quality"
  );
}

// 10. Card order
{
  const result = makeUIModel();

  assert.equal(result.layout.cards[0].order, 1);
  assert.equal(result.layout.cards[5].order, 6);
}

// 11. Card collapse settings
{
  const result = makeUIModel();

  assert.equal(
    result.layout.cards[0].collapsible,
    true
  );

  assert.equal(
    result.layout.cards[0].defaultExpanded,
    true
  );

  assert.equal(
    result.layout.cards[3].defaultExpanded,
    false
  );
}

// 12. Navigation sections
{
  const result = makeUIModel();

  assert.equal(
    result.navigation.sections.length,
    6
  );

  assert.equal(
    result.navigation.type,
    "SINGLE_SCREEN"
  );
}

// 13. Validation metadata
{
  const result = makeUIModel();

  assert.equal(result.validation.status, "OK");
  assert.equal(result.validation.valid, true);
  assert.equal(result.validation.checkedCards, 6);
}

// 14. Invalid input
{
  const result =
    createHistoricalDashboardUIModel(null);

  assert.equal(result.status, "ERROR");
}

// 15. Missing cards
{
  const result =
    createHistoricalDashboardUIModel({
      status: "OK",
      dataType: "HISTORICAL_ONLY",
      screen: {},
      layout: {
        type: "VERTICAL_CARDS",
        cards: []
      }
    });

  assert.equal(result.status, "ERROR");
}

// 16. Invalid data type
{
  const result =
    createHistoricalDashboardUIModel({
      status: "OK",
      dataType: "LIVE",
      screen: {},
      layout: {
        type: "VERTICAL_CARDS",
        cards: []
      }
    });

  assert.equal(result.status, "ERROR");
}

// 17. Historical-only note
{
  const result = makeUIModel();

  assert.match(result.note, /Historical educational/);
  assert.match(result.note, /No forecasts/);
}

// 18. Seven-card Master Dashboard accepted
{
  const result =
    createHistoricalDashboardUIModel(
      makeSevenCardDisplay()
    );

  assert.equal(result.status, "OK");
  assert.equal(result.layout.cardCount, 7);
  assert.equal(result.layout.cards.length, 7);
  assert.equal(result.validation.checkedCards, 7);

  assert.equal(
    result.layout.cards[6].id,
    "historical-master-analysis"
  );

  assert.equal(
    result.navigation.sections[6],
    "historical-master-analysis"
  );
}

// 19. Master card percentage validation
{
  const display =
    makeSevenCardDisplay();

  display.layout.cards[6]
    .composition.percentages = {
      bullish: 50,
      bearish: 20,
      neutral: 20
    };

  const result =
    createHistoricalDashboardUIModel(display);

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /percentages are invalid/);
}

// 20. Unknown seventh card rejected
{
  const display =
    makeSevenCardDisplay();

  display.layout.cards[6].id =
    "unexpected-card";

  const result =
    createHistoricalDashboardUIModel(display);

  assert.equal(result.status, "ERROR");
}

console.log(
  "All 20 dashboard UI model tests passed."
);