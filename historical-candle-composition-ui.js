
import { parseHistoricalDataText } from "./historical-data-import.js";
import {
  calculateHistoricalCandleComposition
} from "./historical-candle-composition.js";

const API_BASE =
  "https://badal-severiya-data.mrstarrdbs.workers.dev";

const TIMEFRAMES = {
  "1d": {
    up: "up-percent-1d",
    down: "down-percent-1d",
    neutral: "unclear-percent-1d",
    status: "summary-status-1d",
    input: "historical-file",
    storageKey: "badal-severiya-v12-historical-import-1d"
  },
  "15m": {
    up: "up-percent-15m",
    down: "down-percent-15m",
    neutral: "unclear-percent-15m",
    status: "summary-status-15m",
    input: "historical-file-15m",
    storageKey: "badal-severiya-v12-historical-import-15m"
  }
};

function getElement(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = getElement(id);
  if (element) element.textContent = value;
}

function resetSummary(timeframe, message) {
  const config = TIMEFRAMES[timeframe];

  setText(config.up, "--%");
  setText(config.down, "--%");
  setText(config.neutral, "--%");
  setText(config.status, message);
}

function showComposition(timeframe, candles) {
  const config = TIMEFRAMES[timeframe];

  const result = calculateHistoricalCandleComposition(
    candles,
    { timeframe }
  );

  if (result.status !== "OK") {
    throw new Error("ऐतिहासिक कैंडल अनुपात की गणना नहीं हो सकी।");
  }

  setText(
    config.up,
    `${result.percentages.bullish}%`
  );

  setText(
    config.down,
    `${result.percentages.bearish}%`
  );

  setText(
    config.neutral,
    `${result.percentages.neutral}%`
  );

  setText(
    config.status,
    `पिछली ${result.sampleSize} कैंडल्स का ऐतिहासिक अनुपात। ` +
    `बुलिश: ${result.counts.bullish}, ` +
    `बेयरिश: ${result.counts.bearish}, ` +
    `न्यूट्रल: ${result.counts.neutral}। ` +
    `यह भविष्य का अनुमान नहीं है।`
  );

  return result;
}

function parseCandles(candles, timeframe, filename) {
  const imported = parseHistoricalDataText(
    JSON.stringify(candles),
    filename,
    timeframe
  );

  if (imported.status !== "OK") {
    throw new Error(imported.error);
  }

  return imported.candles;
}

function loadSavedData(timeframe) {
  const config = TIMEFRAMES[timeframe];

  try {
    const savedText = localStorage.getItem(
      config.storageKey
    );

    if (!savedText) return false;

    const saved = JSON.parse(savedText);

    if (
      !saved ||
      !Array.isArray(saved.candles) ||
      saved.timeframe !== timeframe
    ) {
      return false;
    }

    const candles = parseCandles(
      saved.candles,
      timeframe,
      "saved-historical-data.json"
    );

    showComposition(timeframe, candles);
    return true;
  } catch (error) {
    console.warn(
      `${timeframe} saved composition data error:`,
      error
    );

    return false;
  }
}

async function loadCloudflareData(timeframe) {
  const url =
    `${API_BASE}/api/data/candles` +
    `?index=NIFTY&timeframe=${timeframe}&limit=5000`;

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const result = await response.json();

  if (
    !result ||
    result.app !== "BADAL SEVERIYA DATA V11" ||
    !Array.isArray(result.candles)
  ) {
    throw new Error("API response सही नहीं है।");
  }

  if (result.candles.length === 0) {
    return false;
  }

  const candles = parseCandles(
    result.candles,
    timeframe,
    `cloudflare-${timeframe}.json`
  );

  showComposition(timeframe, candles);
  return true;
}

async function initializeTimeframe(timeframe) {
  resetSummary(
    timeframe,
    "ऐतिहासिक डेटा की प्रतीक्षा है।"
  );

  try {
    const loaded = await loadCloudflareData(timeframe);

    if (loaded) return;

    if (loadSavedData(timeframe)) return;

    resetSummary(
      timeframe,
      timeframe === "15m"
        ? "15M डेटा उपलब्ध नहीं है — WAITING_FOR_DATA"
        : "पर्याप्त ऐतिहासिक कैंडल डेटा उपलब्ध नहीं है।"
    );
  } catch (error) {
    console.warn(
      `${timeframe} composition loading error:`,
      error
    );

    if (loadSavedData(timeframe)) return;

    resetSummary(
      timeframe,
      timeframe === "15m"
        ? "15M डेटा उपलब्ध नहीं है — WAITING_FOR_DATA"
        : `ऐतिहासिक गणना उपलब्ध नहीं: ${error.message}`
    );
  }
}

function setupFileImport(timeframe) {
  const config = TIMEFRAMES[timeframe];
  const input = getElement(config.input);

  if (!input) {
    console.warn(
      `File input missing for ${timeframe}`
    );
    return;
  }

  input.addEventListener("change", async event => {
    const file = event.target.files?.[0];

    if (!file) return;

    setText(
      config.status,
      "फाइल से ऐतिहासिक कैंडल्स की गणना हो रही है..."
    );

    try {
      const imported = parseHistoricalDataText(
        await file.text(),
        file.name,
        timeframe
      );

      if (imported.status !== "OK") {
        throw new Error(imported.error);
      }

      showComposition(
        timeframe,
        imported.candles
      );
    } catch (error) {
      resetSummary(
        timeframe,
        `गणना नहीं हो सकी: ${error.message}`
      );
    }
  });
}

for (const timeframe of ["1d", "15m"]) {
  setupFileImport(timeframe);
}

initializeTimeframe("1d");
initializeTimeframe("15m");
