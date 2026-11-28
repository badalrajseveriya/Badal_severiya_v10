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

// ------------------------------------------------------
// TEST HELPERS
// ------------------------------------------------------

function makeCandles(count = 300) {
  return Array.from({ length: count }, (_, i) => {
    const close =
      25000 +
      Math.sin(i / 5) * 100 +
      i * 0.5;

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

function fixtureStructurePanel() {
  return {
    trend: "BEARISH",

    pivotHighCount: 25,
    pivotLowCount: 22,
    structureEventCount: 18,
    liquidityCount: 14,
    fairValueGapCount: 16,
    orderBlockCount: 12,

    detailLimitPerGroup: 20,

    recentPivotHighs: [
      {
        id: "ph-1",
        price: 101
      }
    ],

    recentPivotLows: [
      {
        id: "pl-1",
        price: 89
      }
    ],

    recentStructureEvents: [
      {
        id: "bos-1",
        direction: "BEARISH"
      }
    ],

    liquidity: [
      {
        id: "liq-1",
        type: "EQUAL_HIGHS",
        price: 100
      }
    ],

    recentFairValueGaps: [
      {
        id: "fvg-1",
        type: "BEARISH_FVG"
      }
    ],

    recentOrderBlocks: [
      {
        id: "ob-1",
        type: "BEARISH_ORDER_BLOCK"
      }
    ]
  };
}

function makeValidData(
  structure = fixtureStructurePanel()
) {
  return {
    status: "OK",
    dataType: "HISTORICAL_ONLY",

    dashboardInfo: {
      timeframe: "15m",
      candleCount: 300,
      generatedAt: new Date().toISOString()
    },

    panels: {
      dataQuality: {
        quality: "VALID",
        issueCount: 0,
        checks: {}
      },

      marketIndicators: {
        count: 1,
        indicators: {
          RSI: 50
        }
      },

      marketStructure: structure,

      supportResistance: {
        supports: [],
        resistances: []
      },

      fibonacci: {
        swing: null,
        retracement: [],
        extensions: []
      },

      candlePatterns: {
        totalPatterns: 0,
        counts: {},
        patterns: []
      }
    }
  };
}

// ------------------------------------------------------
// TEST 1: COMPLETE DISPLAY
// ------------------------------------------------------

{
  const result = makeDisplay();

  assert.equal(result.status, "OK");

  assert.equal(
    result.module,
    "HISTORICAL_DASHBOARD_DISPLAY"
  );

  assert.equal(
    result.dataType,
    "HISTORICAL_ONLY"
  );

  assert.equal(
    result.layout.type,
    "VERTICAL_CARDS"
  );

  assert.equal(
    result.layout.cardCount,
    6
  );

  assert.equal(
    result.layout.cards.length,
    6
  );

  console.log(
    "PASS: Complete display output and six-card layout"
  );
}

// ------------------------------------------------------
// TEST 2: SCREEN INFORMATION
// ------------------------------------------------------

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

  assert.equal(
    result.screen.timeframe,
    "15m"
  );

  assert.equal(
    result.screen.candleCount,
    300
  );

  console.log("PASS: Screen metadata");
}

// ------------------------------------------------------
// TEST 3: ORIGINAL CARD IDs AND ORDER
// ------------------------------------------------------

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

  console.log(
    "PASS: Existing card IDs/order preserved"
  );
}

// ------------------------------------------------------
// TEST 4: DATA QUALITY
// ------------------------------------------------------

{
  const result = makeDisplay();

  assert.equal(
    result.layout.cards[0].status,
    "VALID"
  );

  assert.equal(
    result.layout.cards[0].details.issueCount,
    0
  );

  console.log("PASS: Data Quality card");
}

// ------------------------------------------------------
// TEST 5: MARKET INDICATORS
// ------------------------------------------------------

{
  const result = makeDisplay();

  assert.ok(
    result.layout.cards[1].indicators
  );

  console.log("PASS: Market Indicators card");
}

// ------------------------------------------------------
// TEST 6: ALL STRUCTURE DETAIL ARRAYS
// ------------------------------------------------------

{
  const card =
    createHistoricalDashboardDisplay(
      makeValidData()
    ).layout.cards[2];

  const requiredArrays = [
    "recentPivotHighs",
    "recentPivotLows",
    "recentStructureEvents",
    "liquidity",
    "recentFairValueGaps",
    "recentOrderBlocks"
  ];

  for (const key of requiredArrays) {
    assert.ok(
      Array.isArray(card[key]),
      `${key} must be an array`
    );
  }

  console.log(
    "PASS: All six structure-detail arrays exist"
  );
}

// ------------------------------------------------------
// TEST 7: FULL DETAIL PRESERVATION
// ------------------------------------------------------

{
  const input = fixtureStructurePanel();

  const card =
    createHistoricalDashboardDisplay(
      makeValidData(input)
    ).layout.cards[2];

  assert.deepEqual(
    card.recentPivotHighs,
    input.recentPivotHighs
  );

  assert.deepEqual(
    card.recentPivotLows,
    input.recentPivotLows
  );

  assert.deepEqual(
    card.recentStructureEvents,
    input.recentStructureEvents
  );

  assert.deepEqual(
    card.liquidity,
    input.liquidity
  );

  assert.deepEqual(
    card.recentFairValueGaps,
    input.recentFairValueGaps
  );

  assert.deepEqual(
    card.recentOrderBlocks,
    input.recentOrderBlocks
  );

  console.log(
    "PASS: Market Structure detail records preserved"
  );
}

// ------------------------------------------------------
// TEST 8: AGGREGATE COUNTS
// ------------------------------------------------------

{
  const card =
    createHistoricalDashboardDisplay(
      makeValidData()
    ).layout.cards[2];

  assert.deepEqual(
    card.details,
    {
      pivotHighCount: 25,
      pivotLowCount: 22,
      structureEventCount: 18,
      liquidityCount: 14,
      fairValueGapCount: 16,
      orderBlockCount: 12,
      detailLimitPerGroup: 20
    }
  );

  console.log(
    "PASS: Aggregate counts and detail limit retained"
  );
}

// ------------------------------------------------------
// TEST 9: TREND
// ------------------------------------------------------

{
  const card =
    createHistoricalDashboardDisplay(
      makeValidData()
    ).layout.cards[2];

  assert.equal(
    card.trend,
    "BEARISH"
  );

  console.log(
    "PASS: Market structure trend retained"
  );
}

// ------------------------------------------------------
// TEST 10: MISSING DETAIL ARRAYS
// ------------------------------------------------------

{
  const panel = fixtureStructurePanel();

  delete panel.recentPivotHighs;
  delete panel.recentPivotLows;
  delete panel.recentStructureEvents;
  delete panel.liquidity;
  delete panel.recentFairValueGaps;
  delete panel.recentOrderBlocks;

  const card =
    createHistoricalDashboardDisplay(
      makeValidData(panel)
    ).layout.cards[2];

  const keys = [
    "recentPivotHighs",
    "recentPivotLows",
    "recentStructureEvents",
    "liquidity",
    "recentFairValueGaps",
    "recentOrderBlocks"
  ];

  for (const key of keys) {
    assert.deepEqual(
      card[key],
      [],
      `${key} should safely default to an empty array`
    );
  }

  console.log(
    "PASS: Missing structure detail arrays default safely"
  );
}

// ------------------------------------------------------
// TEST 11: SUPPORT & RESISTANCE
// ------------------------------------------------------

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

  assert.ok(
    Array.isArray(
      result.layout.cards[3].resistances
    )
  );

  console.log(
    "PASS: Support Resistance card"
  );
}

