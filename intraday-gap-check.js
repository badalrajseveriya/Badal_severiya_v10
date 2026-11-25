// ======================================================
// BADAL SEVERIYA V12
// INTRADAY CANDLE GAP CHECKER
// NIFTY 15-MINUTE HISTORICAL DATA
// IST SESSION-AWARE VALIDATION
// ======================================================

const DEFAULT_INTERVAL_MINUTES = 15;
const IST_OFFSET_MINUTES = 330;

const SESSION_START_MINUTES = 9 * 60 + 15; // 09:15
const SESSION_LAST_CANDLE_MINUTES = 15 * 60 + 15; // 15:15
const MAX_REPORTED_GAPS = 100;

// ------------------------------------------------------
// TIMESTAMP PARSER
// ------------------------------------------------------

function parseTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Unix seconds or milliseconds
    return value < 1e12 ? value * 1000 : value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Date.parse(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

// ------------------------------------------------------
// IST HELPERS
// ------------------------------------------------------

function getISTParts(timestampMs) {
  const shifted = new Date(
    timestampMs + IST_OFFSET_MINUTES * 60 * 1000
  );

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes()
  };
}

function getISTDateKey(timestampMs) {
  const p = getISTParts(timestampMs);

  return [
    p.year,
    String(p.month).padStart(2, "0"),
    String(p.day).padStart(2, "0")
  ].join("-");
}

function getISTTime(timestampMs) {
  const p = getISTParts(timestampMs);

  return (
    String(p.hour).padStart(2, "0") +
    ":" +
    String(p.minute).padStart(2, "0")
  );
}

function getISTMinuteOfDay(timestampMs) {
  const p = getISTParts(timestampMs);

  return p.hour * 60 + p.minute;
}

function isWithinMarketSession(timestampMs) {
  const minute = getISTMinuteOfDay(timestampMs);

  return (
    minute >= SESSION_START_MINUTES &&
    minute <= SESSION_LAST_CANDLE_MINUTES
  );
}

// ------------------------------------------------------
// MAIN GAP CHECK
// ------------------------------------------------------

