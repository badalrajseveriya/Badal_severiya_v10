
import { parseHistoricalDataText } from "./historical-data-import.js";
import {
  calculateHistoricalPeriodStability
} from "./historical-candle-stability.js";
import {
  fetchHistoricalCandlePages
} from "./historical-candle-pagination.js";

// ======================================================
// BADAL SEVERIYA V12
// HISTORICAL PERIOD STABILITY UI
// Complete paginated historical data | 1D + 15M
// Retrospective comparison only
// ======================================================

const API_BASE =
  "https://badal-severiya-data.mrstarrdbs.workers.dev";

const MAX_CLOUD_CANDLES = 25000;
const API_PAGE_SIZE = 5000;

const TIMEFRAMES = {
  "1d": {
    container: "stability-results-1d",
    status: "stability-status-1d",
    input: "historical-file",
    storageKey: "badal-severiya-v12-historical-import-1d"
  },
  "15m": {
    container: "stability-results-15m",
    status: "stability-status-15m",
    input: "historical-file-15m",
    storageKey: "badal-severiya-v12-historical-import-15m"
  }
};

function getElement(id) {
  return document.getElementById(id);
}

function setStatus(timeframe, message, state = "") {
  const config = TIMEFRAMES[timeframe];
  const element = getElement(config.status);

  if (element) {
    element.textContent = message;
    if (state) element.dataset.state = state;
    else delete element.dataset.state;
  }
}

function clearResults(timeframe) {
  const config = TIMEFRAMES[timeframe];
  const container = getElement(config.container);

  if (container) {
    container.replaceChildren();
  }
}

function addText(parent, tag, text, className = "") {
  const element = document.createElement(tag);
  element.textContent = String(text);

  if (className) {
    element.className = className;
  }

  parent.appendChild(element);
  return element;
}

