
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

const API_BASE =
  "https://badal-severiya-data.mrstarrdbs.workers.dev";

const STORAGE_KEY =
  "badal-severiya-v12-historical-import";

const fileInput =
  document.getElementById("historical-file");

const statusBox =
  document.getElementById("import-status");

const dashboard =
  document.getElementById("analysis-results");

function showStatus(message, isError = false) {
  if (!statusBox) return;

  statusBox.textContent = message;
  statusBox.dataset.state =
    isError ? "error" : "success";
}

function addText(parent, label, value) {
  const line = document.createElement("p");

  line.textContent = `${label}: ${
    typeof value === "object"
      ? JSON.stringify(value)
      : String(value ?? "N/A")
  }`;

  parent.appendChild(line);
}

function renderCards(rendered, uiModel) {
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

function buildDashboard(candles, timeframe) {
  const report = generateHistoricalReport({
    candles,
    timeframe
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

  renderCards(rendered, uiModel);
}

// Cloudflare से ऐतिहासिक NIFTY डेटा लोड करें
async function loadFromCloudflare() {
  showStatus("Cloudflare से ऐतिहासिक डेटा लोड हो रहा है...");

  const url =
    `${API_BASE}/api/data/candles?index=NIFTY&timeframe=1d&limit=5000`;

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
    throw new Error("API response का फॉर्मेट सही नहीं है।");
  }

  if (result.candles.length < 200) {
    throw new Error(
      `पर्याप्त ऐतिहासिक डेटा नहीं मिला। Candles: ${result.candles.length}`
    );
  }

  // OHLC डेटा की बुनियादी जाँच
  let previousTime = 0;

  for (const candle of result.candles) {
    const time = Date.parse(candle.timestamp);

    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);

    if (
      !Number.isFinite(time) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      throw new Error("कैंडल डेटा में अमान्य मान मिला।");
    }

    if (
      high < low ||
      high < open ||
      high < close ||
      low > open ||
      low > close
    ) {
      throw new Error("OHLC डेटा की जाँच असफल हुई।");
    }

    if (time <= previousTime) {
      throw new Error(
        "कैंडल की तारीखें सही क्रम में नहीं हैं।"
      );
    }

    previousTime = time;
  }

  // API डेटा को मौजूदा डेटा इम्पोर्टर से जाँचें
  const imported = parseHistoricalDataText(
    JSON.stringify(result.candles),
    "cloudflare-nifty-historical.json",
    "1d"
  );

  if (imported.status !== "OK") {
    throw new Error(imported.error);
  }

  buildDashboard(imported.candles, "1d");

  // सफल डेटा को मोबाइल में भी सेव करें
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        filename: "Cloudflare NIFTY historical data",
        timeframe: "1d",
        candles: imported.candles,
        savedAt: new Date().toISOString()
      })
    );
  } catch (storageError) {
    console.warn("Local storage unavailable:", storageError);
  }

  showStatus(
    `सफलता: Cloudflare से ${imported.candleCount} ऐतिहासिक कैंडल लोड हुईं।`
  );
}

// मोबाइल में सेव डेटा वापस लोड करें
function restoreSavedData() {
  try {
    const savedText =
      localStorage.getItem(STORAGE_KEY);

    if (!savedText) {
      showStatus(
        "Cloudflare डेटा उपलब्ध नहीं हुआ और मोबाइल में पुराना डेटा भी सेव नहीं है।"
      );
      return false;
    }

    const savedData = JSON.parse(savedText);

    if (
      !savedData ||
      !Array.isArray(savedData.candles) ||
      !savedData.timeframe
    ) {
      throw new Error("सेव किया हुआ डेटा सही फॉर्मेट में नहीं है।");
    }

    const imported = parseHistoricalDataText(
      JSON.stringify(savedData.candles),
      "saved-historical-data.json",
      savedData.timeframe
    );

    if (imported.status !== "OK") {
      throw new Error(imported.error);
    }

    buildDashboard(
      imported.candles,
      imported.timeframe
    );

    showStatus(
      `मोबाइल में सेव पुराना डेटा लोड हुआ: ${imported.candleCount} कैंडल।`
    );

    return true;

  } catch (error) {
    showStatus(
      `पुराना डेटा लोड नहीं हुआ: ${error.message}`,
      true
    );

    return false;
  }
}

// CSV या JSON फाइल से डेटा इम्पोर्ट
async function importHistoricalFile(file) {
  if (!file) return;

  showStatus("फाइल पढ़ी जा रही है...");
  dashboard.replaceChildren();

  try {
    const text = await file.text();

    const imported = parseHistoricalDataText(
      text,
      file.name,
      "15m"
    );

    if (imported.status !== "OK") {
      throw new Error(imported.error);
    }

    buildDashboard(
      imported.candles,
      imported.timeframe
    );

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          filename: file.name,
          timeframe: imported.timeframe,
          candles: imported.candles,
          savedAt: new Date().toISOString()
        })
      );
    } catch (storageError) {
      console.warn("Local storage unavailable:", storageError);
    }

    showStatus(
      `सफलता: ${imported.candleCount} ऐतिहासिक कैंडल इम्पोर्ट हुईं।`
    );

  } catch (error) {
    showStatus(error.message, true);
  }
}

// Dashboard शुरू करें
async function startDashboard() {
  try {
    await loadFromCloudflare();

  } catch (error) {
    console.error("Cloudflare loading failed:", error);

    showStatus(
      `Cloudflare डेटा लोड नहीं हुआ: ${error.message}। सेव डेटा जाँचा जा रहा है।`,
      true
    );

    const restored = restoreSavedData();

    if (!restored) {
      showStatus(
        "Cloudflare और मोबाइल दोनों से डेटा लोड नहीं हुआ। बाद में दोबारा प्रयास करें।",
        true
      );
    }
  }
}

if (fileInput && statusBox && dashboard) {
  fileInput.addEventListener("change", event => {
    const file = event.target.files?.[0];
    importHistoricalFile(file);
  });

  startDashboard();

} else {
  console.error(
    "Historical dashboard HTML elements are missing."
  );
}
