// ======================================================
// BADAL SEVERIYA V12
// DUAL TIMEFRAME HISTORICAL DASHBOARD
// 1D + 15M | Educational historical analysis only
// ======================================================

import { parseHistoricalDataText } from "./historical-data-import.js";
import { generateHistoricalReport } from "./historical-analysis-report.js";
import { formatHistoricalDashboardData } from "./dashboard-data.js";
import { createHistoricalDashboardDisplay } from "./dashboard-display.js";
import { createHistoricalDashboardUIModel } from "./dashboard-ui-model.js";
import { renderHistoricalDashboard } from "./dashboard-renderer.js";
import { buildHistoricalCandlestickChart } from "./historical-candlestick-chart.js";
import { compareHistoricalTimeframes } from "./timeframe-comparison.js";
import { fetchHistoricalCandlePages } from "./historical-candle-pagination.js";

const API_BASE = "https://badal-severiya-data.mrstarrdbs.workers.dev";
const MAX_DASHBOARD_CANDLES = 25000;

const CONFIG = {
  "1d": {
    fileInput: document.getElementById("historical-file"),
    status: document.getElementById("import-status"),
    dashboard: document.getElementById("analysis-results"),
    storageKey: "badal-severiya-v12-historical-import-1d"
  },
  "15m": {
    fileInput: document.getElementById("historical-file-15m"),
    status: document.getElementById("import-status-15m"),
    dashboard: document.getElementById("analysis-results-15m"),
    storageKey: "badal-severiya-v12-historical-import-15m"
  }
};

const state = {
  "1d": {
    status: "LOADING",
    candleCount: 0,
    report: null,
    truncated: false
  },
  "15m": {
    status: "WAITING_FOR_DATA",
    candleCount: 0,
    report: null,
    truncated: false
  }
};

function showStatus(timeframe, message, isError = false) {
  const target = CONFIG[timeframe]?.status;
  if (!target) return;

  target.textContent = message;
  target.dataset.state = isError ? "error" : "success";
}

// ------------------------------------------------------
// COMBINED HISTORICAL COMPARISON
// ------------------------------------------------------

function addComparisonLine(parent, label, value) {
  const line = document.createElement("p");
  line.style.margin = "7px 0";
  line.style.color = "#cbd5e1";
  line.style.fontSize = "13px";
  line.style.overflowWrap = "anywhere";
  line.textContent = `${label}: ${value ?? "N/A"}`;
  parent.appendChild(line);
}

function renderComparisonSnapshot(parent, heading, snapshot) {
  const section = document.createElement("section");

  section.style.marginTop = "12px";
  section.style.padding = "12px";
  section.style.background = "#111c2e";
  section.style.border = "1px solid #334155";
  section.style.borderRadius = "10px";

  const title = document.createElement("h3");
  title.textContent = heading;
  section.appendChild(title);

  if (!snapshot) {
    addComparisonLine(section, "स्थिति", "डेटा उपलब्ध नहीं");
    parent.appendChild(section);
    return;
  }

  addComparisonLine(section, "स्थिति", snapshot.status);
  addComparisonLine(section, "ऐतिहासिक कैंडल", snapshot.candleCount);
  addComparisonLine(section, "डेटा गुणवत्ता", snapshot.dataQuality?.quality);
  addComparisonLine(section, "डेटा समस्याएँ", snapshot.dataQuality?.issueCount);
  addComparisonLine(section, "ऐतिहासिक ट्रेंड वर्गीकरण", snapshot.historicalTrend);
  addComparisonLine(section, "Pivot High", snapshot.marketStructure?.pivotHighCount);
  addComparisonLine(section, "Pivot Low", snapshot.marketStructure?.pivotLowCount);
  addComparisonLine(section, "Structure Events", snapshot.marketStructure?.structureEventCount);
  addComparisonLine(section, "Support Levels", snapshot.supportResistance?.supportCount);

  renderReadableValue(
    section,
    "Support Details",
    snapshot.supportResistance?.supports ?? []
  );

  addComparisonLine(section, "Resistance Levels", snapshot.supportResistance?.resistanceCount);

  renderReadableValue(
    section,
    "Resistance Details",
    snapshot.supportResistance?.resistances ?? []
  );

  addComparisonLine(section, "Candle Patterns", snapshot.candlePatterns?.totalPatterns);

  if (snapshot.fibonacci?.swing) {
    const swing = snapshot.fibonacci.swing;
    const fibonacciSection = document.createElement("div");

    fibonacciSection.style.margin = "12px 0 0";
    fibonacciSection.style.padding = "10px";
    fibonacciSection.style.background = "#172338";
    fibonacciSection.style.border = "1px solid #475569";
    fibonacciSection.style.borderRadius = "8px";

    const fibonacciTitle = document.createElement("h4");
    fibonacciTitle.textContent = "Fibonacci Swing — Historical Details";
    fibonacciTitle.style.margin = "0 0 10px";
    fibonacciTitle.style.color = "#93c5fd";

    fibonacciSection.appendChild(fibonacciTitle);

    addComparisonLine(fibonacciSection, "Direction", swing.direction);
    addComparisonLine(fibonacciSection, "Start Price", formatLevelNumber(swing.startPrice));
    addComparisonLine(fibonacciSection, "End Price", formatLevelNumber(swing.endPrice));
    addComparisonLine(fibonacciSection, "Start Candle Index", swing.startIndex);
    addComparisonLine(fibonacciSection, "End Candle Index", swing.endIndex);
    addComparisonLine(fibonacciSection, "Start Confirmed At", swing.startConfirmedAt);
    addComparisonLine(fibonacciSection, "End Confirmed At", swing.endConfirmedAt);

    section.appendChild(fibonacciSection);
  } else {
    addComparisonLine(section, "Fibonacci Swing", "ऐतिहासिक Swing डेटा उपलब्ध नहीं");
  }

  parent.appendChild(section);
}

