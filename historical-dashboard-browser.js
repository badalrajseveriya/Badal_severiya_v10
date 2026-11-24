
// ======================================================
// BADAL SEVERIYA V12
// HISTORICAL DASHBOARD BROWSER
// DAILY DATA ONLY
// Educational historical analysis only
// ======================================================

import {
  parseHistoricalDataText
} from "./historical-data-import.js";

import {
  generateHistoricalReport
} from "./historical-analysis-report.js";

import {
  formatHistoricalDashboardData
} from "./dashboard-data.js";

import {
  createHistoricalDashboardDisplay
} from "./dashboard-display.js";

import {
  createHistoricalDashboardUIModel
} from "./dashboard-ui-model.js";

import {
  renderHistoricalDashboard
} from "./dashboard-renderer.js";

import {
  buildHistoricalCandlestickChart
} from "./historical-candlestick-chart.js";

// ------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------

const API_BASE =
  "https://badal-severiya-data.mrstarrdbs.workers.dev";

const STORAGE_KEY =
  "badal-severiya-v12-historical-import-1d";

const SELECTED_TIMEFRAME = "1d";

// ------------------------------------------------------
// HTML ELEMENTS
// ------------------------------------------------------

const fileInput =
  document.getElementById("historical-file");

const statusBox =
  document.getElementById("import-status");

const dashboard =
  document.getElementById("analysis-results");

// ------------------------------------------------------
// STATUS
// ------------------------------------------------------

function showStatus(message, isError = false) {
  if (!statusBox) return;

  statusBox.textContent = message;

  statusBox.dataset.state =
    isError ? "error" : "success";
}

// ------------------------------------------------------
// TIMEFRAME DISPLAY
// 15M IS TEMPORARILY DISABLED
// ------------------------------------------------------

function createTimeframeSelector() {
  if (!fileInput || !fileInput.parentNode) return;

  if (document.getElementById("historical-timeframe")) {
    return;
  }

  const wrapper = document.createElement("div");

  wrapper.id = "historical-timeframe";
  wrapper.textContent =
    "Historical Timeframe: 1D - Daily Historical Data";

  wrapper.style.margin = "12px 0";
  wrapper.style.padding = "12px";
  wrapper.style.borderRadius = "8px";
  wrapper.style.background = "#172033";
  wrapper.style.color = "#ffffff";
  wrapper.style.fontWeight = "bold";
  wrapper.style.fontSize = "14px";

  fileInput.parentNode.insertBefore(
    wrapper,
    fileInput
  );
}

// ------------------------------------------------------
// TEXT HELPER
// ------------------------------------------------------

function addText(parent, label, value) {
  const line = document.createElement("p");

  line.textContent =
    `${label}: ${
      typeof value === "object"
        ? JSON.stringify(value)
        : String(value ?? "N/A")
    }`;

  parent.appendChild(line);
}

// ------------------------------------------------------
// SVG HELPER
// ------------------------------------------------------

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS(
    "http://www.w3.org/2000/svg",
    name
  );

  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }

  return element;
}

// ------------------------------------------------------
// HISTORICAL DAILY CANDLESTICK CHART
// ------------------------------------------------------

