
function convertAngelOneCandles(response, index = "NIFTY", timeframe = "15m") {
  if (!response || response.status !== true) {
    throw new Error("Angel One response is not successful");
  }

  if (!Array.isArray(response.data)) {
    throw new Error("Historical candle data is missing");
  }

  const candles = response.data.map((row, i) => {
    if (!Array.isArray(row) || row.length < 6) {
      throw new Error(`Invalid candle row: ${i}`);
    }

    const [timestamp, open, high, low, close, volume] = row;

    const candle = {
      time: new Date(timestamp).toISOString(),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume)
    };

    const values = [
      candle.open, candle.high, candle.low,
      candle.close, candle.volume
    ];

    if (
      !Number.isFinite(Date.parse(candle.time)) ||
      !values.every(Number.isFinite) ||
      candle.open <= 0 ||
      candle.high <= 0 ||
      candle.low <= 0 ||
      candle.close <= 0 ||
      candle.volume < 0 ||
      candle.high < Math.max(candle.open, candle.close, candle.low) ||
      candle.low > Math.min(candle.open, candle.close, candle.high)
    ) {
      throw new Error(`Invalid OHLCV data at row ${i}`);
    }

    return candle;
  });

  return {
    index,
    timeframe,
    candles
  };
}
