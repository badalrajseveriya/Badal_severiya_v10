
function convertAngelOneCandles(
  response,
  index = "NIFTY",
  timeframe = "15m"
) {
  if (!response || response.status !== true) {
    throw new Error("Angel One response is not successful");
  }

  if (!Array.isArray(response.data) || response.data.length === 0) {
    throw new Error("Historical candle data is missing");
  }

  const candles = response.data.map((row, i) => {
    if (!Array.isArray(row) || row.length < 6) {
      throw new Error(`Invalid candle row: ${i}`);
    }

    const [timestamp, open, high, low, close, volume] = row;

    const parsedTime = Date.parse(timestamp);

    const candle = {
      time: new Date(parsedTime).toISOString(),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume)
    };

    const values = [
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume
    ];

    if (
      !Number.isFinite(parsedTime) ||
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

  candles.sort(
    (a, b) => Date.parse(a.time) - Date.parse(b.time)
  );

  for (let i = 1; i < candles.length; i++) {
    if (candles[i].time === candles[i - 1].time) {
      throw new Error(`Duplicate candle timestamp: ${candles[i].time}`);
    }
  }

  return {
    index,
    timeframe,
    source: "ANGEL_ONE_SMARTAPI",
    dataType: "REAL_HISTORICAL",
    candles
  };
}
