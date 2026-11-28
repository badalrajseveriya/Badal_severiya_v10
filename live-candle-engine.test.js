
// BADAL SEVERIYA V12
// LIVE CANDLE ENGINE TESTS

import assert from "node:assert/strict";

import {
  createLiveCandleEngine,
  LIVE_CANDLE_ENGINE_CONFIG
} from "./live-candle-engine.js";

const MIN = 60000;

// 09:15 IST, 27 Nov 2026
const dateBase = Date.UTC(2026, 10, 27, 3, 45);

function atMinute(offset) {
  return dateBase + offset * MIN;
}

function minute(offset, price = 100) {
  return {
    timestamp: atMinute(offset),
    open: price,
    high: price + 1,
    low: price - 1,
    close: price + 0.5,
    volume: 10
  };
}

// 1. Config contract
assert.deepEqual(
  LIVE_CANDLE_ENGINE_CONFIG.supportedTimeframes,
  ["1D", "15M"]
);

assert.equal(
  LIVE_CANDLE_ENGINE_CONFIG.syntheticCandles,
  false
);

console.log(
  "PASS 1: timeframe policy and no synthetic bars"
);

// 2. Invalid OHLC rejected
{
  const e = createLiveCandleEngine();

  const r = e.ingestMinute({
    timestamp: atMinute(0),
    open: 100,
    high: 98,
    low: 99,
    close: 100,
    volume: 1
  });

  assert.equal(r.accepted, false);
  assert.equal(r.status, "INVALID");
}

console.log("PASS 2: invalid OHLC rejected");

// 3. Session start valid
{
  const e = createLiveCandleEngine();

  assert.equal(
    e.ingestMinute(minute(0)).accepted,
    true
  );

  assert.equal(
    e.snapshot().minuteCandles.length,
    1
  );
}

console.log("PASS 3: session-start minute accepted");

// 4. Pre-session data blocked
{
  const e = createLiveCandleEngine();

  const r = e.ingestMinute({
    ...minute(0),
    timestamp: atMinute(0) - MIN
  });

  assert.equal(r.accepted, false);
  assert.equal(r.reason, "OUTSIDE_SESSION");
}

console.log("PASS 4: pre-market rejected");

// 5. Weekend rejected
{
  const e = createLiveCandleEngine();

  const saturday = Date.UTC(
    2026,
    10,
    28,
    3,
    45
  );

  const r = e.ingestMinute({
    ...minute(0),
    timestamp: saturday
  });

  assert.equal(r.accepted, false);
  assert.equal(r.reason, "WEEKEND");
}

console.log("PASS 5: weekend rejected");

// 6. Complete 15M aggregation
{
  const e = createLiveCandleEngine();

  for (let i = 0; i < 15; i++) {
    e.ingestMinute(minute(i, 100 + i));
  }

  const s = e.snapshot();

  assert.equal(s.candles15m.length, 1);
  assert.equal(
    s.candles15m[0].sourceBarCount,
    15
  );

  assert.equal(s.candles15m[0].open, 100);
  assert.equal(s.candles15m[0].close, 114.5);
  assert.equal(s.candles15m[0].volume, 150);
  assert.equal(s.candles15m[0].partial, false);
}

console.log("PASS 6: complete 15M aggregate");

// 7. Partial 15M bucket
{
  const e = createLiveCandleEngine();

  for (let i = 0; i < 4; i++) {
    e.ingestMinute(minute(i));
  }

  const b = e.snapshot().candles15m[0];

  assert.equal(b.sourceBarCount, 4);
  assert.equal(b.partial, true);
}

console.log("PASS 7: partial 15M marked partial");

// 8. 15M anchored at 09:15
{
  const e = createLiveCandleEngine();

  for (let i = 0; i < 16; i++) {
    e.ingestMinute(minute(i));
  }

  const bars = e.snapshot().candles15m;

  assert.equal(bars.length, 2);
  assert.equal(bars[0].timestamp, atMinute(0));
  assert.equal(bars[1].timestamp, atMinute(15));
}

console.log("PASS 8: 15M bars anchored at 09:15");

// 9. Daily aggregation
{
  const e = createLiveCandleEngine();

  e.ingestMinute(minute(0, 100));
  e.ingestMinute(minute(1, 105));

  const d = e.snapshot().dailyCandle;

  assert.equal(d.timeframe, "1D");
  assert.equal(d.open, 100);
  assert.equal(d.close, 105.5);
  assert.equal(d.high, 106);
  assert.equal(d.low, 99);
  assert.equal(d.volume, 20);
}

console.log("PASS 9: intraday daily candle aggregation");

// 10. Missing minute identified without filling
{
  const e = createLiveCandleEngine();

  e.ingestMinute(minute(0));
  e.ingestMinute(minute(2));

  const s = e.snapshot();

  assert.equal(s.gaps.missingMinuteCount, 1);
  assert.equal(s.minuteCandles.length, 2);
  assert.equal(s.syntheticCandlesCreated, 0);
}

console.log("PASS 10: gap detection without fabrication");