function renderHistoricalCandlestickChart(candles) {
  const model = buildHistoricalCandlestickChart(
    candles,
    {
      width: 1000,
      height: 420,
      padding: 55,
      maxVisibleCandles: 100
    }
  );

  if (model.status !== "OK") {
    throw new Error(
      model.error || "Historical chart generation failed."
    );
  }

  const section = document.createElement("section");

  section.className = "historical-candlestick-panel";
  section.style.margin = "16px 0";
  section.style.padding = "14px";
  section.style.background = "#0f172a";
  section.style.border = "1px solid #334155";
  section.style.borderRadius = "12px";
  section.style.color = "#ffffff";
  section.style.overflow = "hidden";
  section.style.minWidth = "0";

  const heading = document.createElement("h2");

  heading.textContent =
    "NIFTY 50 - Daily Historical Candlestick Chart";

  heading.style.fontSize = "18px";
  heading.style.margin = "0 0 8px";

  section.appendChild(heading);

  const description = document.createElement("p");

  description.textContent =
    `${model.totalCandles} total candles | ` +
    `${model.visibleCandles} displayed | ` +
    `${model.firstVisibleDate} to ${model.lastVisibleDate}`;

  description.style.fontSize = "12px";
  description.style.color = "#cbd5e1";
  description.style.margin = "0 0 12px";

  section.appendChild(description);

  const svg = createSvgElement("svg", {
    viewBox: `0 0 ${model.width} ${model.height}`,
    role: "img",
    "aria-label": "NIFTY 50 historical daily candlestick chart",
    preserveAspectRatio: "xMidYMid meet"
  });

  svg.style.display = "block";
  svg.style.width = "100%";
  svg.style.height = "auto";
  svg.style.background = "#111827";
  svg.style.borderRadius = "8px";

  const left = model.padding;
  const right = model.width - model.padding;
  const top = model.padding;
  const bottom = model.height - model.padding;

  const priceRange =
    model.priceRange.high - model.priceRange.low;

  // Horizontal price grid.
  for (let i = 0; i <= 4; i++) {
    const ratio = i / 4;

    const y =
      top + (bottom - top) * ratio;

    const price =
      model.priceRange.high - priceRange * ratio;

    const gridLine = createSvgElement("line", {
      x1: left,
      y1: y,
      x2: right,
      y2: y,
      stroke: "#334155",
      "stroke-width": 1,
      "stroke-dasharray": "4 5"
    });

    svg.appendChild(gridLine);

    const priceLabel = createSvgElement("text", {
      x: 5,
      y: y + 4,
      fill: "#cbd5e1",
      "font-size": 13
    });

    priceLabel.textContent =
      price.toLocaleString("en-IN", {
        maximumFractionDigits: 2
      });

    svg.appendChild(priceLabel);
  }

  // Daily candle wicks and bodies.
  for (const bar of model.bars) {
    const bullish =
      bar.direction === "BULLISH_CANDLE";

    const bearish =
      bar.direction === "BEARISH_CANDLE";

    const candleColor = bullish
      ? "#22c55e"
      : bearish
        ? "#ef4444"
        : "#94a3b8";

    const wick = createSvgElement("line", {
      x1: bar.x,
      y1: bar.wickTop,
      x2: bar.x,
      y2: bar.wickBottom,
      stroke: candleColor,
      "stroke-width": 2
    });

    svg.appendChild(wick);

    const body = createSvgElement("rect", {
      x: bar.bodyX,
      y: bar.bodyY,
      width: bar.bodyWidth,
      height: bar.bodyHeight,
      fill: candleColor,
      stroke: candleColor,
      "stroke-width": 1,
      rx: 1
    });

    svg.appendChild(body);
  }

  // Date labels: first, middle and last dates.
  const labelIndexes = [
    0,
    Math.floor((model.bars.length - 1) / 2),
    model.bars.length - 1
  ];

  const uniqueIndexes = [...new Set(labelIndexes)];

  for (const index of uniqueIndexes) {
    const bar = model.bars[index];

    const dateLabel = createSvgElement("text", {
      x: bar.x,
      y: model.height - 12,
      fill: "#cbd5e1",
      "font-size": 12,
      "text-anchor": "middle"
    });

    dateLabel.textContent = bar.date;

    svg.appendChild(dateLabel);
  }

  section.appendChild(svg);

  const legend = document.createElement("p");

  legend.textContent =
    "हरा = Close, Open से ऊपर | लाल = Close, Open से नीचे";

  legend.style.fontSize = "12px";
  legend.style.color = "#cbd5e1";
  legend.style.margin = "10px 0 0";

  section.appendChild(legend);

  const note = document.createElement("p");

  note.textContent =
    "यह केवल पुराने ऐतिहासिक डेटा का चार्ट है। " +
    "यह भविष्य की कीमत या ट्रेडिंग सलाह नहीं देता।";

  note.style.fontSize = "12px";
  note.style.color = "#94a3b8";
  note.style.margin = "8px 0 0";

  section.appendChild(note);

  return section;
}

// ------------------------------------------------------
// DASHBOARD CARDS
// ------------------------------------------------------

