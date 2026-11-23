
// ======================================================
// BADAL SEVERIYA V12
// HISTORICAL CSV / JSON DATA IMPORTER
// Offline historical educational analysis only
// ======================================================

const MIN_CANDLES = 200;
const MAX_CANDLES = 5000;

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim());
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error("CSV quoted field is incomplete.");

  row.push(field.trim());
  if (row.some(value => value !== "")) rows.push(row);

  return rows;
}

function headerKey(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getTimestamp(value, rowNumber) {
  if (value === null || value === undefined || value === "") {
    throw new Error(`Timestamp missing at row ${rowNumber}.`);
  }

  const numeric = Number(value);
  const milliseconds =
    Number.isFinite(numeric) && /^\d+$/.test(String(value).trim())
      ? (numeric < 1e12 ? numeric * 1000 : numeric)
      : Date.parse(String(value));

  if (!Number.isFinite(milliseconds)) {
    throw new Error(`Invalid timestamp at row ${rowNumber}.`);
  }

  return new Date(milliseconds).toISOString();
}

function normalizeCandle(item, rowNumber) {
  let timestamp;
  let open;
  let high;
  let low;
  let close;
  let volume;

  if (Array.isArray(item)) {
    [timestamp, open, high, low, close, volume] = item;
  } else if (item && typeof item === "object") {
    const values = new Map(
      Object.entries(item).map(([key, value]) => [
        headerKey(key),
        value
      ])
    );

    const get = (...keys) => {
      for (const key of keys) {
        if (values.has(key)) return values.get(key);
      }
      return undefined;
    };

    timestamp = get("timestamp", "time", "date", "datetime", "tradedate");
    open = get("open", "into");
    high = get("high", "inth");
    low = get("low", "intl");
    close = get("close", "intc");
    volume = get("volume", "vol", "intv");
  } else {
    throw new Error(`Invalid candle at row ${rowNumber}.`);
  }

  const candle = {
    timestamp: getTimestamp(timestamp, rowNumber),
    open: Number(open),
    high: Number(high),
    low: Number(low),
    close: Number(close),
    volume: volume === undefined || volume === null || volume === ""
      ? 0
      : Number(volume)
  };

  if (
    ![
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume
    ].every(Number.isFinite)
  ) {
    throw new Error(`Invalid numeric value at row ${rowNumber}.`);
  }

  if (
    candle.open <= 0 ||
    candle.high <= 0 ||
    candle.low <= 0 ||
    candle.close <= 0 ||
    candle.volume < 0 ||
    candle.high < Math.max(candle.open, candle.close, candle.low) ||
    candle.low > Math.min(candle.open, candle.close, candle.high)
  ) {
    throw new Error(`Invalid OHLCV values at row ${rowNumber}.`);
  }

  return candle;
}

function readCSV(text) {
  const rows = parseCSV(text);

  if (rows.length < 2) {
    throw new Error("CSV needs a header and candle rows.");
  }

  const headers = rows[0].map(headerKey);

  const aliases = {
    timestamp: ["timestamp", "time", "date", "datetime", "tradedate"],
    open: ["open", "into"],
    high: ["high", "inth"],
    low: ["low", "intl"],
    close: ["close", "intc"],
    volume: ["volume", "vol", "intv"]
  };

  const indexes = {};

  for (const [field, names] of Object.entries(aliases)) {
    indexes[field] = headers.findIndex(name => names.includes(name));

    if (indexes[field] < 0 && field !== "volume") {
      throw new Error(`CSV is missing the ${field} column.`);
    }
  }

  return rows.slice(1).map((values, index) => {
    const item = {};

    for (const field of Object.keys(indexes)) {
      const column = indexes[field];
      item[field] = column < 0 ? 0 : values[column];
    }

    return normalizeCandle(item, index + 2);
  });
}

function readJSON(text) {
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON file.");
  }

  const source = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.candles)
      ? parsed.candles
      : Array.isArray(parsed?.data)
        ? parsed.data
        : null;

  if (!source) {
    throw new Error("JSON needs an array or candles/data array.");
  }

  return source.map((item, index) =>
    normalizeCandle(item, index + 1)
  );
}

export function parseHistoricalDataText(
  text,
  filename = "historical.csv",
  timeframe = "15m"
) {
  try {
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Selected file is empty.");
    }

    const isJSON =
      String(filename).toLowerCase().endsWith(".json") ||
      /^[\s]*[\[{]/.test(text);

    const candles = isJSON
      ? readJSON(text)
      : readCSV(text);

    if (candles.length < MIN_CANDLES) {
      throw new Error(
        `At least ${MIN_CANDLES} candles required. Found ${candles.length}.`
      );
    }

    if (candles.length > MAX_CANDLES) {
      throw new Error(
        `Maximum ${MAX_CANDLES} candles allowed.`
      );
    }

    for (let i = 1; i < candles.length; i++) {
      if (
        Date.parse(candles[i].timestamp) <=
        Date.parse(candles[i - 1].timestamp)
      ) {
        throw new Error(
          `Candles are not chronological at row ${i + 1}.`
        );
      }
    }

    return {
      status: "OK",
      dataType: "HISTORICAL_ONLY",
      timeframe,
      candleCount: candles.length,
      candles,
      note: "Offline historical educational data only."
    };
  } catch (error) {
    return {
      status: "ERROR",
      dataType: "HISTORICAL_ONLY",
      error: error.message,
      note: "Offline historical educational data only."
    };
  }
}
