// ======================================================
// BADAL SEVERIYA V12
// LIVE MASTER ANALYSIS REGRESSION TESTS
// ======================================================

import assert from "node:assert/strict";

import {
  analyzeLiveMaster,
  LIVE_MASTER_ANALYSIS_CONFIG
} from "./live-master-analysis.js";

const NOW = Date.UTC(2026, 11, 28, 10, 0, 0);

function makeCandles(direction = "BULLISH", count = 100) {
  const candles = [];

  for (let i = 0; i < count; i++) {
    const trend = direction === "BULLISH"
      ? i * 2
      : direction === "BEARISH"
        ? -i * 2
        : 0;

    const close = 25000 + trend;

    let open = direction === "BEARISH"
      ? close + 0.5
      : close - 0.5;

    let high = Math.max(open, close) + 0.2;
    let low = Math.min(open, close) - 0.2;

    if (i === count - 1 && direction === "BULLISH") {
      open = close - 0.5;
      high = close + 0.2;
      low = close - 3;
    }

    if (i === count - 1 && direction === "BEARISH") {
      open = close + 0.5;
      high = close + 3;
      low = close - 0.2;
    }

    candles.push({
      timestamp: NOW - (count - 1 - i) * 60 * 1000,
      open,
      high,
      low,
      close,
      volume: i === count - 1 ? 3000 : 1000
    });
  }

  return candles;
}

function run(input = {}) {
  return analyzeLiveMaster({
    timeframe: "15M",
    candles: makeCandles(),
    now: NOW,
    ...input
  });
}

// 1. Config contract
{
  assert.deepEqual(
    LIVE_MASTER_ANALYSIS_CONFIG.supportedTimeframes,
    ["1D", "15M"]
  );

  assert.equal(
    LIVE_MASTER_ANALYSIS_CONFIG.minimumCandles,
    50
  );

  assert.equal(
    LIVE_MASTER_ANALYSIS_CONFIG.orderExecution,
    false
  );

  console.log("PASS 1: Live Analyzer config");
}

// 2. Eight-rule contract
{
  const result = run();

  assert.equal(result.rules.length, 8);

  assert.deepEqual(
    result.rules.map(r => r.id),
    LIVE_MASTER_ANALYSIS_CONFIG.rules
  );

  assert.equal(
    result.validation.exactlyEightRules,
    true
  );

  console.log("PASS 2: Exactly eight rules");
}

// 3. Bullish evidence direction
{
  const result = run({
    candles: makeCandles("BULLISH")
  });

  assert.equal(result.feed.fresh, true);
  assert.ok(result.summary.bullishRuleCount >= 3);
  assert.equal(result.direction, "BULLISH");

  console.log("PASS 3: Bullish context");
}

// 4. Bearish evidence direction
{
  const result = run({
    candles: makeCandles("BEARISH")
  });

  assert.ok(result.summary.bearishRuleCount >= 3);
  assert.equal(result.direction, "BEARISH");

  console.log("PASS 4: Bearish context");
}

// 5. 1D timeframe accepted
{
  const result = run({
    timeframe: "1D",
    candles: makeCandles("BULLISH"),
    maxAgeMs: 24 * 60 * 60 * 1000
  });

  assert.equal(result.timeframe, "1D");
  assert.equal(result.validation.timeframeValid, true);

  console.log("PASS 5: 1D timeframe");
}

// 6. Unsupported 1H timeframe blocked
{
  const result = run({
    timeframe: "1H"
  });

  assert.equal(result.status, "ERROR");
  assert.equal(result.direction, "WAIT");
  assert.match(result.error, /Only 1D and 15M/);

  console.log("PASS 6: Unsupported timeframe blocked");
}

// 7. Insufficient candles
{
  const result = run({
    candles: makeCandles("BULLISH", 30)
  });

  assert.equal(result.status, "DATA_INSUFFICIENT");
  assert.equal(result.direction, "WAIT");

  console.log("PASS 7: Insufficient data");
}