function renderCards(rendered, uiModel, chartPanel) {
  dashboard.replaceChildren();

  if (rendered.status !== "OK") {
    throw new Error(
      rendered.error ||
      "Dashboard rendering failed."
    );
  }

  const heading = document.createElement("h2");

  heading.textContent = rendered.screen.header.title;

  dashboard.appendChild(heading);

  const metadata = document.createElement("p");

  metadata.textContent =
    `Timeframe: ${rendered.screen.metadata.timeframe} | ` +
    `Candles: ${rendered.screen.metadata.candleCount}`;

  dashboard.appendChild(metadata);

  // Chart appears before analysis cards.
  if (chartPanel) {
    dashboard.appendChild(chartPanel);
  }

  for (const card of uiModel.layout.cards) {
    const section = document.createElement("details");

    section.className = "card";
    section.open = card.defaultExpanded === true;

    const summary = document.createElement("summary");

    summary.textContent =
      `${String(card.order).padStart(2, "0")}. ${card.title}`;

    summary.style.cursor = "pointer";
    summary.style.fontWeight = "bold";
    summary.style.fontSize = "16px";
    summary.style.color = "#7dd3fc";
    summary.style.padding = "4px 0";
    summary.style.listStylePosition = "inside";

    section.appendChild(summary);

    const content = document.createElement("div");

    content.style.paddingTop = "10px";

    if (card.id === "data-quality") {
      const quality = card.content.status ?? "UNKNOWN";
      const details = card.content.details ?? {};

      const issueCount =
        Number.isFinite(details.issueCount)
          ? details.issueCount
          : 0;

      const statusLine = document.createElement("p");

      statusLine.textContent =
        `Status: ${quality} | Issues: ${issueCount}`;

      statusLine.style.fontWeight = "bold";
      statusLine.style.fontSize = "16px";

      statusLine.style.color =
        quality === "VALID" && issueCount === 0
          ? "#86efac"
          : "#fca5a5";

      content.appendChild(statusLine);

      const checksTitle = document.createElement("p");

      checksTitle.textContent = "Validation Checks";
      checksTitle.style.fontWeight = "bold";

      content.appendChild(checksTitle);

      const checks = details.checks ?? {};

      for (const [name, result] of Object.entries(checks)) {
        const line = document.createElement("p");

        line.textContent =
          `${name}: ${
            typeof result === "object"
              ? JSON.stringify(result)
              : String(result ?? "N/A")
          }`;

        content.appendChild(line);
      }

      if (Object.keys(checks).length === 0) {
        const line = document.createElement("p");

        line.textContent =
          "No individual check details available.";

        content.appendChild(line);
      }

    } else {
      for (const [key, value] of Object.entries(card.content)) {
        if (key === "id" || key === "title") continue;

        addText(content, key, value);
      }
    }

    section.appendChild(content);
    dashboard.appendChild(section);
  }
}

// ------------------------------------------------------
// BUILD HISTORICAL DASHBOARD
// ------------------------------------------------------

function buildDashboard(candles) {
  const report = generateHistoricalReport({
    candles,
    timeframe: SELECTED_TIMEFRAME
  });

  if (report.status !== "OK") {
    throw new Error(report.error);
  }

  const dashboardData =
    formatHistoricalDashboardData(report);

  if (dashboardData.status !== "OK") {
    throw new Error(dashboardData.error);
  }

  const display =
    createHistoricalDashboardDisplay(dashboardData);

  if (display.status !== "OK") {
    throw new Error(display.error);
  }

  const uiModel =
    createHistoricalDashboardUIModel(display);

  if (uiModel.status !== "OK") {
    throw new Error(uiModel.error);
  }

  const rendered =
    renderHistoricalDashboard(uiModel);

  if (rendered.status !== "OK") {
    throw new Error(rendered.error);
  }

  // Chart failure should not destroy analysis cards.
  let chartPanel = null;

  try {
    chartPanel =
      renderHistoricalCandlestickChart(candles);
  } catch (chartError) {
    console.error("Historical chart error:", chartError);

    chartPanel = document.createElement("section");
    chartPanel.style.padding = "12px";
    chartPanel.style.margin = "12px 0";
    chartPanel.style.background = "#292313";
    chartPanel.style.borderRadius = "8px";

    const errorText = document.createElement("p");

    errorText.textContent =
      `Historical chart could not be displayed: ${chartError.message}`;

    chartPanel.appendChild(errorText);
  }

  renderCards(
    rendered,
    uiModel,
    chartPanel
  );

  // Volume diagnostic.
  const directMissingVolumes = candles.filter(item =>
    item?.volume === null ||
    item?.volume === undefined ||
    item?.volume === ""
  ).length;

  const qualityMissingVolumes =
    report.sections?.dataQuality?.checks?.missingVolumes;

  const diagnostic = document.createElement("p");

  diagnostic.textContent =
    `Diagnostic: input missing volume = ${directMissingVolumes} | ` +
    `quality engine missing volume = ${String(qualityMissingVolumes ?? "N/A")} | ` +
    `candles = ${candles.length}`;

  diagnostic.style.fontSize = "13px";
  diagnostic.style.opacity = "0.85";

  diagnostic.dataset.diagnostic = "volume-check";

  dashboard.appendChild(diagnostic);

  console.info("BADAL V12 historical diagnostic", {
    timeframe: SELECTED_TIMEFRAME,
    candleCount: candles.length,
    directMissingVolumes,
    qualityMissingVolumes
  });
}

// ------------------------------------------------------
// SAVE DATA
// ------------------------------------------------------

