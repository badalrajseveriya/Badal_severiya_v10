
 // ======================================================
 // BADAL SEVERIYA V12
 // HISTORICAL CANDLE COMPOSITION
 // Retrospective description only
 // No forecasts, probabilities or trading signals
 // ======================================================

const DEFAULTS = {
  minCandles: 20,
  dojiBodyRatio: 0.10
};

/*
 * Convert counts into percentages that sum to exactly
 * 100.0 using largest-remainder allocation.
 *
 * Percentages are represented internally in tenths:
 * 100.0% = 1000 units.
 *
 * This prevents independently rounded percentages from
 * producing totals such as 99.9% or 100.1%.
 *
 * Counts are never modified or fabricated.
 */
function calculateBalancedPercentages(counts, total) {
  const keys = ["bullish", "bearish", "neutral"];
  const totalUnits = 1000;

  const allocations = keys.map(key => {
    const exactUnits = (counts[key] / total) * totalUnits;
    const baseUnits = Math.floor(exactUnits);

    return {
      key,
      units: baseUnits,
      remainder: exactUnits - baseUnits
    };
  });

  let allocatedUnits = allocations.reduce(
    (sum, item) => sum + item.units,
    0
  );

  let remainingUnits = totalUnits - allocatedUnits;

  /*
   * Largest remainder first.
   * Stable tie order: bullish, bearish, neutral.
   */
  const ranked = [...allocations].sort(
    (a, b) =>
      b.remainder - a.remainder ||
      keys.indexOf(a.key) - keys.indexOf(b.key)
  );

  for (
    let i = 0;
    remainingUnits > 0;
    i++
  ) {
    ranked[i % ranked.length].units++;
    remainingUnits--;
  }

  const percentages = {};

  for (const item of allocations) {
    percentages[item.key] = item.units / 10;
  }

  /*
   * Final integrity check: integer tenths must total 1000.
   */
  allocatedUnits = allocations.reduce(
    (sum, item) => sum + item.units,
    0
  );

  if (allocatedUnits !== totalUnits) {
    throw new Error(
      "Percentage balancing failed to produce 100.0%."
    );
  }

  return percentages;
}

export function calculateHistoricalCandleComposition(
  candles,
  options = {}
) {
  if (!Array.isArray(candles)) {
    throw new Error("Historical candles must be an array.");
  }

  const config = {
    ...DEFAULTS,
    ...options
  };

  if (
    !Number.isInteger(config.minCandles) ||
    config.minCandles < 1 ||
    !Number.isFinite(config.dojiBodyRatio) ||
    config.dojiBodyRatio <= 0 ||
    config.dojiBodyRatio >= 1
  ) {
    throw new Error("Invalid composition configuration.");
  }

  if (candles.length < config.minCandles) {
    throw new Error(
      `At least ${config.minCandles} historical candles are required.`
    );
  }

  let previousTime = -Infinity;

  const counts = {
    bullish: 0,
    bearish: 0,
    neutral: 0
  };

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const timestamp = Date.parse(candle?.timestamp);

    if (
      !Number.isFinite(timestamp) ||
      timestamp <= previousTime
    ) {
      throw new Error(
        `Invalid timestamp at candle index ${i}.`
      );
    }

    previousTime = timestamp;

    const values = [
      candle.open,
      candle.high,
      candle.low,
      candle.close
    ];

    if (
      !values.every(Number.isFinite) ||
      values.some(value => value <= 0) ||
      candle.high < Math.max(
        candle.open,
        candle.close,
        candle.low
      ) ||
      candle.low > Math.min(
        candle.open,
        candle.close,
        candle.high
      )
    ) {
      throw new Error(
        `Invalid OHLC values at candle index ${i}.`
      );
    }

    const body = Math.abs(
      candle.close - candle.open
    );

    const range = candle.high - candle.low;

    const isDoji =
      range === 0 ||
      body / range <= config.dojiBodyRatio;

    if (isDoji) {
      counts.neutral++;
    } else if (candle.close > candle.open) {
      counts.bullish++;
    } else if (candle.close < candle.open) {
      counts.bearish++;
    } else {
      counts.neutral++;
    }
  }

  const total = candles.length;

  const percentages =
    calculateBalancedPercentages(counts, total);

  const result = {
    status: "OK",
    dataType: "HISTORICAL_ONLY",
    timeframe: options.timeframe ?? "UNKNOWN",
    sampleSize: total,

    counts: {
      bullish: counts.bullish,
      bearish: counts.bearish,
      neutral: counts.neutral
    },

    percentages,

    note:
      "These percentages describe the composition of past candles only. They are not future probabilities, forecasts or trading signals."
  };

  return result;
}