function updateCombinedStatus() {
  const target = document.getElementById("combined-status");
  if (!target) return;

  const daily = state["1d"];
  const intraday = state["15m"];

  target.replaceChildren();

  const summary = document.createElement("p");

  summary.textContent =
    `1D: ${daily.status} (${daily.candleCount} candles)` +
    `${daily.truncated ? " [और पुराना डेटा उपलब्ध है]" : ""} | ` +
    `15M: ${intraday.status} (${intraday.candleCount} candles)` +
    `${intraday.truncated ? " [और पुराना डेटा उपलब्ध है]" : ""}`;

  summary.style.fontWeight = "bold";
  summary.style.color = "#7dd3fc";

  target.appendChild(summary);

  if (!daily.report || daily.status !== "VALID") {
    addComparisonLine(
      target,
      "Combined Analysis",
      "वैध 1D ऐतिहासिक रिपोर्ट की प्रतीक्षा है।"
    );
    return;
  }

  const comparison = compareHistoricalTimeframes(
    daily.report,
    intraday.report
  );

  if (comparison.status === "ERROR") {
    addComparisonLine(
      target,
      "Comparison Status",
      `ERROR: ${comparison.error}`
    );
    return;
  }

  const note = document.createElement("p");
  note.textContent = comparison.note;
  note.style.color = "#94a3b8";
  note.style.fontSize = "12px";
  target.appendChild(note);

  renderComparisonSnapshot(
    target,
    "1D — Daily Historical Snapshot",
    comparison.daily
  );

  if (comparison.status === "WAITING_FOR_DATA") {
    const waiting = document.createElement("p");

    waiting.textContent =
      "15M ऐतिहासिक डेटा अभी उपलब्ध नहीं है। " +
      "15M तुलना डेटा जुड़ने के बाद अपने आप उपलब्ध होगी।";

    waiting.style.color = "#fbbf24";
    waiting.style.fontWeight = "bold";

    target.appendChild(waiting);

    renderComparisonSnapshot(
      target,
      "15M — Intraday Historical Snapshot",
      null
    );

    return;
  }

  renderComparisonSnapshot(
    target,
    "15M — Intraday Historical Snapshot",
    comparison.intraday
  );

  const result = document.createElement("section");

  result.style.marginTop = "12px";
  result.style.padding = "12px";
  result.style.background = "#111c2e";
  result.style.border = "1px solid #334155";
  result.style.borderRadius = "10px";

  const title = document.createElement("h3");
  title.textContent = "Historical Timeframe Comparison";
  result.appendChild(title);

  addComparisonLine(
    result,
    "Trend Classification Match",
    comparison.comparison.trendClassificationMatches
      ? "हाँ — दोनों का वर्गीकरण समान है"
      : "नहीं — दोनों का वर्गीकरण अलग है"
  );

  addComparisonLine(
    result,
    "Data Quality Match",
    comparison.comparison.dataQualityMatches
      ? "हाँ — डेटा गुणवत्ता समान है"
      : "नहीं — डेटा गुणवत्ता अलग है"
  );

  addComparisonLine(
    result,
    "1D Candle Count",
    comparison.comparison.candleCounts.daily
  );

  addComparisonLine(
    result,
    "15M Candle Count",
    comparison.comparison.candleCounts.intraday
  );

  target.appendChild(result);
}

