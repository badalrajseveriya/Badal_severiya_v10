import assert from "node:assert/strict";
import {
  analyzeIntradayGaps
} from "./intraday-gap-check.js";

// ------------------------------------------------------
// TEST HELPERS
// ------------------------------------------------------

function istTimeToUTC(date, hour, minute) {
  return Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    hour - 5,
    minute - 30
  );
}

const date = {
  year: 2026,
  month: 11,
  day: 24
};

function candle(
  hour,
  minute,
  dateValue = date
) {
  return {
    timestamp: istTimeToUTC(
      dateValue,
      hour,
      minute
    ),
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: 1000
  };
}

function runTest(name, fn) {
  fn();
  console.log(`PASS: ${name}`);
}

// ------------------------------------------------------
// TEST 1: CONTINUOUS CANDLES
// ------------------------------------------------------

runTest(
  "Continuous 15-minute candles have no gaps",
  () => {
    const result =
      analyzeIntradayGaps([
        candle(9, 15),
        candle(9, 30),
        candle(9, 45),
        candle(10, 0)
      ]);

    assert.equal(result.status, "OK");
    assert.equal(result.quality, "VALID");
    assert.equal(
      result.missingCandleCount,
      0
    );
    assert.equal(result.gapCount, 0);
  }
);

// ------------------------------------------------------
// TEST 2: ONE MISSING CANDLE
// ------------------------------------------------------

runTest(
  "Detects one missing candle",
  () => {
    const result =
      analyzeIntradayGaps([
        candle(9, 15),
        candle(9, 30),
        candle(10, 0)
      ]);

    assert.equal(
      result.missingCandleCount,
      1
    );

    assert.equal(result.gapCount, 1);
    assert.equal(result.gapsTotal, 1);
    assert.equal(
      result.quality,
      "ISSUES_FOUND"
    );

    assert.equal(
      result.gaps[0].from,
      "09:30"
    );

    assert.equal(
      result.gaps[0].to,
      "10:00"
    );
  }
);

// ------------------------------------------------------
// TEST 3: MULTIPLE MISSING CANDLES
// ------------------------------------------------------

runTest(
  "Detects multiple missing candles",
  () => {
    const result =
      analyzeIntradayGaps([
        candle(9, 15),
        candle(10, 0)
      ]);

    assert.equal(
      result.missingCandleCount,
      2
    );

    assert.equal(result.gapCount, 1);

    assert.equal(
      result.gaps[0].missingCandles,
      2
    );
  }
);

// ------------------------------------------------------
// TEST 4: OVERNIGHT GAP
// ------------------------------------------------------

runTest(
  "Does not count overnight gaps",
  () => {
    const nextDay = {
      year: 2026,
      month: 11,
      day: 25
    };

    const result =
      analyzeIntradayGaps([
        candle(15, 15, date),
        candle(9, 15, nextDay)
      ]);

    assert.equal(
      result.missingCandleCount,
      0
    );

    assert.equal(result.gapCount, 0);

    assert.equal(
      result.quality,
      "VALID"
    );
  }
);

// ------------------------------------------------------
// TEST 5: DUPLICATE TIMESTAMPS
// ------------------------------------------------------

runTest(
  "Detects duplicate timestamps",
  () => {
    const result =
      analyzeIntradayGaps([
        candle(9, 15),
        candle(9, 30),
        candle(9, 30),
        candle(9, 45)
      ]);

    assert.equal(
      result.duplicateCount,
      1
    );

    assert.equal(
      result.quality,
      "ISSUES_FOUND"
    );
  }
);

// ------------------------------------------------------
// TEST 6: OFF-SESSION CANDLES
// ------------------------------------------------------

runTest(
  "Detects off-session candles",
  () => {
    const result =
      analyzeIntradayGaps([
        candle(8, 45),
        candle(9, 15)
      ]);

    assert.equal(
      result.offSessionCount,
      1
    );

    assert.equal(
      result.quality,
      "ISSUES_FOUND"
    );

    assert.equal(
      result.checks.marketSession,
      "REVIEW"
    );
  }
);

