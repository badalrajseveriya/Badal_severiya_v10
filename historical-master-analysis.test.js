
import assert from "node:assert/strict";

import {
  calculateHistoricalMasterAnalysis
} from "./historical-master-analysis.js";

function makeCandles(count = 40) {
  const candles = [];

  for (let i = 0; i < count; i++) {
    const open = 100 + (i % 5);
    const close = open + (i % 3 === 0 ? -2 : 2);

    candles.push({
      timestamp: new Date(
        Date.UTC(2026, 0, 1) + i * 86400000
      ).toISOString(),
      open,
      high: Math.max(open, close) + 3,
      low: Math.min(open, close) - 3,
      close,
      volume: 1000 + i
    });
  }

  return candles;
}

function makeReport(candles, timeframe = "1d", trend = "BULLISH") {
  return {
    status: "OK",
    dataType: "HISTORICAL_ONLY",
    reportInfo: {
      timeframe,
      candleCount: candles.length
    },
    sections: {
      marketStructure: {
        trend
      },
      supportResistance: {
        supports: [
          { price: 110, lower: 108, upper: 112 },
          { price: 90, lower: 88, upper: 92 }
        ],
        resistances: [
          { price: 150, lower: 148, upper: 152 },
          { price: 130, lower: 128, upper: 132 }
        ]
      }
    }
  };
}

function makeStructure(candles) {
  return {
    status: "OK",
    dataType: "HISTORICAL_ONLY",
    summary: {
      candleCount: candles.length
    },
    orderBlocks: [
      {
        type: "BULLISH_ORDER_BLOCK",
        lower: 90,
        upper: 110
      },
      {
        type: "BEARISH_ORDER_BLOCK",
        lower: 120,
        upper: 140
      }
    ],
    fairValueGaps: [
      {
        type: "BULLISH_FVG",
        lower: 90,
        upper: 110,
        status: "UNMITIGATED_IN_AVAILABLE_HISTORY"
      },
      {
        type: "BEARISH_FVG",
        lower: 120,
        upper: 140,
        status: "UNMITIGATED_IN_AVAILABLE_HISTORY"
      }
    ],
    structureEvents: [
      {
        direction: "BULLISH",
        index: candles.length - 2
      },
      {
        direction: "BEARISH",
        index: candles.length - 1
      }
    ],
    liquidity: [
      {
        type: "EQUAL_LOWS",
        price: candles[candles.length - 1].low
      },
      {
        type: "EQUAL_HIGHS",
        price: candles[candles.length - 1].high
      }
    ]
  };
}

// 1. Valid 1D master analysis
{
  const candles = makeCandles();

  const result = calculateHistoricalMasterAnalysis({
    candles,
    timeframe: "1d",
    report: makeReport(candles, "1d"),
    structure: makeStructure(candles)
  });

  assert.equal(result.status, "OK");
  assert.equal(result.timeframe, "1d");
  assert.equal(result.dataType, "HISTORICAL_ONLY");
  assert.equal(result.candleCount, 40);

  console.log("PASS: Valid 1D master analysis");
}

// 2. Historical percentages total 100
{
  const candles = makeCandles();

  const result = calculateHistoricalMasterAnalysis({
    candles,
    timeframe: "1d",
    report: makeReport(candles, "1d"),
    structure: makeStructure(candles)
  });

  const percentages = result.composition.percentages;

  const total =
    percentages.bullish +
    percentages.bearish +
    percentages.neutral;

  assert.ok(Math.abs(total - 100) <= 0.2);
  assert.equal(result.validation.percentagesTotal100, true);

  console.log("PASS: Historical percentages total 100");
}

// 3. Bullish historical level labels and colors
{
  const candles = makeCandles();

  const result = calculateHistoricalMasterAnalysis({
    candles,
    timeframe: "1d",
    report: makeReport(candles, "1d", "BULLISH"),
    structure: makeStructure(candles)
  });

  const levels = result.historicalLevels.levels;

  assert.deepEqual(
    levels.map(level => level.name),
    ["TARGET", "ENTRY", "STOP_LOSS"]
  );

  assert.equal(levels[0].color, "GREEN");
  assert.equal(levels[1].color, "YELLOW");
  assert.equal(levels[2].color, "RED");

  console.log("PASS: Bullish historical level labels and colors");
}

