
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

const fileInput = document.getElementById("historical-file");
const statusBox = document.getElementById("import-status");
const dashboard = document.getElementById("analysis-results");

function showStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.dataset.state = isError ? "error" : "success";
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
    throw new Error(rendered.error || "Dashboard rendering failed.");
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
    const section = document.createElement("section");
    section.className = "card";

    const title = document.createElement("h2");
    title.textContent = `${card.order}. ${card.title}`;
    section.appendChild(title);

    const content = card.content;

    for (const [key, value] of Object.entries(content)) {
      if (key === "id" || key === "title") continue;
      addText(section, key, value);
    }

    dashboard.appendChild(section);
  }
}

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

    const report = generateHistoricalReport({
      candles: imported.candles,
      timeframe: imported.timeframe
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

    showStatus(
      `सफलता: ${imported.candleCount} ऐतिहासिक कैंडल इम्पोर्ट हुईं।`
    );

  } catch (error) {
    showStatus(error.message, true);
  }
}

if (fileInput && statusBox && dashboard) {
  fileInput.addEventListener("change", event => {
    const file = event.target.files?.[0];
    importHistoricalFile(file);
  });
} else {
  console.error(
    "Historical dashboard HTML elements are missing."
  );
}