// 8. Stale feed
{
  const candles = makeCandles("BULLISH");
  candles[candles.length - 1].timestamp =
    NOW - 60 * 60 * 1000;

  const result = run({
    candles,
    maxAgeMs: 10 * 60 * 1000
  });

  assert.equal(result.status, "WAIT");
  assert.equal(result.direction, "WAIT");
  assert.equal(result.feed.fresh, false);
  assert.match(result.feed.reason, /stale/);

  console.log("PASS 8: Stale feed blocked");
}

// 9. Missing timestamp blocks live context
{
  const candles = makeCandles("BULLISH");
  candles.forEach(c => delete c.timestamp);

  const result = run({ candles });

  assert.equal(result.status, "WAIT");
  assert.equal(result.direction, "WAIT");
  assert.equal(result.feed.fresh, false);

  console.log("PASS 9: Missing timestamps blocked");
}

// 10. Future candle blocked
{
  const candles = makeCandles("BULLISH");
  candles[candles.length - 1].timestamp = NOW + 60000;

  const result = run({ candles });

  assert.equal(result.status, "WAIT");
  assert.equal(result.direction, "WAIT");
  assert.match(result.feed.reason, /future/);

  console.log("PASS 10: Future timestamp blocked");
}

// 11. OI/PCR unavailable by default, not fabricated
{
  const result = run();

  const oi = result.rules.find(r => r.id === "OI_PCR");

  assert.equal(oi.status, "UNAVAILABLE");
  assert.equal(oi.direction, "NEUTRAL");
  assert.match(oi.reason, /not supplied/);

  console.log("PASS 11: Missing OI/PCR remains unavailable");
}

// 12. External validated evidence accepted
{
  const result = run({
    externalEvidence: {
      oiPcr: {
        status: "VALID",
        direction: "BULLISH",
        reason: "Test-only validated context"
      },
      eventTime: {
        status: "VALID",
        direction: "NEUTRAL",
        reason: "No directional event evidence"
      }
    }
  });

  const oi = result.rules.find(r => r.id === "OI_PCR");
  const event = result.rules.find(r => r.id === "EVENT_TIME_WINDOW");

  assert.equal(oi.status, "VALID");
  assert.equal(oi.direction, "BULLISH");

  assert.equal(event.status, "VALID");
  assert.equal(event.direction, "NEUTRAL");

  console.log("PASS 12: External evidence validation");
}

// 13. Evidence percentages sum to 100
{
  const result = run();

  const p = result.summary.evidencePercentages;

  assert.ok(
    Math.abs(p.bullish + p.bearish + p.neutral - 100) < 0.01
  );

  assert.equal(
    result.summary.percentagesAreForecasts,
    false
  );

  assert.equal(
    result.validation.percentagesAreForecasts,
    false
  );

  console.log("PASS 13: Evidence percentage integrity");
}

// 14. Invalid OHLC rejected
{
  const candles = makeCandles();
  candles[10].high = candles[10].low - 1;

  const result = run({ candles });

  assert.equal(result.status, "ERROR");
  assert.equal(result.direction, "WAIT");

  console.log("PASS 14: Invalid OHLC blocked");
}

// 15. Out-of-order candles rejected
{
  const candles = makeCandles();
  const temp = candles[10];
  candles[10] = candles[11];
  candles[11] = temp;

  const result = run({ candles });

  assert.equal(result.status, "ERROR");
  assert.match(result.error, /chronological/);

  console.log("PASS 15: Chronological validation");
}

// 16. Forecast/advice disclaimer
{
  const result = run();

  assert.match(result.note, /Not a forecast/);
  assert.match(result.note, /not.*financial advice/i);

  console.log("PASS 16: Educational disclaimer");
}

console.log("ALL 16 LIVE MASTER ANALYSIS TEST GROUPS PASSED.");