// ------------------------------------------------------
// TEST 7: INVALID TIMESTAMP
// ------------------------------------------------------

runTest(
  "Detects invalid timestamps",
  () => {
    const result =
      analyzeIntradayGaps([
        candle(9, 15),
        {
          timestamp: "invalid-date"
        },
        candle(9, 30)
      ]);

    assert.equal(
      result.invalidTimestampCount,
      1
    );

    assert.equal(
      result.checks.timestamps,
      "FAIL"
    );

    assert.equal(
      result.quality,
      "ISSUES_FOUND"
    );
  }
);

// ------------------------------------------------------
// TEST 8: CONFIGURABLE 30-MINUTE INTERVAL
// ------------------------------------------------------

runTest(
  "Supports configurable 30-minute interval",
  () => {
    const result =
      analyzeIntradayGaps(
        [
          candle(9, 15),
          candle(9, 45),
          candle(10, 15)
        ],
        {
          intervalMinutes: 30
        }
      );

    assert.equal(
      result.timeframe,
      "30m"
    );

    assert.equal(
      result.missingCandleCount,
      0
    );

    assert.equal(result.gapCount, 0);

    assert.equal(
      result.quality,
      "VALID"
    );
  }
);

// ------------------------------------------------------
// TEST 9: EMPTY INPUT
// ------------------------------------------------------

runTest(
  "Handles empty candle array",
  () => {
    const result =
      analyzeIntradayGaps([]);

    assert.equal(result.status, "OK");

    assert.equal(
      result.quality,
      "NO_DATA"
    );

    assert.equal(
      result.candleCount,
      0
    );

    assert.equal(
      result.gapCount,
      0
    );

    assert.equal(
      result.gapsTotal,
      0
    );
  }
);

// ------------------------------------------------------
// TEST 10: NUMERIC TIMESTAMP STRING (SECONDS)
// ------------------------------------------------------

runTest(
  "Parses numeric timestamp strings in seconds",
  () => {
    const ts =
      candle(9, 15).timestamp;

    const result =
      analyzeIntradayGaps([
        {
          timestamp: String(ts / 1000)
        },
        {
          timestamp: String(
            (ts + 15 * 60000) / 1000
          )
        }
      ]);

    assert.equal(
      result.validTimestampCount,
      2
    );

    assert.equal(result.gapCount, 0);

    assert.equal(
      result.quality,
      "VALID"
    );
  }
);

// ------------------------------------------------------
// TEST 11: NUMERIC TIMESTAMP STRING (MILLISECONDS)
// ------------------------------------------------------

runTest(
  "Parses numeric timestamp strings in milliseconds",
  () => {
    const ts =
      candle(9, 15).timestamp;

    const result =
      analyzeIntradayGaps([
        {
          timestamp: String(ts)
        },
        {
          timestamp: String(
            ts + 15 * 60000
          )
        }
      ]);

    assert.equal(
      result.validTimestampCount,
      2
    );

    assert.equal(result.gapCount, 0);

    assert.equal(
      result.quality,
      "VALID"
    );
  }
);

// ------------------------------------------------------
// TEST 12: MORE THAN 100 GAP EVENTS
// ------------------------------------------------------

runTest(
  "Counts all gaps while limiting displayed details",
  () => {
    const manyCandles = [];

    const startDate = new Date(
      Date.UTC(2026, 0, 1)
    );

    // Generate 101 separate date gap events
    for (let i = 0; i < 101; i++) {
      const d = new Date(startDate);

      d.setUTCDate(
        d.getUTCDate() + i
      );

      const day = {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate()
      };

      manyCandles.push(
        candle(9, 15, day),
        candle(10, 0, day)
      );
    }

    const result =
      analyzeIntradayGaps(
        manyCandles
      );

    assert.equal(
      result.gapCount,
      101
    );

    assert.equal(
      result.gapsTotal,
      101
    );

    // Only 100 details retained
    assert.equal(
      result.gaps.length,
      100
    );

    assert.equal(
      result.gapsTruncated,
      true
    );

    assert.equal(
      result.missingCandleCount,
      202
    );
  }
);