export function analyzeIntradayGaps(
  input,
  options = {}
) {
  try {
    const intervalMinutes =
      Number.isFinite(options.intervalMinutes) &&
      options.intervalMinutes > 0
        ? options.intervalMinutes
        : DEFAULT_INTERVAL_MINUTES;

    const intervalMs =
      intervalMinutes * 60 * 1000;

    const candles = Array.isArray(input)
      ? input
      : input?.candles;

    if (!Array.isArray(candles)) {
      throw new Error(
        "Candles must be provided as an array."
      );
    }

    if (candles.length === 0) {
      return {
        status: "OK",
        module: "INTRADAY_GAP_CHECK",
        timeframe: `${intervalMinutes}m`,
        quality: "NO_DATA",
        candleCount: 0,
        validTimestampCount: 0,
        duplicateCount: 0,
        missingCandleCount: 0,
        gapCount: 0,
        offSessionCount: 0,
        gaps: [],
        duplicates: [],
        offSessionCandles: [],
        checks: {
          timestamps: "NO_DATA",
          duplicates: "NO_DATA",
          missingCandles: "NO_DATA",
          marketSession: "NO_DATA"
        }
      };
    }

    // STEP 1: Parse and prepare candle timestamps

    const parsed = [];
    const invalidTimestampIndexes = [];

    candles.forEach((candle, index) => {
      const timestamp = parseTimestamp(
        candle?.timestamp ??
        candle?.time ??
        candle?.date
      );

      if (timestamp === null) {
        invalidTimestampIndexes.push(index);
        return;
      }

      parsed.push({
        index,
        timestamp,
        dateKey: getISTDateKey(timestamp),
        time: getISTTime(timestamp),
        minuteOfDay: getISTMinuteOfDay(timestamp),
        inSession: isWithinMarketSession(timestamp)
      });
    });

    // STEP 2: Sort chronologically

    parsed.sort((a, b) =>
      a.timestamp - b.timestamp
    );

    // STEP 3: Detect duplicate timestamps

    const duplicates = [];
    const seen = new Map();

    for (const candle of parsed) {
      if (seen.has(candle.timestamp)) {
        duplicates.push({
          timestamp: candle.timestamp,
          date: candle.dateKey,
          time: candle.time,
          originalIndex: seen.get(candle.timestamp),
          duplicateIndex: candle.index
        });
      } else {
        seen.set(
          candle.timestamp,
          candle.index
        );
      }
    }

    // STEP 4: Detect off-session candles

    const offSessionCandles = parsed
      .filter(candle => !candle.inSession)
      .map(candle => ({
        index: candle.index,
        date: candle.dateKey,
        time: candle.time
      }));

    // STEP 5: Detect gaps within same IST trading date

    const gaps = [];
    let missingCandleCount = 0;
    let irregularIntervalCount = 0;

    for (let i = 1; i < parsed.length; i++) {
      const previous = parsed[i - 1];
      const current = parsed[i];

      // Never count overnight / date-boundary gaps.
      if (previous.dateKey !== current.dateKey) {
        continue;
      }

      // Do not compare timestamps outside regular session.
      if (!previous.inSession || !current.inSession) {
        continue;
      }

      const difference =
        current.timestamp - previous.timestamp;

      // Same timestamp handled as duplicate above.
      if (difference <= 0) {
        continue;
      }

      if (difference === intervalMs) {
        continue;
      }

      if (difference > intervalMs) {
        const estimatedMissing =
          Math.max(
            0,
            Math.round(difference / intervalMs) - 1
          );

        const isExactIntervalMultiple =
          difference % intervalMs === 0;

        missingCandleCount += estimatedMissing;

        if (!isExactIntervalMultiple) {
          irregularIntervalCount++;
        }

        if (gaps.length < MAX_REPORTED_GAPS) {
          gaps.push({
            date: current.dateKey,
            from: previous.time,
            to: current.time,
            differenceMinutes:
              difference / 60000,
            missingCandles: estimatedMissing,
            exactIntervalMultiple:
              isExactIntervalMultiple,
            previousIndex: previous.index,
            currentIndex: current.index
          });
        }
      }
    }

    // STEP 6: Determine quality status

    const issueCount =
      invalidTimestampIndexes.length +
      duplicates.length +
      missingCandleCount +
      irregularIntervalCount +
      offSessionCandles.length;

    let quality = "VALID";

    if (issueCount > 0) {
      quality = "ISSUES_FOUND";
    }

    return {
      status: "OK",
      module: "INTRADAY_GAP_CHECK",
      version: "1.0",
      timeframe: `${intervalMinutes}m`,
      timezone: "Asia/Kolkata",
      marketSession: {
        start: "09:15",
        lastCandleStart: "15:15",
        close: "15:30"
      },

      quality,

      candleCount: candles.length,
      validTimestampCount: parsed.length,

      invalidTimestampCount:
        invalidTimestampIndexes.length,

      invalidTimestampIndexes,

      duplicateCount: duplicates.length,
      duplicates,

      missingCandleCount,
      gapCount: gaps.length,
      gaps,

      irregularIntervalCount,

      offSessionCount:
        offSessionCandles.length,

      offSessionCandles,

      gapsTruncated:
        gaps.length >= MAX_REPORTED_GAPS,

      checks: {
        timestamps:
          invalidTimestampIndexes.length === 0
            ? "PASS"
            : "FAIL",

        duplicates:
          duplicates.length === 0
            ? "PASS"
            : "FAIL",

        missingCandles:
          missingCandleCount === 0
            ? "PASS"
            : "FAIL",

        marketSession:
          offSessionCandles.length === 0
            ? "PASS"
            : "REVIEW"
      }
    };
  } catch (error) {
    return {
      status: "ERROR",
      module: "INTRADAY_GAP_CHECK",
      quality: "ERROR",
      error: error.message
    };
  }
}

// ------------------------------------------------------
// EXPORT DEFAULT CONFIGURATION
// ------------------------------------------------------

export const INTRADAY_GAP_CHECK_CONFIG = {
  intervalMinutes: DEFAULT_INTERVAL_MINUTES,
  timezone: "Asia/Kolkata",
  sessionStart: "09:15",
  lastCandleStart: "15:15",
  marketClose: "15:30",
  maxReportedGaps: MAX_REPORTED_GAPS
};