// 11. Missing 15M bucket
{
  const e = createLiveCandleEngine();

  for (let i = 0; i < 15; i++) {
    e.ingestMinute(minute(i));
  }

  for (let i = 30; i < 45; i++) {
    e.ingestMinute(minute(i));
  }

  const s = e.snapshot();

  assert.ok(s.gaps.missing15mCount >= 1);
  assert.equal(s.candles15m.length, 2);
}

console.log("PASS 11: missing 15M bucket detected");

// 12. Duplicate minute update
{
  const e = createLiveCandleEngine();

  e.ingestMinute(minute(0, 100));

  const update = {
    timestamp: atMinute(0),
    open: 101,
    high: 103,
    low: 98,
    close: 102,
    volume: 5
  };

  const r = e.ingestMinute(update);
  const c = e.snapshot().minuteCandles[0];

  assert.equal(r.accepted, true);
  assert.equal(c.open, 100);
  assert.equal(c.high, 103);
  assert.equal(c.low, 98);
  assert.equal(c.close, 102);
  assert.equal(c.volume, 5);
}

console.log(
  "PASS 12: duplicate minute merged without duplication"
);

// 13. Out-of-order minute rejected
{
  const e = createLiveCandleEngine();

  e.ingestMinute(minute(2));

  const r = e.ingestMinute(minute(1));

  assert.equal(r.accepted, false);
  assert.equal(r.reason, "OUT_OF_ORDER_MINUTE");
}

console.log("PASS 13: out-of-order minute blocked");

// 14. Earlier session blocked
{
  const e = createLiveCandleEngine();

  e.ingestMinute(minute(0));

  const prior = Date.UTC(
    2026,
    10,
    26,
    3,
    45
  );

  const r = e.ingestMinute({
    ...minute(0),
    timestamp: prior
  });

  assert.equal(r.accepted, false);
  assert.equal(r.reason, "OLDER_SESSION_DATE");
}

console.log("PASS 14: earlier session blocked");

// 15. New session resets engine
{
  const e = createLiveCandleEngine();

  e.ingestMinute(minute(0));

  const next = Date.UTC(
    2026,
    10,
    30,
    3,
    45
  );

  const r = e.ingestMinute({
    ...minute(0),
    timestamp: next
  });

  assert.equal(r.accepted, true);
  assert.equal(
    e.snapshot().minuteCandles.length,
    1
  );

  assert.equal(
    e.snapshot().sessionDate,
    "2026-11-30"
  );
}

console.log("PASS 15: new session resets engine");

// 16. Tick aggregation
{
  const e = createLiveCandleEngine();

  e.ingestTick({
    timestamp: atMinute(0) + 1000,
    price: 100,
    volumeDelta: 2
  });

  e.ingestTick({
    timestamp: atMinute(0) + 2000,
    price: 103,
    volumeDelta: 3
  });

  const c = e.snapshot().minuteCandles[0];

  assert.equal(c.open, 100);
  assert.equal(c.high, 103);
  assert.equal(c.low, 100);
  assert.equal(c.close, 103);
  assert.equal(c.volume, 5);
}

console.log("PASS 16: ticks aggregate into minute candle");

// 17. Invalid tick
{
  const e = createLiveCandleEngine();

  const r = e.ingestTick({
    timestamp: atMinute(0),
    price: -2,
    volumeDelta: 1
  });

  assert.equal(r.accepted, false);
  assert.equal(r.status, "INVALID");
}

console.log("PASS 17: invalid tick blocked");

// 18. Outside-session tick
{
  const e = createLiveCandleEngine();

  const r = e.ingestTick({
    timestamp: atMinute(0) - MIN,
    price: 100,
    volumeDelta: 1
  });

  assert.equal(r.accepted, false);
  assert.equal(r.reason, "OUTSIDE_SESSION");
}

console.log("PASS 18: out-of-session tick blocked");

// 19. Provenance and safety
{
  const e = createLiveCandleEngine();

  e.ingestMinute(minute(0));

  const s = e.snapshot();

  assert.equal(
    s.sourceDataType,
    "REAL_SOURCE_CANDLES_OR_TICKS"
  );

  assert.equal(s.syntheticCandlesCreated, 0);

  assert.match(
    s.note,
    /never fabricated/
  );

  assert.equal(
    LIVE_CANDLE_ENGINE_CONFIG.orderExecution,
    false
  );
}

console.log("PASS 19: provenance and no-execution safety");

// 20. Retention limit
{
  const e = createLiveCandleEngine({
    maxMinuteBars: 15
  });

  for (let i = 0; i < 20; i++) {
    e.ingestMinute(minute(i));
  }

  assert.equal(
    e.snapshot().minuteCandles.length,
    15
  );
}

console.log("PASS 20: minute retention cap");

// 21. Explicit reset
{
  const e = createLiveCandleEngine();

  e.ingestMinute(minute(0));
  e.reset();

  const s = e.snapshot();

  assert.equal(s.status, "WAITING_FOR_DATA");
  assert.equal(s.sessionDate, null);
  assert.equal(s.minuteCandles.length, 0);
}

console.log("PASS 21: reset clears state");

console.log(
  "ALL LIVE CANDLE ENGINE TESTS PASSED (21)"
);