// ------------------------------------------------------
// TEST 13: IRREGULAR INTERVAL + MISSING CANDLE
// ------------------------------------------------------

runTest(
  "Detects irregular interval and missing candle",
  () => {
    const result =
      analyzeIntradayGaps([
        candle(9, 15),
        candle(9, 40)
      ]);

    assert.equal(
      result.gapCount,
      1
    );

    assert.equal(
      result.missingCandleCount,
      1
    );

    assert.equal(
      result.irregularIntervalCount,
      1
    );

    assert.equal(
      result.quality,
      "ISSUES_FOUND"
    );
  }
);

// ------------------------------------------------------
// TEST 14: SESSION START AND END BOUNDARIES
// ------------------------------------------------------

runTest(
  "Opt-in boundary check finds missing first and last candles",
  () => {
    const result =
      analyzeIntradayGaps(
        [
          candle(9, 30),
          candle(15, 0)
        ],
        {
          checkSessionBoundaries: true,
          completedSessionDates: [
            "2026-11-24"
          ]
        }
      );

    assert.equal(
      result.boundaryGapCount,
      2
    );

    assert.equal(
      result.boundaryMissingCandleCount,
      2
    );

    assert.equal(
      result.boundaryGaps[0].boundaryType,
      "SESSION_START"
    );

    assert.equal(
      result.boundaryGaps[0].missingCandles,
      1
    );

    assert.equal(
      result.boundaryGaps[1].boundaryType,
      "SESSION_END"
    );

    assert.equal(
      result.boundaryGaps[1].missingCandles,
      1
    );

    assert.equal(
      result.checks.sessionBoundaries,
      "FAIL"
    );

    assert.equal(
      result.quality,
      "ISSUES_FOUND"
    );
  }
);

// ------------------------------------------------------
// TEST 15: COMPLETE SESSION
// ------------------------------------------------------

runTest(
  "Complete session boundary data passes boundary check",
  () => {
    const fullSession = [];

    for (
      let minute = 9 * 60 + 15;
      minute <= 15 * 60 + 15;
      minute += 15
    ) {
      fullSession.push(
        candle(
          Math.floor(minute / 60),
          minute % 60
        )
      );
    }

    const result =
      analyzeIntradayGaps(
        fullSession,
        {
          checkSessionBoundaries: true,
          completedSessionDates: [
            "2026-11-24"
          ]
        }
      );

    assert.equal(
      fullSession.length,
      25
    );

    assert.equal(
      result.boundaryGapCount,
      0
    );

    assert.equal(
      result.boundaryMissingCandleCount,
      0
    );

    assert.equal(
      result.checks.sessionBoundaries,
      "PASS"
    );

    assert.equal(
      result.quality,
      "VALID"
    );
  }
);

// ------------------------------------------------------
// TEST 16: UNCONFIRMED SESSION NOT CHECKED
// ------------------------------------------------------

runTest(
  "Boundary checker does not flag dates not marked completed",
  () => {
    const result =
      analyzeIntradayGaps(
        [
          candle(9, 30),
          candle(10, 0)
        ],
        {
          checkSessionBoundaries: true,
          completedSessionDates: []
        }
      );

    assert.equal(
      result.boundaryGapCount,
      0
    );

    assert.equal(
      result.boundaryMissingCandleCount,
      0
    );

    assert.equal(
      result.boundaryCheckStatus,
      "NO_COMPLETED_DATES"
    );

    assert.equal(
      result.checks.sessionBoundaries,
      "NO_COMPLETED_DATES"
    );

    assert.equal(
      result.quality,
      "VALID"
    );
  }
);

// ------------------------------------------------------
// ALL TESTS
// ------------------------------------------------------

console.log("\n========================================");
console.log(
  "ALL 16 INTRADAY GAP CHECK TESTS PASSED"
);
console.log("========================================");