// ------------------------------------------------------
// SVG HELPERS
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

function renderHistoricalCandlestickChart(candles, timeframe) {
  const model = buildHistoricalCandlestickChart(candles, {
    width: 1000,
    height: 420,
    padding: 55,
    maxVisibleCandles: 100
  });

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

  const heading = document.createElement("h3");
  heading.textContent =
    `NIFTY 50 — ${timeframe.toUpperCase()} Historical Candlestick Chart`;

  section.appendChild(heading);

  const description = document.createElement("p");

  description.textContent =
    `${model.totalCandles} candles | ${model.visibleCandles} displayed | ` +
    `${model.firstVisibleDate} to ${model.lastVisibleDate}`;

  description.style.fontSize = "12px";
  description.style.color = "#cbd5e1";

  section.appendChild(description);

  const svg = createSvgElement("svg", {
    viewBox: `0 0 ${model.width} ${model.height}`,
    role: "img",
    "aria-label": `NIFTY 50 historical ${timeframe} candlestick chart`,
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

  const range = model.priceRange.high - model.priceRange.low || 1;

  for (let i = 0; i <= 4; i++) {
    const ratio = i / 4;
    const y = top + (bottom - top) * ratio;
    const price = model.priceRange.high - range * ratio;

    svg.appendChild(createSvgElement("line", {
      x1: left,
      y1: y,
      x2: right,
      y2: y,
      stroke: "#334155",
      "stroke-width": 1,
      "stroke-dasharray": "4 5"
    }));

    const label = createSvgElement("text", {
      x: 5,
      y: y + 4,
      fill: "#cbd5e1",
      "font-size": 13
    });

    label.textContent = price.toLocaleString("en-IN", {
      maximumFractionDigits: 2
    });

    svg.appendChild(label);
  }

  for (const bar of model.bars) {
    const color =
      bar.direction === "BULLISH_CANDLE"
        ? "#22c55e"
        : bar.direction === "BEARISH_CANDLE"
          ? "#ef4444"
          : "#94a3b8";

    svg.appendChild(createSvgElement("line", {
      x1: bar.x,
      y1: bar.wickTop,
      x2: bar.x,
      y2: bar.wickBottom,
      stroke: color,
      "stroke-width": 2
    }));

    svg.appendChild(createSvgElement("rect", {
      x: bar.bodyX,
      y: bar.bodyY,
      width: bar.bodyWidth,
      height: bar.bodyHeight,
      fill: color,
      stroke: color,
      rx: 1
    }));
  }

  const indexes = [...new Set([
    0,
    Math.floor((model.bars.length - 1) / 2),
    model.bars.length - 1
  ])];

  for (const index of indexes) {
    const bar = model.bars[index];

    const label = createSvgElement("text", {
      x: bar.x,
      y: model.height - 12,
      fill: "#cbd5e1",
      "font-size": 12,
      "text-anchor": "middle"
    });

    label.textContent = bar.date;
    svg.appendChild(label);
  }

  section.appendChild(svg);

  const note = document.createElement("p");

  note.textContent =
    "केवल पुराने ऐतिहासिक OHLC डेटा का चार्ट; भविष्य की कीमत या ट्रेडिंग सलाह नहीं।";

  note.style.fontSize = "12px";
  note.style.color = "#94a3b8";

  section.appendChild(note);

  return section;
}

// ------------------------------------------------------
// READABLE HISTORICAL VALUES
// ------------------------------------------------------

function formatLevelNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return String(value ?? "N/A");
  }

  return value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function renderReadableValue(parent, label, value, depth = 0) {
  if (depth > 4) return;

  if (Array.isArray(value)) {
    const group = document.createElement("div");
    group.style.margin = "8px 0";
    group.style.padding = "8px";
    group.style.borderLeft = "2px solid #475569";
    group.style.background = "#111827";
    group.style.borderRadius = "6px";

    const heading = document.createElement("p");
    heading.textContent = `${label} (${value.length})`;
    heading.style.fontWeight = "bold";
    heading.style.color = "#93c5fd";
    group.appendChild(heading);

    if (value.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "कोई ऐतिहासिक स्तर उपलब्ध नहीं";
      empty.style.color = "#94a3b8";
      group.appendChild(empty);
    } else {
      value.forEach((item, index) => {
        const itemBox = document.createElement("div");
        itemBox.style.padding = "6px 0";
        itemBox.style.borderTop = "1px solid #334155";

        if (item && typeof item === "object") {
          renderReadableValue(
            itemBox,
            `स्तर ${index + 1}`,
            item,
            depth + 1
          );
        } else {
          const line = document.createElement("p");
          line.textContent = String(item ?? "N/A");
          itemBox.appendChild(line);
        }

        group.appendChild(itemBox);
      });
    }

    parent.appendChild(group);
    return;
  }

  if (value !== null && typeof value === "object") {
    const group = document.createElement("div");
    group.style.margin = "6px 0";
    group.style.paddingLeft = "8px";

    const heading = document.createElement("p");
    heading.textContent = label;
    heading.style.fontWeight = "bold";
    heading.style.color = "#cbd5e1";
    group.appendChild(heading);

    for (const [key, nestedValue] of Object.entries(value)) {
      renderReadableValue(group, key, nestedValue, depth + 1);
    }

    parent.appendChild(group);
    return;
  }

  const line = document.createElement("p");

  const displayValue =
    typeof value === "number"
      ? formatLevelNumber(value)
      : String(value ?? "N/A");

  line.textContent = `${label}: ${displayValue}`;
  line.style.margin = "4px 0";
  line.style.overflowWrap = "anywhere";

  parent.appendChild(line);
}

function addText(parent, label, value) {
  renderReadableValue(parent, label, value);
}

// ------------------------------------------------------
// CARD RENDERING
// ------------------------------------------------------

function renderCards(timeframe, rendered, uiModel, chartPanel) {
  const target = CONFIG[timeframe].dashboard;
  target.replaceChildren();

  if (rendered.status !== "OK") {
    throw new Error(
      rendered.error || "Dashboard rendering failed."
    );
  }

  const heading = document.createElement("h3");
  heading.textContent = rendered.screen.header.title;
  target.appendChild(heading);

  const metadata = document.createElement("p");

  metadata.textContent =
    `Timeframe: ${timeframe.toUpperCase()} | ` +
    `Candles: ${rendered.screen.metadata.candleCount}`;

  target.appendChild(metadata);

  if (chartPanel) {
    target.appendChild(chartPanel);
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
    summary.style.color = "#7dd3fc";

    section.appendChild(summary);

    const content = document.createElement("div");
    content.style.paddingTop = "10px";

    if (card.id === "data-quality") {
      const quality = card.content.status ?? "UNKNOWN";
      const details = card.content.details ?? {};

      const line = document.createElement("p");

      line.textContent =
        `Status: ${quality} | Issues: ${details.issueCount ?? 0}`;

      line.style.fontWeight = "bold";
      line.style.color =
        quality === "VALID" ? "#86efac" : "#fca5a5";

      content.appendChild(line);
    }

    for (const [key, value] of Object.entries(card.content)) {
      if (
        key === "id" ||
        key === "title" ||
        (card.id === "data-quality" && key === "status")
      ) {
        continue;
      }

      addText(content, key, value);
    }

    section.appendChild(content);
    target.appendChild(section);
  }
}

// ------------------------------------------------------
// BUILD DASHBOARD
// ------------------------------------------------------

function buildDashboard(
  timeframe,
  candles,
  {
    maxCandlesAllowed = MAX_DASHBOARD_CANDLES,
    truncated = false
  } = {}
) {
  const report = generateHistoricalReport(
    {
      candles,
      timeframe
    },
    {
      maxCandles: maxCandlesAllowed
    }
  );

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

  let chartPanel = null;

  try {
    chartPanel =
      renderHistoricalCandlestickChart(candles, timeframe);
  } catch (error) {
    console.error(`${timeframe} chart error:`, error);
  }

  renderCards(timeframe, rendered, uiModel, chartPanel);

  if (truncated) {
    const warning = document.createElement("p");

    warning.textContent =
      `ध्यान दें: डैशबोर्ड की ${maxCandlesAllowed} कैंडल सीमा तक डेटा लोड हुआ है। ` +
      "डेटाबेस में इससे पुरानी कैंडल भी मौजूद हो सकती हैं।";

    warning.style.padding = "12px";
    warning.style.margin = "12px 0";
    warning.style.background = "#292313";
    warning.style.border = "1px solid #a16207";
    warning.style.borderRadius = "8px";
    warning.style.color = "#fde68a";
    warning.style.fontSize = "13px";

    CONFIG[timeframe].dashboard.appendChild(warning);
  }

  state[timeframe] = {
    status: "VALID",
    candleCount: candles.length,
    report,
    truncated
  };

  updateCombinedStatus();
}

// ------------------------------------------------------
// LOCAL STORAGE
// ------------------------------------------------------

function saveHistoricalData(
  timeframe,
  candles,
  filename,
  {
    truncated = false,
    maxCandlesAllowed = MAX_DASHBOARD_CANDLES
  } = {}
) {
  try {
    localStorage.setItem(
      CONFIG[timeframe].storageKey,
      JSON.stringify({
        filename,
        timeframe,
        candles,
        truncated,
        maxCandlesAllowed,
        savedAt: new Date().toISOString()
      })
    );

    return true;
  } catch (error) {
    console.warn("Local storage unavailable:", error);
    return false;
  }
}

function restoreSavedData(timeframe) {
  try {
    const savedText =
      localStorage.getItem(CONFIG[timeframe].storageKey);

    if (!savedText) return false;

    const saved = JSON.parse(savedText);

    if (
      !saved ||
      !Array.isArray(saved.candles) ||
      saved.timeframe !== timeframe
    ) {
      throw new Error("Saved timeframe data is invalid.");
    }

    const savedLimit = Math.max(
      MAX_DASHBOARD_CANDLES,
      saved.candles.length
    );

    const imported = parseHistoricalDataText(
      JSON.stringify(saved.candles),
      "saved-historical-data.json",
      timeframe,
      {
        maxCandles: savedLimit
      }
    );

    if (imported.status !== "OK") {
      throw new Error(imported.error);
    }

    buildDashboard(timeframe, imported.candles, {
      maxCandlesAllowed: savedLimit,
      truncated: saved.truncated === true
    });

    showStatus(
      timeframe,
      `मोबाइल का सेव डेटा लोड हुआ: ${timeframe.toUpperCase()} | ` +
      `${imported.candleCount} candles` +
      `${saved.truncated ? " | पुराने डेटा की और कैंडल उपलब्ध हैं" : ""}`
    );

    return true;
  } catch (error) {
    showStatus(
      timeframe,
      `मोबाइल डेटा लोड नहीं हुआ: ${error.message}`,
      true
    );

    return false;
  }
}

// ------------------------------------------------------
// CLOUDFLARE PAGINATED HISTORICAL DATA
// ------------------------------------------------------

async function loadFromCloudflare(timeframe) {
  showStatus(
    timeframe,
    `Cloudflare से ${timeframe.toUpperCase()} ऐतिहासिक डेटा के सभी पेज लोड हो रहे हैं...`
  );

  const fetched = await fetchHistoricalCandlePages({
    apiBase: API_BASE,
    timeframe,
    index: "NIFTY",
    maxCandles: MAX_DASHBOARD_CANDLES
  });

  if (!fetched || fetched.status !== "OK") {
    throw new Error(
      fetched?.error || "Historical pagination failed."
    );
  }

  if (!Array.isArray(fetched.candles)) {
    throw new Error("Historical pagination returned invalid candles.");
  }

  if (fetched.candles.length === 0) {
    state[timeframe] = {
      status: "WAITING_FOR_DATA",
      candleCount: 0,
      report: null,
      truncated: false
    };

    updateCombinedStatus();

    showStatus(
      timeframe,
      `${timeframe.toUpperCase()} डेटा अभी उपलब्ध नहीं है — WAITING_FOR_DATA`
    );

    return false;
  }

  const imported = parseHistoricalDataText(
    JSON.stringify(fetched.candles),
    `cloudflare-nifty-${timeframe}.json`,
    timeframe,
    {
      maxCandles: fetched.maxCandlesAllowed
    }
  );

  if (imported.status !== "OK") {
    throw new Error(imported.error);
  }

  buildDashboard(timeframe, imported.candles, {
    maxCandlesAllowed: fetched.maxCandlesAllowed,
    truncated: fetched.truncated
  });

  saveHistoricalData(
    timeframe,
    imported.candles,
    `Cloudflare NIFTY ${timeframe.toUpperCase()} historical data`,
    {
      truncated: fetched.truncated,
      maxCandlesAllowed: fetched.maxCandlesAllowed
    }
  );

  if (fetched.truncated) {
    showStatus(
      timeframe,
      `सफलता: ${imported.candleCount} ${timeframe.toUpperCase()} ऐतिहासिक candles लोड हुईं। ` +
      "डैशबोर्ड की अधिकतम सीमा पूरी हुई; डेटाबेस में और पुराना डेटा उपलब्ध हो सकता है।"
    );
  } else {
    showStatus(
      timeframe,
      `सफलता: Cloudflare से ${timeframe.toUpperCase()} की ` +
      `${imported.candleCount} ऐतिहासिक candles लोड हुईं। सभी उपलब्ध पेज प्राप्त हुए।`
    );
  }

  return true;
}

async function loadTimeframe(timeframe) {
  try {
    const loaded = await loadFromCloudflare(timeframe);

    if (!loaded && restoreSavedData(timeframe)) {
      showStatus(
        timeframe,
        `Cloudflare पर नया डेटा उपलब्ध नहीं था। मोबाइल में सेव ${timeframe.toUpperCase()} डेटा दिखाया गया।`
      );
    }
  } catch (error) {
    console.error(
      `${timeframe} Cloudflare loading failed:`,
      error
    );

    if (restoreSavedData(timeframe)) {
      showStatus(
        timeframe,
        `Cloudflare उपलब्ध नहीं हुआ। मोबाइल में सेव ${timeframe.toUpperCase()} डेटा दिखाया गया।`
      );

      return;
    }

    if (timeframe === "15m") {
      state[timeframe] = {
        status: "WAITING_FOR_DATA",
        candleCount: 0,
        report: null,
        truncated: false
      };

      showStatus(
        timeframe,
        "15M डेटा अभी उपलब्ध नहीं है — WAITING_FOR_DATA"
      );
    } else {
      state[timeframe] = {
        status: "ERROR",
        candleCount: 0,
        report: null,
        truncated: false
      };

      showStatus(
        timeframe,
        `1D डेटा लोड नहीं हुआ। कारण: ${error.message}`,
        true
      );
    }

    updateCombinedStatus();
  }
}

// ------------------------------------------------------
// FILE IMPORT
// ------------------------------------------------------

async function importHistoricalFile(timeframe, file) {
  if (!file) return;

  showStatus(
    timeframe,
    `${timeframe.toUpperCase()} ऐतिहासिक फाइल पढ़ी जा रही है...`
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

    buildDashboard(timeframe, imported.candles, {
      maxCandlesAllowed: Math.max(
        5000,
        imported.candleCount
      ),
      truncated: false
    });

    const saved = saveHistoricalData(
      timeframe,
      imported.candles,
      file.name,
      {
        truncated: false,
        maxCandlesAllowed: Math.max(
          5000,
          imported.candleCount
        )
      }
    );

    showStatus(
      timeframe,
      `सफलता: ${imported.candleCount} ${timeframe.toUpperCase()} candles इम्पोर्ट हुईं। ` +
      `Mobile save: ${saved ? "OK" : "Unavailable"}`
    );
  } catch (error) {
    showStatus(
      timeframe,
      `Import error: ${error.message}`,
      true
    );
  }
}

// ------------------------------------------------------
// INITIALIZATION
// ------------------------------------------------------

for (const timeframe of ["1d", "15m"]) {
  const elements = CONFIG[timeframe];

  if (
    !elements.fileInput ||
    !elements.status ||
    !elements.dashboard
  ) {
    console.error(
      `Dashboard HTML elements missing for ${timeframe}.`
    );

    continue;
  }

  elements.fileInput.addEventListener("change", event => {
    importHistoricalFile(
      timeframe,
      event.target.files?.[0]
    );
  });
}

updateCombinedStatus();

loadTimeframe("1d");
loadTimeframe("15m");