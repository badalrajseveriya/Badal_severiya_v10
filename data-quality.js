
const DEFAULTS = {
  minCandles: 30,
  maxCandles: 5000
};

function parseTimestamp(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) return null;

  let timestamp;

  if (
    typeof value === "number" ||
    /^\d+$/.test(String(value))
  ) {
    const numeric = Number(value);
    timestamp = numeric < 1e12
      ? numeric * 1000
      : numeric;
  } else {
    timestamp = Date.parse(String(value));
  }

  return Number.isFinite(timestamp)
    ? timestamp
    : null;
}

function getSource(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.candles)) return input.candles;
  if (Array.isArray(input?.data)) return input.data;

  throw new Error("Candle data must be an array.");
}

export function analyzeDataQuality(input, options = {}) {
  try {
    if (
      options === null ||
      typeof options !== "object" ||
      Array.isArray(options)
    ) {
      throw new Error("Invalid data quality configuration.");
    }

    const settings = {
      ...DEFAULTS,
      ...options
    };

    if (
      !Number.isInteger(settings.minCandles) ||
      !Number.isInteger(settings.maxCandles) ||
      settings.minCandles < 1 ||
      settings.maxCandles < settings.minCandles
    ) {
      throw new Error("Invalid data quality configuration.");
    }

    const source = getSource(input);

    if (source.length < settings.minCandles) {
      throw new Error(
        `At least ${settings.minCandles} candles are required.`
      );
    }

    if (source.length > settings.maxCandles) {
      throw new Error(
        `Maximum ${settings.maxCandles} candles are allowed.`
      );
    }

    let invalidOHLC = 0;
    let invalidVolume = 0;
    let missingVolumes = 0;
    let invalidTimestamps = 0;
    let missingTimestamps = 0;
    let duplicateTimestamps = 0;
    let unorderedTimestamps = 0;

    const timestamps = [];

    for (const item of source) {
      if (!item || typeof item !== "object") {
        invalidOHLC++;
        timestamps.push(null);
        continue;
      }

      const open = Number(item.open ?? item.Open);
      const high = Number(item.high ?? item.High);
      const low = Number(item.low ?? item.Low);
      const close = Number(item.close ?? item.Close);

      if (
        ![open, high, low, close].every(Number.isFinite) ||
        open <= 0 ||
        high <= 0 ||
        low <= 0 ||
        close <= 0 ||
        high < low ||
        high < open ||
        high < close ||
        low > open ||
        low > close
      ) {
        invalidOHLC++;
      }

      const rawVolume = item.volume ?? item.Volume;

      if (
        rawVolume === null ||
        rawVolume === undefined ||
        rawVolume === ""
      ) {
        missingVolumes++;
      } else {
        const volume = Number(rawVolume);

        if (!Number.isFinite(volume) || volume < 0) {
          invalidVolume++;
        }
      }

      const rawTimestamp =
        item.timestamp ??
        item.time ??
        item.date ??
        item.datetime;

      if (
        rawTimestamp === null ||
        rawTimestamp === undefined ||
        rawTimestamp === ""
      ) {
        missingTimestamps++;
        timestamps.push(null);
        continue;
      }

      const timestamp = parseTimestamp(rawTimestamp);

      if (timestamp === null) {
        invalidTimestamps++;
        timestamps.push(null);
        continue;
      }

      timestamps.push(timestamp);
    }

    // Check duplicates and order independently of invalid dates.
    const seen = new Set();
    let previousTimestamp = null;

    for (const timestamp of timestamps) {
      if (timestamp === null) continue;

      if (seen.has(timestamp)) {
        duplicateTimestamps++;
      }

      seen.add(timestamp);

      if (
        previousTimestamp !== null &&
        timestamp < previousTimestamp
      ) {
        unorderedTimestamps++;
      }

      previousTimestamp = timestamp;
    }

    const checks = {
      candleCount: source.length,
      invalidOHLC,
      invalidVolume,
      missingVolumes,
      invalidTimestamps,
      missingTimestamps,
      duplicateTimestamps,
      unorderedTimestamps
    };

    const issueCount =
      invalidOHLC +
      invalidVolume +
      missingVolumes +
      invalidTimestamps +
      missingTimestamps +
      duplicateTimestamps +
      unorderedTimestamps;

    const quality = issueCount === 0
      ? "VALID"
      : "ISSUES_FOUND";

    return {
      status: "OK",
      version: "12.0",
      module: "HISTORICAL_DATA_QUALITY",
      dataType: "HISTORICAL_ONLY",
      quality,
      issueCount,
      checks,
      settings,
      note:
        "Historical data validation only. Quality status is not a forecast or trading recommendation."
    };

  } catch (error) {
    return {
      status: "ERROR",
      version: "12.0",
      module: "HISTORICAL_DATA_QUALITY",
      dataType: "HISTORICAL_ONLY",
      error: error.message
    };
  }
}