function saveHistoricalData(candles, filename) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        filename,
        timeframe: SELECTED_TIMEFRAME,
        candles,
        savedAt: new Date().toISOString()
      })
    );

    return true;

  } catch (error) {
    console.warn("Local storage unavailable:", error);
    return false;
  }
}

// ------------------------------------------------------
// RESTORE MOBILE DATA
// ------------------------------------------------------

function restoreSavedData() {
  try {
    const savedText =
      localStorage.getItem(STORAGE_KEY);

    if (!savedText) return false;

    const savedData = JSON.parse(savedText);

    if (
      !savedData ||
      !Array.isArray(savedData.candles) ||
      savedData.timeframe !== SELECTED_TIMEFRAME
    ) {
      throw new Error("Saved Daily data is invalid.");
    }

    const imported = parseHistoricalDataText(
      JSON.stringify(savedData.candles),
      "saved-historical-data.json",
      SELECTED_TIMEFRAME
    );

    if (imported.status !== "OK") {
      throw new Error(imported.error);
    }

    buildDashboard(imported.candles);

    showStatus(
      `मोबाइल का सेव डेटा लोड हुआ: 1D | ${imported.candleCount} candles`
    );

    return true;

  } catch (error) {
    showStatus(
      `मोबाइल डेटा लोड नहीं हुआ: ${error.message}`,
      true
    );

    return false;
  }
}

// ------------------------------------------------------
// LOAD DATA FROM CLOUDFLARE
// ------------------------------------------------------

async function loadFromCloudflare() {
  showStatus(
    "Cloudflare से 1D ऐतिहासिक डेटा लोड हो रहा है..."
  );

  const url =
    `${API_BASE}/api/data/candles` +
    `?index=NIFTY` +
    `&timeframe=1d` +
    `&limit=5000`;

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(
      `Cloudflare API error: HTTP ${response.status}`
    );
  }

  const result = await response.json();

  if (
    !result ||
    result.app !== "BADAL SEVERIYA DATA V11" ||
    !Array.isArray(result.candles)
  ) {
    throw new Error(
      "API response का फॉर्मेट सही नहीं है।"
    );
  }

  const imported = parseHistoricalDataText(
    JSON.stringify(result.candles),
    "cloudflare-nifty-1d.json",
    SELECTED_TIMEFRAME
  );

  if (imported.status !== "OK") {
    throw new Error(imported.error);
  }

  buildDashboard(imported.candles);

  saveHistoricalData(
    imported.candles,
    "Cloudflare NIFTY 1D historical data"
  );

  showStatus(
    `सफलता: Cloudflare से 1D की ${imported.candleCount} ऐतिहासिक candles लोड हुईं।`
  );

  return true;
}

// ------------------------------------------------------
// LOAD DAILY DATA
// ------------------------------------------------------

async function loadDailyData() {
  try {
    await loadFromCloudflare();

  } catch (error) {
    console.error("Cloudflare Daily loading failed:", error);

    const restored = restoreSavedData();

    if (restored) {
      showStatus(
        "Cloudflare उपलब्ध नहीं हुआ। मोबाइल में सेव 1D डेटा दिखाया गया।"
      );

      return;
    }

    showStatus(
      `1D डेटा लोड नहीं हुआ। कारण: ${error.message}`,
      true
    );
  }
}

// ------------------------------------------------------
// IMPORT CSV / JSON FILE
// ------------------------------------------------------

async function importHistoricalFile(file) {
  if (!file) return;

  showStatus("1D ऐतिहासिक फाइल पढ़ी जा रही है...");

  try {
    const fileText = await file.text();

    const imported = parseHistoricalDataText(
      fileText,
      file.name,
      SELECTED_TIMEFRAME
    );

    if (imported.status !== "OK") {
      throw new Error(imported.error);
    }

    buildDashboard(imported.candles);

    const saved = saveHistoricalData(
      imported.candles,
      file.name
    );

    showStatus(
      `सफलता: ${imported.candleCount} Daily candles इम्पोर्ट हुईं। Mobile save: ${saved ? "OK" : "Unavailable"}`
    );

  } catch (error) {
    showStatus(
      `Import error: ${error.message}`,
      true
    );
  }
}

// ------------------------------------------------------
// INITIALIZE
// ------------------------------------------------------

if (fileInput && statusBox && dashboard) {
  createTimeframeSelector();

  fileInput.addEventListener("change", event => {
    const file = event.target.files?.[0];

    importHistoricalFile(file);
  });

  loadDailyData();

} else {
  console.error(
    "Historical dashboard HTML elements are missing."
  );
}
