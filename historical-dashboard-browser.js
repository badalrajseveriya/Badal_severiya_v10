
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
    const section = document.createElement("section");
    section.className = "card";

    const title = document.createElement("h2");
    title.textContent = `${card.order}. ${card.title}`;
    section.appendChild(title);

    if (card.id === "data-quality") {
      const quality = card.content.status ?? "UNKNOWN";
      const details = card.content.details ?? {};

      const issueCount = Number.isFinite(details.issueCount)
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

      section.appendChild(statusLine);

      const checksTitle = document.createElement("p");
      checksTitle.textContent = "Validation Checks";
      checksTitle.style.fontWeight = "bold";
      section.appendChild(checksTitle);

      const checks = details.checks ?? {};

      for (const [name, result] of Object.entries(checks)) {
        const line = document.createElement("p");

        line.textContent =
          `${name}: ${
            typeof result === "object"
              ? JSON.stringify(result)
              : String(result ?? "N/A")
          }`;

        section.appendChild(line);
      }

      if (Object.keys(checks).length === 0) {
        const line = document.createElement("p");
        line.textContent =
          "No individual check details available.";
        section.appendChild(line);
      }

    } else {
      for (const [key, value] of Object.entries(card.content)) {
        if (key === "id" || key === "title") {
          continue;
        }

        addText(section, key, value);
      }
    }

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
    createHistoricalDashboardDisplay(
      dashboardData
    );

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
      const savedData = {
        filename: file.name,
        timeframe: imported.timeframe,
        candles: imported.candles,
        savedAt: new Date().toISOString()
      };

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(savedData)
      );

      showStatus(
        `सफलता: ${imported.candleCount} ऐतिहासिक कैंडल इम्पोर्ट और सेव हुईं।`
      );

    } catch (storageError) {
      showStatus(
        `डेटा इम्पोर्ट हुआ, लेकिन मोबाइल में सेव नहीं हो पाया: ${storageError.message}`,
        true
      );
    }

  } catch (error) {
    showStatus(error.message, true);
  }
}

function restoreSavedData() {
  try {
    const savedText =
      localStorage.getItem(STORAGE_KEY);

    if (!savedText) {
      showStatus(
        "अभी कोई पुराना ऐतिहासिक डेटा सेव नहीं है। CSV या JSON फाइल चुनें।"
      );
      return;
    }

    const savedData = JSON.parse(savedText);

    if (
      !savedData ||
      !Array.isArray(savedData.candles) ||
      !savedData.timeframe
    ) {
      throw new Error(
        "सेव किया हुआ डेटा सही फॉर्मेट में नहीं है।"
      );
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
      `पिछला डेटा वापस लोड हुआ: ${imported.candleCount} ऐतिहासिक कैंडल।`
    );

  } catch (error) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage cleanup is optional.
    }

    showStatus(
      `पुराना डेटा लोड नहीं हुआ: ${error.message}। कृपया CSV या JSON दोबारा इम्पोर्ट करें।`,
      true
    );
  }
}

if (fileInput && statusBox && dashboard) {
  fileInput.addEventListener("change", event => {
    const file = event.target.files?.[0];
    importHistoricalFile(file);
  });

  restoreSavedData();

} else {
  console.error(
    "Historical dashboard HTML elements are missing."
  );
}
