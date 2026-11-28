
/* ======================================================
   BADAL SEVERIYA V12
   LIVE MASTER LEVELS REGRESSION TESTS
   ====================================================== */

import assert from "node:assert/strict";

import {
  calculateLiveMasterLevels,
  LIVE_MASTER_LEVELS_CONFIG
} from "./live-master-levels.js";

const NOW = Date.UTC(2026, 11, 28, 10, 0, 0);

function makeCandles(count = 40) {
  const candles = [];

  for (let i = 0; i < count; i++) {
    const close = 25000 + i * 2;
    const open = close - 0.5;

    candles.push({
      timestamp: NOW - (count - 1 - i) * 15 * 60 * 1000,
      open,
      high: close + 2,
      low: open - 2,
      close,
      volume: 1000
    });
  }

  return candles;
}

function makeAnalysis(direction = "BULLISH", timeframe = "15M") {
  const candles = makeCandles();

  return {
    status: "VALID",
    timeframe,
    direction,
    feed: {
      fresh: true
    },
    market: {
      close: candles[candles.length - 1].close
    },
    validation: {
      timeframeValid: true,
      feedFresh: true,
      exactlyEightRules: true
    }
  };
}

function run(input = {}) {
  const candles = makeCandles();

  return calculateLiveMasterLevels({
    timeframe: "15M",
    candles,
    analysis: makeAnalysis("BULLISH"),
    ...input
  });
}

// 1. Config contract
{
  assert.deepEqual(
    LIVE_MASTER_LEVELS_CONFIG.supportedTimeframes,
    ["1D", "15M"]
  );

  assert.equal(
    LIVE_MASTER_LEVELS_CONFIG.orderExecution,
    false
  );

  assert.equal(
    LIVE_MASTER_LEVELS_CONFIG.forecasts,
    false
  );

  console.log("PASS 1: Levels config");
}

// 2. Bullish price ordering
{
  const result = run();

  assert.equal(result.status, "VALID");
  assert.equal(result.levelsAvailable, true);
  assert.equal(result.direction, "BULLISH");

  assert.ok(
    result.levels.stopLoss <
    result.levels.entry
  );

  assert.ok(
    result.levels.entry <
    result.levels.target1
  );

  assert.ok(
    result.levels.target1 <
    result.levels.target2
  );

  assert.equal(
    result.validation.levelsOrdered,
    true
  );

  console.log("PASS 2: Bullish ordering");
}

// 3. Bearish price ordering
{
  const result = run({
    analysis: makeAnalysis("BEARISH")
  });

  assert.equal(result.status, "VALID");
  assert.equal(result.direction, "BEARISH");

  assert.ok(
    result.levels.target2 <
    result.levels.target1
  );

  assert.ok(
    result.levels.target1 <
    result.levels.entry
  );

  assert.ok(
    result.levels.entry <
    result.levels.stopLoss
  );

  console.log("PASS 3: Bearish ordering");
}

// 4. Entry is latest candle close
{
  const candles = makeCandles();
  const latest = candles[candles.length - 1];

  const result = run({
    candles,
    analysis: {
      ...makeAnalysis(),
      market: {
        close: latest.close
      }
    }
  });

  assert.equal(result.levels.entry, latest.close);

  console.log("PASS 4: Entry source verified");
}

// 5. ATR calculation available
{
  const result = run();

  assert.ok(Number.isFinite(result.atr));
  assert.ok(result.atr > 0);
  assert.equal(result.atrPeriod, 14);

  console.log("PASS 5: ATR valid");
}

// 6. Risk positive
{
  const result = run();

  assert.ok(result.risk > 0);
  assert.equal(
    result.risk,
    Math.abs(
      result.levels.entry -
      result.levels.stopLoss
    )
  );

  console.log("PASS 6: Risk calculation");
}