function formatDate(value) {
  if (value === undefined || value === null) {
    return "उपलब्ध नहीं";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

function renderPeriod(timeframe, result) {
  const config = TIMEFRAMES[timeframe];
  const container = getElement(config.container);

  if (!container) return;

  container.replaceChildren();

  if (result.status !== "OK") {
    setStatus(
      timeframe,
      `पर्याप्त डेटा नहीं है। उपलब्ध: ${result.sampleSize}, आवश्यक: ${result.requiredCandles}`,
      "error"
    );
    return;
  }

  const summary = document.createElement("section");
  summary.className = "stability-summary";

  addText(
    summary,
    "h4",
    "चारों अवधियों का अंतर"
  );

  const spread = result.percentageSpread;
  const spreadGrid = document.createElement("div");
  spreadGrid.className = "stability-spread-grid";

  const spreadItems = [
    {
      label: "बुलिश अंतर",
      value: spread.bullish,
      className: "stability-bullish"
    },
    {
      label: "बेयरिश अंतर",
      value: spread.bearish,
      className: "stability-bearish"
    },
    {
      label: "न्यूट्रल अंतर",
      value: spread.neutral,
      className: "stability-neutral"
    }
  ];

  for (const item of spreadItems) {
    const card = document.createElement("div");
    card.className = "stability-spread-item";

    addText(
      card,
      "span",
      `${item.value}%`,
      `stability-value ${item.className}`
    );

    addText(
      card,
      "span",
      item.label,
      "stability-label"
    );

    spreadGrid.appendChild(card);
  }

  summary.appendChild(spreadGrid);
  container.appendChild(summary);

  for (const period of result.segments) {
    const card = document.createElement("section");
    card.className = "stability-period-card";

    addText(
      card,
      "h4",
      `अवधि ${period.period}`
    );

    addText(
      card,
      "p",
      `डेटा: ${period.sampleSize} कैंडल्स | ${formatDate(period.startTime)} से ${formatDate(period.endTime)}`,
      "stability-date"
    );

    const percentages = period.percentages;
    const values = document.createElement("div");
    values.className = "stability-period-grid";

    const items = [
      {
        label: "बुलिश",
        value: percentages.bullish,
        count: period.counts.bullish,
        className: "stability-bullish"
      },
      {
        label: "बेयरिश",
        value: percentages.bearish,
        count: period.counts.bearish,
        className: "stability-bearish"
      },
      {
        label: "न्यूट्रल",
        value: percentages.neutral,
        count: period.counts.neutral,
        className: "stability-neutral"
      }
    ];

    for (const item of items) {
      const cell = document.createElement("div");
      cell.className = "stability-period-item";

      addText(
        cell,
        "span",
        `${item.value}%`,
        `stability-value ${item.className}`
      );

      addText(
        cell,
        "span",
        `${item.label} (${item.count})`,
        "stability-label"
      );

      values.appendChild(cell);
    }

    card.appendChild(values);
    container.appendChild(card);
  }

  setStatus(
    timeframe,
    `${result.segmentCount} ऐतिहासिक अवधियों की तुलना पूरी। कुल ${result.sampleSize} कैंडल्स। यह केवल पिछला डेटा है, भविष्य का अनुमान नहीं।`,
    "success"
  );
}

function parseCandles(candles, timeframe, filename) {
  const imported = parseHistoricalDataText(
    JSON.stringify(candles),
    filename,
    timeframe,
    { maxCandles: MAX_CLOUD_CANDLES }
  );

  if (imported.status !== "OK") {
    throw new Error(imported.error);
  }

  return imported.candles;
}

function analyze(timeframe, candles) {
  const result = calculateHistoricalPeriodStability(
    candles,
    {
      timeframe,
      segments: 4,
      minCandlesPerSegment: 20
    }
  );

  renderPeriod(timeframe, result);
  return result;
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

    analyze(timeframe, candles);
    return true;
  } catch (error) {
    console.warn(
      `${timeframe} stability saved-data error:`,
      error
    );

    return false;
  }
}

async function loadCloudflareData(timeframe) {
  const fetched = await fetchHistoricalCandlePages({
    apiBase: API_BASE,
    timeframe,
    index: "NIFTY",
    maxCandles: MAX_CLOUD_CANDLES,
    pageSize: API_PAGE_SIZE
  });

  if (!fetched || fetched.status !== "OK") {
    throw new Error(
      fetched?.error || "Cloudflare historical pagination failed."
    );
  }

  if (!Array.isArray(fetched.candles)) {
    throw new Error("API response में candle array सही नहीं है।");
  }

  if (fetched.candles.length === 0) {
    return false;
  }

  const candles = parseCandles(
    fetched.candles,
    timeframe,
    `cloudflare-${timeframe}.json`
  );

  analyze(timeframe, candles);

  const suffix = fetched.truncated
    ? " | अधिक पुराना डेटा 25,000 candle सीमा से आगे उपलब्ध है"
    : " | सभी उपलब्ध historical pages लोड हुए";

  setStatus(
    timeframe,
    `${fetched.pageCount} API pages से ${fetched.candleCount} candles की चार-अवधि जाँच पूरी। यह केवल पिछला डेटा है, भविष्य का अनुमान नहीं।${suffix}`,
    "success"
  );

  return true;
}

async function initializeTimeframe(timeframe) {
  clearResults(timeframe);

  setStatus(
    timeframe,
    "सभी उपलब्ध ऐतिहासिक API pages पढ़े जा रहे हैं..."
  );

  try {
    const loaded = await loadCloudflareData(timeframe);

    if (loaded) return;

    if (loadSavedData(timeframe)) return;

    setStatus(
      timeframe,
      timeframe === "15m"
        ? "15M डेटा उपलब्ध नहीं है — WAITING_FOR_DATA"
        : "ऐतिहासिक डेटा उपलब्ध नहीं है।"
    );
  } catch (error) {
    console.warn(
      `${timeframe} stability loading error:`,
      error
    );

    if (loadSavedData(timeframe)) return;

    setStatus(
      timeframe,
      timeframe === "15m"
        ? `15M डेटा उपलब्ध नहीं है — WAITING_FOR_DATA (${error.message})`
        : `ऐतिहासिक जाँच उपलब्ध नहीं: ${error.message}`,
      "error"
    );
  }
}

function setupFileImport(timeframe) {
  const config = TIMEFRAMES[timeframe];
  const input = getElement(config.input);

  if (!input) {
    console.warn(
      `Stability file input missing: ${timeframe}`
    );
    return;
  }

  input.addEventListener("change", async event => {
    const file = event.target.files?.[0];

    if (!file) return;

    setStatus(
      timeframe,
      "फाइल के पूरे ऐतिहासिक डेटा की जाँच हो रही है..."
    );

    try {
      const imported = parseHistoricalDataText(
        await file.text(),
        file.name,
        timeframe,
        { maxCandles: MAX_CLOUD_CANDLES }
      );

      if (imported.status !== "OK") {
        throw new Error(imported.error);
      }

      analyze(timeframe, imported.candles);
    } catch (error) {
      clearResults(timeframe);

      setStatus(
        timeframe,
        `ऐतिहासिक जाँच नहीं हो सकी: ${error.message}`,
        "error"
      );
    }
  });
}

for (const timeframe of ["1d", "15m"]) {
  setupFileImport(timeframe);
}

initializeTimeframe("1d");
initializeTimeframe("15m");
