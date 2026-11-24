// ======================================================
// BADAL SEVERIYA V12
// HISTORICAL DASHBOARD BROWSER
// Educational historical data only
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

// ------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------

const API_BASE =
  "https://badal-severiya-data.mrstarrdbs.workers.dev";

const STORAGE_PREFIX =
  "badal-severiya-v12-historical-import-";

const ALLOWED_TIMEFRAMES = ["15m", "1d"];

let selectedTimeframe = "1d";

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
// TIMEFRAME SELECTOR
// ------------------------------------------------------

function createTimeframeSelector() {
  if (!fileInput) return;

  if (document.getElementById("historical-timeframe")) {
    return;
  }

  const wrapper = document.createElement("div");

  wrapper.style.margin = "12px 0";
  wrapper.style.padding = "10px";
  wrapper.style.borderRadius = "8px";
  wrapper.style.background = "#172033";

  const label = document.createElement("label");

  label.textContent = "Historical Timeframe चुनें";

  label.style.display = "block";
  label.style.marginBottom = "8px";
  label.style.fontWeight = "bold";
  label.style.color = "#ffffff";

  const select = document.createElement("select");

  select.id = "historical-timeframe";

  select.style.width = "100%";
  select.style.padding = "12px";
  select.style.borderRadius = "6px";
  select.style.background = "#0f172a";
  select.style.color = "#ffffff";
  select.style.border = "1px solid #475569";

  const options = [
    {
      value: "1d",
      text: "1D - Daily Historical Data"
    },
    {
      value: "15m",
      text: "15M - 15 Minute Historical Data"
    }
  ];

  for (const optionData of options) {
    const option = document.createElement("option");

    option.value = optionData.value;
    option.textContent = optionData.text;

    select.appendChild(option);
  }

  select.value = selectedTimeframe;

  label.htmlFor = select.id;

  wrapper.appendChild(label);
  wrapper.appendChild(select);

  fileInput.parentNode.insertBefore(
    wrapper,
    fileInput
  );

  select.addEventListener("change", async () => {
    const nextTimeframe = select.value;

    if (!ALLOWED_TIMEFRAMES.includes(nextTimeframe)) {
      showStatus("Invalid timeframe selected.", true);
      return;
    }

    selectedTimeframe = nextTimeframe;

    fileInput.value = "";

    await loadForSelectedTimeframe();
  });
}

// ------------------------------------------------------
// DASHBOARD TEXT HELPER
// ------------------------------------------------------

function addText(parent, label, value) {
  const line = document.createElement("p");

  line.textContent = `${label}: ${
    typeof value === "object"
      ? JSON.stringify(value)
      : String(value ?? "N/A")
  }`;

  parent.appendChild(line);
}

// ------------------------------------------------------
// DASHBOARD RENDERING
// ------------------------------------------------------

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

// ------------------------------------------------------
// BUILD HISTORICAL DASHBOARD
// ------------------------------------------------------

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

  // Volume diagnostic
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
    timeframe,
    candleCount: candles.length,
    directMissingVolumes,
    qualityMissingVolumes
  });
}

// ------------------------------------------------------
// STORAGE KEY
// ------------------------------------------------------

function getStorageKey(timeframe) {
  return STORAGE_PREFIX + timeframe;
}

// ------------------------------------------------------
// SAVE DATA ON MOBILE
// ------------------------------------------------------

function saveHistoricalData(
  candles,
  timeframe,
  filename
) {
  try {
    localStorage.setItem(
      getStorageKey(timeframe),
      JSON.stringify({
        filename,
        timeframe,
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

function restoreSavedData(timeframe) {
  try {
    const savedText =
      localStorage.getItem(getStorageKey(timeframe));

    if (!savedText) {
      return false;
    }

    const savedData = JSON.parse(savedText);

    if (
      !savedData ||
      !Array.isArray(savedData.candles) ||
      savedData.timeframe !== timeframe
    ) {
      throw new Error(
        "Saved timeframe data does not match."
      );
    }

    const imported = parseHistoricalDataText(
      JSON.stringify(savedData.candles),
      "saved-historical-data.json",
      timeframe
    );

    if (imported.status !== "OK") {
      throw new Error(imported.error);
    }

    buildDashboard(
      imported.candles,
      timeframe
    );

    showStatus(
      `मोबाइल का सेव डेटा लोड हुआ: ${timeframe} | ${imported.candleCount} candles`
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

async function loadFromCloudflare(timeframe) {
  showStatus(
    `Cloudflare से ${timeframe} ऐतिहासिक डेटा लोड हो रहा है...`
  );

  const url =
    `${API_BASE}/api/data/candles` +
    `?index=NIFTY` +
    `&timeframe=${encodeURIComponent(timeframe)}` +
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

  // Existing importer validates OHLC,
  // timestamps, candle count and ordering.
  const imported = parseHistoricalDataText(
    JSON.stringify(result.candles),
    `cloudflare-nifty-${timeframe}.json`,
    timeframe
  );

  if (imported.status !== "OK") {
    throw new Error(imported.error);
  }

  buildDashboard(
    imported.candles,
    timeframe
  );

  saveHistoricalData(
    imported.candles,
    timeframe,
    `Cloudflare NIFTY ${timeframe} historical data`
  );

  showStatus(
    `सफलता: Cloudflare से ${timeframe} की ${imported.candleCount} ऐतिहासिक candles लोड हुईं।`
  );

  return true;
}

// ------------------------------------------------------
// LOAD SELECTED TIMEFRAME
// ------------------------------------------------------

async function loadForSelectedTimeframe() {
  const timeframe = selectedTimeframe;

  try {
    await loadFromCloudflare(timeframe);

  } catch (error) {
    console.error(
      `Cloudflare ${timeframe} loading failed:`,
      error
    );

    const restored = restoreSavedData(timeframe);

    if (restored) {
      showStatus(
        `Cloudflare पर ${timeframe} डेटा उपलब्ध नहीं हुआ। मोबाइल में सेव डेटा दिखाया गया।`
      );

      return;
    }

    showStatus(
      `Cloudflare ${timeframe} डेटा उपलब्ध नहीं है और मोबाइल में भी सेव डेटा नहीं मिला। कारण: ${error.message}`,
      true
    );
  }
}

// ------------------------------------------------------
// IMPORT CSV / JSON FILE
// ------------------------------------------------------

async function importHistoricalFile(file) {
  if (!file) return;

  const timeframe = selectedTimeframe;

  showStatus(
    `${timeframe} फाइल पढ़ी जा रही है...`
  );

  try {
    const fileText = await file.text();

    const imported = parseHistoricalDataText(
      fileText,
      file.name,
      timeframe
    );

    if (imported.status !== "OK") {
      throw new Error(imported.error);
    }

    buildDashboard(
      imported.candles,
      timeframe
    );

    const saved = saveHistoricalData(
      imported.candles,
      timeframe,
      file.name
    );

    showStatus(
      `सफलता: ${imported.candleCount} ऐतिहासिक candles इम्पोर्ट हुईं। Timeframe: ${timeframe}. Mobile save: ${saved ? "OK" : "Unavailable"}`
    );

  } catch (error) {
    showStatus(
      `Import error: ${error.message}`,
      true
    );
  }
}

// ------------------------------------------------------
// START DASHBOARD
// ------------------------------------------------------

async function startDashboard() {
  await loadForSelectedTimeframe();
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

  startDashboard();

} else {
  console.error(
    "Historical dashboard HTML elements are missing."
  );
}