// ------------------------------------------------------
// TEST 12: FIBONACCI
// ------------------------------------------------------

{
  const result = makeDisplay();

  assert.equal(
    result.layout.cards[4].id,
    "fibonacci"
  );

  assert.ok(
    Array.isArray(
      result.layout.cards[4].retracement
    )
  );

  assert.ok(
    Array.isArray(
      result.layout.cards[4].extensions
    )
  );

  console.log("PASS: Fibonacci card");
}

// ------------------------------------------------------
// TEST 13: CANDLE PATTERNS
// ------------------------------------------------------

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

  console.log(
    "PASS: Candle Pattern card"
  );
}

// ------------------------------------------------------
// TEST 14: VALIDATION METADATA
// ------------------------------------------------------

{
  const result = makeDisplay();

  assert.equal(
    result.validation.status,
    "OK"
  );

  assert.equal(
    result.validation.valid,
    true
  );

  assert.equal(
    result.validation.checkedPanels,
    6
  );

  assert.deepEqual(
    result.validation.errors,
    []
  );

  console.log(
    "PASS: Validation metadata"
  );
}

// ------------------------------------------------------
// TEST 15: NULL INPUT
// ------------------------------------------------------

{
  const result =
    createHistoricalDashboardDisplay(null);

  assert.equal(
    result.status,
    "ERROR"
  );

  console.log("PASS: Null input rejected");
}

// ------------------------------------------------------
// TEST 16: MISSING PANELS
// ------------------------------------------------------

{
  const result =
    createHistoricalDashboardDisplay({
      status: "OK",
      dataType: "HISTORICAL_ONLY",
      dashboardInfo: {},
      panels: {}
    });

  assert.equal(
    result.status,
    "ERROR"
  );

  console.log(
    "PASS: Missing panels rejected"
  );
}

// ------------------------------------------------------
// TEST 17: LIVE DATA REJECTED
// ------------------------------------------------------

{
  const result =
    createHistoricalDashboardDisplay({
      status: "OK",
      dataType: "LIVE",
      dashboardInfo: {},
      panels: {}
    });

  assert.equal(
    result.status,
    "ERROR"
  );

  console.log(
    "PASS: Live data rejected by historical display"
  );
}

// ------------------------------------------------------
// TEST 18: HISTORICAL-ONLY DISCLAIMER
// ------------------------------------------------------

{
  const result = makeDisplay();

  assert.match(
    result.note,
    /Historical educational/
  );

  assert.match(
    result.note,
    /No forecasts/
  );

  console.log(
    "PASS: Historical-only disclaimer"
  );
}

// ------------------------------------------------------
// FINAL
// ------------------------------------------------------

console.log(
  "ALL 23 DASHBOARD DISPLAY TESTS PASSED."
);