// 4. Bearish historical level labels and colors
{
  const candles = makeCandles();

  const result = calculateHistoricalMasterAnalysis({
    candles,
    timeframe: "1d",
    report: makeReport(candles, "1d", "BEARISH"),
    structure: makeStructure(candles)
  });

  const levels = result.historicalLevels.levels;

  assert.deepEqual(
    levels.map(level => level.name),
    ["STOP_LOSS", "ENTRY", "TARGET"]
  );

  assert.equal(levels[0].color, "RED");
  assert.equal(levels[1].color, "YELLOW");
  assert.equal(levels[2].color, "GREEN");

  console.log("PASS: Bearish historical level labels and colors");
}

// 5. Historical SMC score bounds
{
  const candles = makeCandles();

  const result = calculateHistoricalMasterAnalysis({
    candles,
    timeframe: "1d",
    report: makeReport(candles, "1d"),
    structure: makeStructure(candles)
  });

  assert.equal(result.smc.status, "OK");
  assert.equal(result.smc.entry.totalChecks, 4);
  assert.equal(result.smc.exit.totalChecks, 4);

  assert.ok(
    result.smc.entry.historicalPatternScore >= 0 &&
    result.smc.entry.historicalPatternScore <= 100
  );

  assert.ok(
    result.smc.exit.historicalPatternScore >= 0 &&
    result.smc.exit.historicalPatternScore <= 100
  );

  console.log("PASS: Historical SMC score bounds");
}

// 6. 15M waiting state
{
  const result = calculateHistoricalMasterAnalysis({
    candles: [],
    timeframe: "15m"
  });

  assert.equal(result.status, "WAITING_FOR_DATA");
  assert.equal(result.timeframe, "15m");
  assert.equal(result.candleCount, 0);
  assert.equal(result.smc, null);

  console.log("PASS: 15M waiting state");
}

// 7. Report timeframe mismatch
{
  const candles = makeCandles();

  const result = calculateHistoricalMasterAnalysis({
    candles,
    timeframe: "15m",
    report: makeReport(candles, "1d"),
    structure: makeStructure(candles)
  });

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /matching historical report/);

  console.log("PASS: Report timeframe mismatch");
}

// 8. Candle count mismatch
{
  const candles = makeCandles();
  const report = makeReport(candles, "1d");
  report.reportInfo.candleCount = 39;

  const result = calculateHistoricalMasterAnalysis({
    candles,
    timeframe: "1d",
    report,
    structure: makeStructure(candles)
  });

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /candle counts do not match/);

  console.log("PASS: Candle count mismatch");
}

// 9. Invalid market structure
{
  const candles = makeCandles();

  const result = calculateHistoricalMasterAnalysis({
    candles,
    timeframe: "1d",
    report: makeReport(candles, "1d"),
    structure: {
      status: "ERROR",
      dataType: "HISTORICAL_ONLY"
    }
  });

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /market structure is required/);

  console.log("PASS: Invalid market structure");
}

// 10. Unsupported timeframe
{
  const result = calculateHistoricalMasterAnalysis({
    candles: makeCandles(),
    timeframe: "1h"
  });

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /Timeframe must be 1d or 15m/);

  console.log("PASS: Unsupported timeframe rejected");
}

// 11. Historical-only safety
{
  const candles = makeCandles();

  const result = calculateHistoricalMasterAnalysis({
    candles,
    timeframe: "1d",
    report: makeReport(candles, "1d"),
    structure: makeStructure(candles)
  });

  assert.equal(result.dataType, "HISTORICAL_ONLY");
  assert.match(result.note, /No forecasts/i);
  assert.match(result.note, /trading recommendations/i);

  console.log("PASS: Historical-only safety");
}

console.log("ALL 11 MASTER ANALYSIS TESTS PASSED");
