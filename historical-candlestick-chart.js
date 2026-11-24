
// ======================================================
// BADAL SEVERIYA V12
// HISTORICAL DAILY CANDLESTICK CHART ENGINE
// Historical visualization only.
// No forecasts or trading recommendations.
// ======================================================

const DEFAULTS = {
  width: 1000,
  height: 420,
  padding: 28,
  maxVisibleCandles: 100
};

export function buildHistoricalCandlestickChart(candles, options = {}) {
  try {
    if (!Array.isArray(candles) || candles.length === 0) {
      throw new Error("Historical candles are missing.");
    }

    const config = { ...DEFAULTS, ...options };

    if (
      !Number.isFinite(config.width) ||
      config.width < 200 ||
      !Number.isFinite(config.height) ||
      config.height < 160 ||
      !Number.isInteger(config.maxVisibleCandles) ||
      config.maxVisibleCandles < 1
    ) {
      throw new Error("Invalid chart configuration.");
    }

    const normalized = candles.map((candle, index) => {
      const timestamp = Date.parse(
        candle.timestamp ?? candle.time ?? candle.date
      );

      const open = Number(candle.open);
      const high = Number(candle.high);
      const low = Number(candle.low);
      const close = Number(candle.close);

      if (
        !Number.isFinite(timestamp) ||
        ![open, high, low, close].every(Number.isFinite) ||
        open <= 0 ||
        high <= 0 ||
        low <= 0 ||
        close <= 0 ||
        high < Math.max(open, close, low) ||
        low > Math.min(open, close, high)
      ) {
        throw new Error(
          `Invalid OHLC candle at row ${index + 1}.`
        );
      }

      return {
        timestamp,
        date: new Date(timestamp).toISOString().slice(0, 10),
        open,
        high,
        low,
        close
      };
    });

    for (let i = 1; i < normalized.length; i++) {
      if (
        normalized[i].timestamp <=
        normalized[i - 1].timestamp
      ) {
        throw new Error(
          `Candles are not chronological at row ${i + 1}.`
        );
      }
    }

    const visible = normalized.slice(
      -config.maxVisibleCandles
    );

    const minPrice = Math.min(
      ...visible.map(c => c.low)
    );

    const maxPrice = Math.max(
      ...visible.map(c => c.high)
    );

    const range =
      maxPrice - minPrice ||
      Math.max(maxPrice * 0.01, 1);

    const plotTop = config.padding;
    const plotBottom =
      config.height - config.padding;

    const plotHeight = plotBottom - plotTop;
    const plotWidth =
      config.width - config.padding * 2;

    const slotWidth = plotWidth / visible.length;

    const bodyWidth = Math.max(
      2,
      Math.min(12, slotWidth * 0.58)
    );

    const y = price =>
      plotBottom -
      ((price - minPrice) / range) * plotHeight;

    const bars = visible.map((candle, index) => {
      const centerX =
        config.padding +
        slotWidth * (index + 0.5);

      const bodyTop = y(
        Math.max(candle.open, candle.close)
      );

      const bodyBottom = y(
        Math.min(candle.open, candle.close)
      );

      return {
        ...candle,
        x: centerX,
        wickTop: y(candle.high),
        wickBottom: y(candle.low),
        bodyX: centerX - bodyWidth / 2,
        bodyY: bodyTop,
        bodyWidth,
        bodyHeight: Math.max(
          1.5,
          bodyBottom - bodyTop
        ),
        direction:
          candle.close > candle.open
            ? "BULLISH_CANDLE"
            : candle.close < candle.open
              ? "BEARISH_CANDLE"
              : "NEUTRAL_CANDLE"
      };
    });

    return {
      status: "OK",
      module: "HISTORICAL_DAILY_CANDLE_CHART",
      dataType: "HISTORICAL_ONLY",
      timeframe: "1d",
      totalCandles: normalized.length,
      visibleCandles: bars.length,
      width: config.width,
      height: config.height,
      padding: config.padding,
      priceRange: {
        low: minPrice,
        high: maxPrice
      },
      firstVisibleDate: bars[0].date,
      lastVisibleDate: bars[bars.length - 1].date,
      bars,
      note:
        "Historical OHLC visualization only. " +
        "No future price prediction or trading recommendation."
    };

  } catch (error) {
    return {
      status: "ERROR",
      module: "HISTORICAL_DAILY_CANDLE_CHART",
      dataType: "HISTORICAL_ONLY",
      error: error.message
    };
  }
}
