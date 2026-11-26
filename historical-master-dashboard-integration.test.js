import assert from "node:assert/strict";

import {
  createHistoricalMasterDashboardIntegration
} from "./historical-master-dashboard-integration.js";

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

function makePipelineResult() {
  const candles = makeCandles();

  const report =
    generateHistoricalReport({
      candles,
      timeframe: "15m"
    });

  assert.equal(report.status, "OK");

  return {
    status: "OK",
    module: "HISTORICAL_MASTER_API_INTEGRATION",
    dataType: "HISTORICAL_ONLY",
    index: "NIFTY",
    timeframe: "15m",
    candleCount: candles.length,
    report,

    masterAnalysis: {
      status: "OK",
      module: "MASTER_HISTORICAL_ANALYSIS",
      dataType: "HISTORICAL_ONLY",
      timeframe: "15m",
      candleCount: candles.length,

      composition: {
        sampleSize: candles.length,

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
        currentPrice: candles.at(-1).close,
        levels: []
      },

      smc: {
        status: "OK",

        entry: {
          evidenceCount: 1,
          totalChecks: 4,
          historicalPatternScore: 25
        },

        exit: {
          evidenceCount: 0,
          totalChecks: 4,
          historicalPatternScore: 0
        }
      },

      validation: {
        reportValid: true,
        structureValid: true,
        candleCountsMatch: true,
        percentagesTotal100: true
      },

      note: "Historical-only score."
    }
  };
}

// 1. Successful integration
{
  const result =
    createHistoricalMasterDashboardIntegration(
      makePipelineResult()
    );

  assert.equal(result.status, "OK");

  assert.equal(
    result.module,
    "HISTORICAL_MASTER_DASHBOARD_INTEGRATION"
  );

  assert.equal(
    result.dataType,
    "HISTORICAL_ONLY"
  );

  assert.equal(
    result.dashboard.status,
    "OK"
  );

  assert.equal(
    result.dashboard.layout.cardCount,
    7
  );

  assert.equal(
    result.dashboard.layout.cards.length,
    7
  );

  assert.equal(
    result.dashboard.layout.cards[6].id,
    "historical-master-analysis"
  );

  assert.equal(
    result.validation.masterCardAdded,
    true
  );

  assert.equal(
    result.dashboard.screen.timeframe,
    "15m"
  );

  assert.equal(
    result.dashboard.screen.candleCount,
    300
  );
}

// 2. Existing six cards are preserved
{
  const result =
    createHistoricalMasterDashboardIntegration(
      makePipelineResult()
    );

  const ids =
    result.dashboard.layout.cards.map(
      card => card.id
    );

  assert.deepEqual(
    ids.slice(0, 6),
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

// 3. Historical composition passed into new card
{
  const result =
    createHistoricalMasterDashboardIntegration(
      makePipelineResult()
    );

  const card =
    result.dashboard.layout.cards[6];

  assert.equal(
    card.composition.percentages.bullish,
    40
  );

  assert.equal(
    card.composition.percentages.bearish,
    33.333
  );

  assert.equal(
    card.composition.percentages.neutral,
    26.667
  );

  assert.equal(
    card.composition.percentageTotal,
    100
  );
}

// 4. Historical levels and SMC carried through
{
  const result =
    createHistoricalMasterDashboardIntegration(
      makePipelineResult()
    );

  const card =
    result.dashboard.layout.cards[6];

  assert.equal(
    card.historicalLevels.status,
    "OK"
  );

  assert.equal(
    card.smc.status,
    "OK"
  );
}

// 5. Pipeline error blocks dashboard output
{
  const result =
    createHistoricalMasterDashboardIntegration({
      status: "ERROR",
      dataType: "HISTORICAL_ONLY",
      error: "Gap validation failed."
    });

  assert.equal(result.status, "ERROR");
  assert.equal(result.dashboard, null);

  assert.match(
    result.error,
    /status is not OK/
  );
}

// 6. Wrong timeframe is rejected
{
  const input = makePipelineResult();

  input.timeframe = "1d";
  input.masterAnalysis.timeframe = "1d";
  input.report.reportInfo.timeframe = "1d";

  const result =
    createHistoricalMasterDashboardIntegration(
      input
    );

  assert.equal(result.status, "ERROR");

  assert.match(
    result.error,
    /supports 15m/
  );
}

// 7. Invalid percentage total is blocked
{
  const input = makePipelineResult();

  input.masterAnalysis.composition.percentages = {
    bullish: 40,
    bearish: 30,
    neutral: 20
  };

  input.masterAnalysis.validation
    .percentagesTotal100 = false;

  const result =
    createHistoricalMasterDashboardIntegration(
      input
    );

  assert.equal(result.status, "ERROR");

  assert.match(
    result.error,
    /percentage validation failed|percentages are invalid/
  );
}

// 8. Candle-count mismatch blocked
{
  const input = makePipelineResult();

  input.candleCount += 1;

  const result =
    createHistoricalMasterDashboardIntegration(
      input
    );

  assert.equal(result.status, "ERROR");

  assert.match(
    result.error,
    /candle count mismatch/
  );
}

console.log(
  "All 8 historical master dashboard integration tests passed."
);