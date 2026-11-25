
// ==================================================
// BADAL SEVERIYA V11.1
// HISTORICAL TECHNICAL ANALYSIS ENGINE
// Educational and historical analysis only
// No live trading signals or order execution
// No forecasts or probability claims
// ==================================================

const MIN_CANDLES = 200;
const DEFAULT_MAX_CANDLES = 5000;
const ABSOLUTE_MAX_CANDLES = 100000;

const NOTE =
  "Historical educational analysis only. Scores are descriptive classifications, not probabilities, forecasts, or trading recommendations.";

// --------------------------------------------------
// TIMESTAMP
// --------------------------------------------------

function parseTimestamp(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  let timestamp;

  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    timestamp = numeric < 1e12 ? numeric * 1000 : numeric;
  } else {
    timestamp = Date.parse(String(value));
  }

  return Number.isFinite(timestamp) ? timestamp : null;
}

function getIndiaTradingDate(timestamp) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(timestamp));
}

// --------------------------------------------------
// NORMALIZE AND VALIDATE CANDLES
// --------------------------------------------------

function normalizeCandles(input, options = {}) {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options)
  ) {
    throw new Error("Analysis options must be an object.");
  }

  const maxCandles = options.maxCandles ?? DEFAULT_MAX_CANDLES;

  if (
    !Number.isSafeInteger(maxCandles) ||
    maxCandles < MIN_CANDLES ||
    maxCandles > ABSOLUTE_MAX_CANDLES
  ) {
    throw new Error(
      `maxCandles must be an integer between ${MIN_CANDLES} and ${ABSOLUTE_MAX_CANDLES}.`
    );
  }

  let source = input;

  if (!Array.isArray(source)) {
    if (Array.isArray(input?.candles)) {
      source = input.candles;
    } else if (Array.isArray(input?.data)) {
      source = input.data;
    } else {
      throw new Error("Candle data must be an array.");
    }
  }

  if (source.length < MIN_CANDLES) {
    throw new Error(
      `At least ${MIN_CANDLES} candles are required. Received ${source.length}.`
    );
  }

  if (source.length > maxCandles) {
    throw new Error(`Maximum ${maxCandles} candles are allowed.`);
  }

  const candles = source.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Invalid candle object at row ${index + 1}.`);
    }

    const open = Number(item.open ?? item.Open);
    const high = Number(item.high ?? item.High);
    const low = Number(item.low ?? item.Low);
    const close = Number(item.close ?? item.Close);
    const volume = Number(item.volume ?? item.Volume ?? 0);

    if (![open, high, low, close, volume].every(Number.isFinite)) {
      throw new Error(`Invalid numeric data at candle ${index + 1}.`);
    }

    if (
      open <= 0 || high <= 0 || low <= 0 ||
      close <= 0 || volume < 0
    ) {
      throw new Error(`Invalid price or volume at candle ${index + 1}.`);
    }

    if (
      high < low || high < open || high < close ||
      low > open || low > close
    ) {
      throw new Error(`Invalid OHLC values at candle ${index + 1}.`);
    }

    const rawTimestamp =
      item.timestamp ?? item.time ?? item.date ?? item.datetime ?? null;

    const timestamp = parseTimestamp(rawTimestamp);

    if (rawTimestamp !== null && timestamp === null) {
      throw new Error(`Invalid timestamp at candle ${index + 1}.`);
    }

    return { open, high, low, close, volume, timestamp };
  });

  const timestampCount = candles.filter(
    candle => candle.timestamp !== null
  ).length;

  if (timestampCount > 0 && timestampCount !== candles.length) {
    throw new Error("Provide timestamps for every candle, or none.");
  }

  const chronologicalOrderValidated =
    timestampCount === candles.length;

  if (chronologicalOrderValidated) {
    for (let i = 1; i < candles.length; i++) {
      if (candles[i].timestamp <= candles[i - 1].timestamp) {
        throw new Error(
          `Candles are not chronological at candle ${i + 1}.`
        );
      }
    }
  }

  return {
    candles,
    chronologicalOrderValidated
  };
}

// --------------------------------------------------
// EMA SERIES
// --------------------------------------------------

function emaSeries(values, period) {
  const result = Array(values.length).fill(null);

  if (values.length < period) return result;

  const multiplier = 2 / (period + 1);

  let ema = 0;

  for (let i = 0; i < period; i++) {
    ema += values[i];
  }

  ema /= period;
  result[period - 1] = ema;

  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
    result[i] = ema;
  }

  return result;
}

// --------------------------------------------------
// RSI - WILDER
// --------------------------------------------------

function rsiSeries(values, period = 14) {
  const result = Array(values.length).fill(null);

  if (values.length <= period) return result;

  let gain = 0;
  let loss = 0;

  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    gain += Math.max(change, 0);
    loss += Math.max(-change, 0);
  }

  let avgGain = gain / period;
  let avgLoss = loss / period;

  result[period] = avgLoss === 0
    ? (avgGain === 0 ? 50 : 100)
    : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];

    avgGain =
      (avgGain * (period - 1) + Math.max(change, 0)) / period;

    avgLoss =
      (avgLoss * (period - 1) + Math.max(-change, 0)) / period;

    result[i] = avgLoss === 0
      ? (avgGain === 0 ? 50 : 100)
      : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return result;
}

// --------------------------------------------------
// TRUE RANGE AND ATR
// --------------------------------------------------

function trueRangeSeries(candles) {
  return candles.map((candle, i) => {
    if (i === 0) return candle.high - candle.low;

    const previousClose = candles[i - 1].close;

    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });
}

function wilderAverageSeries(values, period) {
  const result = Array(values.length).fill(null);

  if (values.length < period) return result;

  let average = 0;

  for (let i = 0; i < period; i++) {
    average += values[i];
  }

  average /= period;
  result[period - 1] = average;

  for (let i = period; i < values.length; i++) {
    average =
      (average * (period - 1) + values[i]) / period;

    result[i] = average;
  }

  return result;
}

// --------------------------------------------------
// MACD
// --------------------------------------------------

function calculateMACD(values) {
  const fast = emaSeries(values, 12);
  const slow = emaSeries(values, 26);

  const macd = values.map((_, i) =>
    fast[i] === null || slow[i] === null
      ? null
      : fast[i] - slow[i]
  );

  const validStart = macd.findIndex(value => value !== null);
  const signal = Array(values.length).fill(null);

  if (validStart >= 0) {
    const validValues = macd.slice(validStart);
    const calculated = emaSeries(validValues, 9);

    for (let i = 0; i < calculated.length; i++) {
      signal[validStart + i] = calculated[i];
    }
  }

  const histogram = macd.map((value, i) =>
    value === null || signal[i] === null
      ? null
      : value - signal[i]
  );

  return { macd, signal, histogram };
}

// --------------------------------------------------
// DMI AND ADX
// --------------------------------------------------

function calculateDMI(candles, period = 14) {
  const length = candles.length;

  const plusDM = Array(length).fill(0);
  const minusDM = Array(length).fill(0);

  for (let i = 1; i < length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;

    plusDM[i] =
      upMove > downMove && upMove > 0 ? upMove : 0;

    minusDM[i] =
      downMove > upMove && downMove > 0 ? downMove : 0;
  }

  const tr = trueRangeSeries(candles);

  const smoothTR = wilderAverageSeries(tr, period);
  const smoothPlus = wilderAverageSeries(plusDM, period);
  const smoothMinus = wilderAverageSeries(minusDM, period);

  const plusDI = Array(length).fill(null);
  const minusDI = Array(length).fill(null);
  const dx = Array(length).fill(null);

  for (let i = 0; i < length; i++) {
    if (
      smoothTR[i] === null ||
      smoothPlus[i] === null ||
      smoothMinus[i] === null ||
      smoothTR[i] === 0
    ) continue;

    plusDI[i] = 100 * smoothPlus[i] / smoothTR[i];
    minusDI[i] = 100 * smoothMinus[i] / smoothTR[i];

    const total = plusDI[i] + minusDI[i];

    dx[i] = total === 0
      ? 0
      : 100 * Math.abs(plusDI[i] - minusDI[i]) / total;
  }

  const firstDX = dx.findIndex(value => value !== null);
  const adx = Array(length).fill(null);

  if (firstDX >= 0) {
    const validDX = dx.slice(firstDX).map(value => value ?? 0);
    const calculated = wilderAverageSeries(validDX, period);

    for (let i = 0; i < calculated.length; i++) {
      adx[firstDX + i] = calculated[i];
    }
  }

  return { plusDI, minusDI, adx };
}

// --------------------------------------------------
// BOLLINGER BANDS
// --------------------------------------------------

function calculateBollinger(values, period = 20, multiplier = 2) {
  const length = values.length;
  const result = Array(length).fill(null);

  for (let i = period - 1; i < length; i++) {
    const window = values.slice(i - period + 1, i + 1);

    const mean = window.reduce((a, b) => a + b, 0) / period;

    const variance =
      window.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      period;

    const deviation = Math.sqrt(variance);

    result[i] = {
      middle: mean,
      upper: mean + multiplier * deviation,
      lower: mean - multiplier * deviation
    };
  }

  return result;
}

// --------------------------------------------------
// SESSION VWAP
// --------------------------------------------------

function calculateVWAP(candles) {
  if (candles.some(candle => candle.timestamp === null)) {
    return {
      value: null,
      session: null,
      candleCount: 0,
      volumeTotal: 0,
      available: false
    };
  }

  const latest = candles[candles.length - 1];
  const latestSession = getIndiaTradingDate(latest.timestamp);

  let priceVolume = 0;
  let volumeTotal = 0;
  let candleCount = 0;

  for (const candle of candles) {
    if (getIndiaTradingDate(candle.timestamp) !== latestSession) {
      continue;
    }

    const typicalPrice =
      (candle.high + candle.low + candle.close) / 3;

    priceVolume += typicalPrice * candle.volume;
    volumeTotal += candle.volume;
    candleCount++;
  }

  if (volumeTotal <= 0) {
    return {
      value: null,
      session: latestSession,
      candleCount,
      volumeTotal,
      available: false
    };
  }

  return {
    value: priceVolume / volumeTotal,
    session: latestSession,
    candleCount,
    volumeTotal,
    available: true
  };
}

// --------------------------------------------------
// VOLUME ANALYSIS
// Previous candles form the baseline.
// Current candle is excluded from the average.
// --------------------------------------------------

function calculateVolumeInfo(candles, period = 20) {
  const volumes = candles.map(candle => candle.volume);

  if (volumes.length <= period) {
    return {
      average: null,
      current: volumes[volumes.length - 1] ?? null,
      relativeVolume: null,
      available: false,
      baselineCandles: 0
    };
  }

  const baseline = volumes.slice(-(period + 1), -1);

  const average =
    baseline.reduce((a, b) => a + b, 0) / period;

  const current = volumes[volumes.length - 1];

  return {
    average,
    current,
    relativeVolume: average > 0 ? current / average : null,
    available: average > 0,
    baselineCandles: period
  };
}

// --------------------------------------------------
// CONFIRMED PIVOT AND STRUCTURE
// --------------------------------------------------

function calculateStructure(candles, pivotLength = 5) {
  let lastPivotHigh = null;
  let lastPivotLow = null;

  let structure = "UNCONFIRMED";
  let lastEvent = "NONE";

  for (
    let i = pivotLength;
    i < candles.length - pivotLength;
    i++
  ) {
    const candidate = candles[i];

    let isHigh = true;
    let isLow = true;

    for (let j = i - pivotLength; j <= i + pivotLength; j++) {
      if (j === i) continue;

      if (candles[j].high >= candidate.high) isHigh = false;
      if (candles[j].low <= candidate.low) isLow = false;
    }

    const confirmationIndex = i + pivotLength;

    if (isHigh) {
      lastPivotHigh = {
        price: candidate.high,
        index: i,
        confirmedAt: confirmationIndex
      };
    }

    if (isLow) {
      lastPivotLow = {
        price: candidate.low,
        index: i,
        confirmedAt: confirmationIndex
      };
    }
  }

  const latestIndex = candles.length - 1;
  const latest = candles[latestIndex];
  const previous = candles[latestIndex - 1];

  if (lastPivotHigh && lastPivotHigh.confirmedAt < latestIndex) {
    if (
      previous.close <= lastPivotHigh.price &&
      latest.close > lastPivotHigh.price
    ) {
      structure = "BULLISH_STRUCTURE_BREAK";
      lastEvent = "CONFIRMED_HIGH_BREAK";
    }
  }

  if (lastPivotLow && lastPivotLow.confirmedAt < latestIndex) {
    if (
      previous.close >= lastPivotLow.price &&
      latest.close < lastPivotLow.price
    ) {
      structure = "BEARISH_STRUCTURE_BREAK";
      lastEvent = "CONFIRMED_LOW_BREAK";
    }
  }

  if (structure === "UNCONFIRMED") {
    if (lastPivotHigh && lastPivotLow) {
      structure = "PIVOTS_AVAILABLE";
    }
  }

  return {
    structure,
    lastEvent,
    lastPivotHigh: lastPivotHigh?.price ?? null,
    lastPivotLow: lastPivotLow?.price ?? null,
    pivotLength
  };
}

// --------------------------------------------------
// LATEST CANDLE QUALITY
// --------------------------------------------------

function calculateCandleQuality(candle) {
  const range = candle.high - candle.low;

  if (range <= 0) {
    return {
      bodyRatio: 0,
      upperWickRatio: 0,
      lowerWickRatio: 0,
      candleType: "NO_RANGE"
    };
  }

  const body = Math.abs(candle.close - candle.open);
  const upperWick =
    candle.high - Math.max(candle.open, candle.close);

  const lowerWick =
    Math.min(candle.open, candle.close) - candle.low;

  const bodyRatio = body / range;
  const upperWickRatio = upperWick / range;
  const lowerWickRatio = lowerWick / range;

  let candleType = "SMALL_BODY";

  if (bodyRatio >= 0.65) {
    candleType = candle.close > candle.open
      ? "STRONG_BULLISH_BODY"
      : "STRONG_BEARISH_BODY";
  } else if (lowerWickRatio >= 0.60) {
    candleType = "LONG_LOWER_WICK";
  } else if (upperWickRatio >= 0.60) {
    candleType = "LONG_UPPER_WICK";
  } else if (bodyRatio <= 0.15) {
    candleType = "DOJI_LIKE";
  }

  return {
    bodyRatio,
    upperWickRatio,
    lowerWickRatio,
    candleType
  };
}

// --------------------------------------------------
// ROUNDING
// --------------------------------------------------

function round(value, digits = 2) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  return Number(value.toFixed(digits));
}

// --------------------------------------------------
// MAIN ANALYSIS
// --------------------------------------------------

export function analyzeMarket(input, options = {}) {
  try {
    const normalized = normalizeCandles(input, options);
    const candles = normalized.candles;

    const closes = candles.map(c => c.close);
    const latestIndex = candles.length - 1;
    const latest = candles[latestIndex];

    const ema9 = emaSeries(closes, 9);
    const ema20 = emaSeries(closes, 20);
    const ema21 = emaSeries(closes, 21);
    const ema50 = emaSeries(closes, 50);
    const ema200 = emaSeries(closes, 200);

    const rsi = rsiSeries(closes, 14);
    const macd = calculateMACD(closes);

    const tr = trueRangeSeries(candles);
    const atr = wilderAverageSeries(tr, 14);

    const dmi = calculateDMI(candles, 14);
    const bollinger = calculateBollinger(closes, 20, 2);

    const vwapInfo = calculateVWAP(candles);
    const volume = calculateVolumeInfo(candles, 20);
    const structure = calculateStructure(candles, 5);
    const candleQuality = calculateCandleQuality(latest);

    const i = latestIndex;

    const required = [
      ema9[i], ema20[i], ema21[i], ema50[i],
      ema200[i], rsi[i], macd.macd[i],
      macd.signal[i], macd.histogram[i],
      atr[i], dmi.adx[i], dmi.plusDI[i],
      dmi.minusDI[i], bollinger[i]
    ];

    if (required.some(
      value => value === null || value === undefined
    )) {
      throw new Error(
        "Some indicators need more historical warm-up candles."
      );
    }

    const close = latest.close;
    const vwap = vwapInfo.value;

    // ------------------------------------------------
    // HISTORICAL COMPONENT CLASSIFICATION
    // Not a probability or forecast.
    // ------------------------------------------------

    let score = 0;

    if (ema9[i] > ema21[i]) score++;
    else if (ema9[i] < ema21[i]) score--;

    if (ema21[i] > ema50[i]) score++;
    else if (ema21[i] < ema50[i]) score--;

    if (ema50[i] > ema200[i]) score++;
    else if (ema50[i] < ema200[i]) score--;

    if (close > ema20[i]) score++;
    else if (close < ema20[i]) score--;

    if (rsi[i] > 55) score++;
    else if (rsi[i] < 45) score--;

    if (macd.histogram[i] > 0) score++;
    else if (macd.histogram[i] < 0) score--;

    if (dmi.adx[i] >= 18) {
      if (dmi.plusDI[i] > dmi.minusDI[i]) score++;
      else if (dmi.minusDI[i] > dmi.plusDI[i]) score--;
    }

    if (vwap !== null) {
      if (close > vwap) score++;
      else if (close < vwap) score--;
    }

    let bias = "NEUTRAL";

    if (score >= 3) bias = "UPWARD_BIAS";
    if (score <= -3) bias = "DOWNWARD_BIAS";

    let trendState = "MIXED";

    if (
      ema9[i] > ema21[i] &&
      ema21[i] > ema50[i] &&
      ema50[i] > ema200[i]
    ) {
      trendState = "EMA_BULLISH_ALIGNMENT";
    } else if (
      ema9[i] < ema21[i] &&
      ema21[i] < ema50[i] &&
      ema50[i] < ema200[i]
    ) {
      trendState = "EMA_BEARISH_ALIGNMENT";
    }

    let momentumState = "MIXED";

    if (rsi[i] > 50 && macd.histogram[i] > 0) {
      momentumState = "POSITIVE_MOMENTUM";
    } else if (rsi[i] < 50 && macd.histogram[i] < 0) {
      momentumState = "NEGATIVE_MOMENTUM";
    }

    let strengthState = "WEAK_OR_UNCONFIRMED";

    if (dmi.adx[i] >= 25) {
      strengthState = "STRONGER_TREND_STRENGTH";
    } else if (dmi.adx[i] >= 18) {
      strengthState = "MODERATE_TREND_STRENGTH";
    }

    const bb = bollinger[i];

    const bbWidth =
      bb.middle !== 0
        ? ((bb.upper - bb.lower) / bb.middle) * 100
        : null;

    const sideways =
      dmi.adx[i] < 18 &&
      bbWidth !== null &&
      bbWidth < 1.5;

    const dataInfo = {
      candleCount: candles.length,
      maxCandlesAllowed: options.maxCandles ?? DEFAULT_MAX_CANDLES,

      timestampAvailable:
        candles.every(c => c.timestamp !== null),

      chronologicalOrderValidated:
        normalized.chronologicalOrderValidated,

      latestTradingSession: latest.timestamp !== null
        ? getIndiaTradingDate(latest.timestamp)
        : null,

      volumeAvailable: volume.available,

      vwapAvailable: vwapInfo.available,

      vwapSessionCandleCount: vwapInfo.candleCount,

      vwapSessionVolume: round(vwapInfo.volumeTotal),

      ema200Available: ema200[i] !== null,

      dataType: "Supplied historical OHLCV data",

      warmupWarning: candles.length < 300
        ? "Only 200–299 candles supplied. Longer history can improve EMA200 stability."
        : null
    };

    return {
      status: "OK",
      version: "11.1",
      timeframe: input?.timeframe || "15m",

      historicalClassification: {
        bias,
        score,
        scoreMeaning:
          "Descriptive component score only; not a probability.",
        trendState,
        momentumState,
        strengthState,

        sidewaysClassification: sideways
          ? "POSSIBLE_LOW_STRENGTH_RANGE"
          : "NOT_CLASSIFIED_AS_SIDEWAYS"
      },

      indicators: {
        close: round(close),

        ema9: round(ema9[i]),
        ema20: round(ema20[i]),
        ema21: round(ema21[i]),
        ema50: round(ema50[i]),
        ema200: round(ema200[i]),

        rsi14: round(rsi[i]),

        macd: {
          line: round(macd.macd[i], 4),
          signal: round(macd.signal[i], 4),
          histogram: round(macd.histogram[i], 4)
        },

        dmi: {
          plusDI: round(dmi.plusDI[i]),
          minusDI: round(dmi.minusDI[i]),
          adx: round(dmi.adx[i])
        },

        atr14: round(atr[i]),

        bollingerBands: {
          upper: round(bb.upper),
          middle: round(bb.middle),
          lower: round(bb.lower),
          widthPercent: round(bbWidth)
        },

        vwap: round(vwap),

        volume: {
          current: round(volume.current),
          average20: round(volume.average),
          relativeVolume: round(volume.relativeVolume, 3),
          available: volume.available,
          baselineCandles: volume.baselineCandles
        }
      },

      marketStructure: structure,
      latestCandleQuality: candleQuality,
      dataInfo,

      note: NOTE
    };

  } catch (error) {
    return {
      status: "ERROR",
      version: "11.1",
      error: error.message,
      note: NOTE
    };
  }
}