// 7. Reward/risk calculation
{
  const result = run();

  assert.ok(result.rewardRisk.target1 > 0);
  assert.ok(result.rewardRisk.target2 > 0);

  assert.ok(
    result.rewardRisk.target2 >
    result.rewardRisk.target1
  );

  console.log("PASS 7: Reward/risk calculation");
}

// 8. Stale analysis blocked
{
  const analysis = makeAnalysis();

  analysis.feed.fresh = false;

  const result = run({ analysis });

  assert.equal(result.status, "WAIT");
  assert.equal(result.direction, "WAIT");
  assert.equal(result.levelsAvailable, false);
  assert.equal(result.levels, null);

  console.log("PASS 8: Stale feed blocked");
}

// 9. Conflicting analysis blocked
{
  const analysis = makeAnalysis();

  analysis.status = "CONFLICT";
  analysis.direction = "CONFLICT";

  const result = run({ analysis });

  assert.equal(result.status, "WAIT");
  assert.equal(result.levelsAvailable, false);

  console.log("PASS 9: Conflict blocked");
}

// 10. Unsupported timeframe blocked
{
  const result = run({
    timeframe: "1H",
    analysis: makeAnalysis("BULLISH", "1H")
  });

  assert.equal(result.status, "ERROR");
  assert.equal(result.levelsAvailable, false);

  console.log("PASS 10: Unsupported timeframe blocked");
}

// 11. Analysis/candle close mismatch blocked
{
  const analysis = makeAnalysis();

  analysis.market.close += 100;

  const result = run({ analysis });

  assert.equal(result.status, "WAIT");
  assert.equal(result.levelsAvailable, false);
  assert.match(result.reason, /does not match/);

  console.log("PASS 11: Close mismatch blocked");
}

// 12. Insufficient candles
{
  const result = run({
    candles: makeCandles(10)
  });

  assert.equal(result.status, "DATA_INSUFFICIENT");
  assert.equal(result.levelsAvailable, false);

  console.log("PASS 12: Insufficient candles");
}

// 13. Invalid candle rejected
{
  const candles = makeCandles();

  candles[5].high = candles[5].low - 1;

  const result = run({ candles });

  assert.equal(result.status, "ERROR");
  assert.equal(result.levelsAvailable, false);

  console.log("PASS 13: Invalid OHLC blocked");
}

// 14. Custom ATR multipliers
{
  const result = run({
    config: {
      stopAtrMultiplier: 1.5,
      target1AtrMultiplier: 1.5,
      target2AtrMultiplier: 3
    }
  });

  assert.equal(result.status, "VALID");
  assert.equal(result.calculation.stopAtrMultiplier, 1.5);
  assert.equal(result.calculation.target1AtrMultiplier, 1.5);
  assert.equal(result.calculation.target2AtrMultiplier, 3);

  console.log("PASS 14: Custom multipliers");
}

// 15. Invalid configuration blocked
{
  const result = run({
    config: {
      stopAtrMultiplier: -1
    }
  });

  assert.equal(result.status, "ERROR");
  assert.equal(result.levelsAvailable, false);

  console.log("PASS 15: Invalid config blocked");
}

// 16. Target ordering configuration blocked
{
  const result = run({
    config: {
      target1AtrMultiplier: 2,
      target2AtrMultiplier: 1
    }
  });

  assert.equal(result.status, "ERROR");
  assert.equal(result.levelsAvailable, false);

  console.log("PASS 16: Target multiplier ordering blocked");
}

// 17. Missing analysis blocks levels
{
  const result = run({
    analysis: null
  });

  assert.equal(result.status, "WAIT");
  assert.equal(result.levels, null);

  console.log("PASS 17: Missing analysis blocked");
}

// 18. No order execution
{
  const result = run();

  assert.equal(
    result.validation.orderExecution,
    false
  );

  assert.match(
    result.note,
    /Not a forecast/
  );

  console.log("PASS 18: Display-only safety");
}

console.log("ALL 18 LIVE MASTER LEVELS TEST GROUPS PASSED.");
