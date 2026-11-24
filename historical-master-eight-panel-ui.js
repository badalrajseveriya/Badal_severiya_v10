
// ======================================================
// BADAL SEVERIYA V12
// MASTER EIGHT-PANEL HISTORICAL UI
// 1D + 15M | Historical Educational Analysis Only
// No forecasts, live signals or trading recommendations
// ======================================================

import { parseHistoricalDataText } from "./historical-data-import.js";
import { generateHistoricalReport } from "./historical-analysis-report.js";
import { analyzeMarketStructure } from "./market-structure.js";

const API_BASE =
  "https://badal-severiya-data.mrstarrdbs.workers.dev";

const TIMEFRAMES = {
  "1d": {
    summary: "master-summary-1d",
    input: "historical-file",
    status: "summary-status-1d",
    storageKey: "badal-severiya-v12-historical-import-1d"
  },
  "15m": {
    summary: "master-summary-15m",
    input: "historical-file-15m",
    status: "summary-status-15m",
    storageKey: "badal-severiya-v12-historical-import-15m"
  }
};

const COLORS = {
  bullish: "#16a34a",
  bearish: "#dc2626",
  entry: "#eab308",
  neutral: "#94a3b8",
  panel: "#111c2e",
  border: "#334155",
  text: "#f1f5f9",
  muted: "#cbd5e1"
};

function getElement(id) {
  return document.getElementById(id);
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = String(text);
  }

  return element;
}

function formatPrice(value) {
  if (!Number.isFinite(value)) {
    return "उपलब्ध नहीं";
  }

  return value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatPercent(value) {
  return `${Math.round(value)}%`;
}

function makeCard(title, value, color, description) {
  const card = createElement("section", "master-eight-card");

  card.style.cssText = `
    background:${COLORS.panel};
    border:1px solid ${COLORS.border};
    border-radius:10px;
    padding:13px;
    min-width:0;
    text-align:center;
  `;

  const heading = createElement("div", "", title);
  heading.style.cssText = `
    color:${color};
    font-weight:bold;
    font-size:13px;
    margin-bottom:9px;
  `;

  const result = createElement("div", "", value);
  result.style.cssText = `
    color:${COLORS.text};
    font-size:19px;
    font-weight:bold;
    overflow-wrap:anywhere;
  `;

  const note = createElement("div", "", description);
  note.style.cssText = `
    color:${COLORS.muted};
    font-size:11px;
    line-height:1.5;
    margin-top:7px;
  `;

  card.append(heading, result, note);

  return card;
}

function makeSection(title) {
  const section = createElement("section", "master-eight-section");

  section.style.cssText = `
    margin-top:13px;
    padding:12px;
    background:#0b1220;
    border:1px solid ${COLORS.border};
    border-radius:10px;
  `;

  const heading = createElement("h4", "", title);
  heading.style.cssText = `
    margin:0 0 11px;
    color:#7dd3fc;
    font-size:14px;
  `;

  section.appendChild(heading);

  return section;
}

// ------------------------------------------------------
// CREATE THE FIVE ADDITIONAL BOXES
// Existing three percentage boxes remain untouched.
// ------------------------------------------------------

function prepareDashboard(timeframe) {
  const config = TIMEFRAMES[timeframe];
  const summary = getElement(config.summary);

  if (!summary) {
    return null;
  }

  const existing = summary.querySelector(
    ".master-eight-container"
  );

  if (existing) {
    return existing;
  }

  // Hide the old static ENTRY / TARGET / STOP LOSS labels.
  const oldReferenceGrid = summary.querySelector(
    ".reference-grid"
  );

  if (oldReferenceGrid) {
    oldReferenceGrid.style.display = "none";
  }

  const container = createElement(
    "div",
    "master-eight-container"
  );

  container.style.marginTop = "12px";

  const levelsSection = makeSection(
    "ENTRY • STOP LOSS • TARGET — Historical Levels"
  );

  const levelsContainer = createElement(
    "div",
    "master-levels-container"
  );

  levelsContainer.style.cssText = `
    display:grid;
    grid-template-columns:1fr;
    gap:8px;
  `;

  levelsSection.appendChild(levelsContainer);

  const smcSection = makeSection(
    "SMART MONEY ACTIVITY — Historical SMC Scores"
  );

  const smcContainer = createElement(
    "div",
    "master-smc-container"
  );

  smcContainer.style.cssText = `
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:8px;
  `;

  smcSection.appendChild(smcContainer);

  container.append(levelsSection, smcSection);

  const percentageGrid = summary.querySelector(
    ".percentage-grid"
  );

  if (percentageGrid) {
    percentageGrid.after(container);
  } else {
    summary.appendChild(container);
  }

  return container;
}

// ------------------------------------------------------
// FIND HISTORICAL PRICE LEVELS
// ------------------------------------------------------

function nearestBelow(zones, price) {
  return zones
    .filter(zone =>
      Number.isFinite(zone.price) &&
      zone.price < price
    )
    .sort((a, b) => b.price - a.price)[0] ?? null;
}

function nearestAbove(zones, price) {
  return zones
    .filter(zone =>
      Number.isFinite(zone.price) &&
      zone.price > price
    )
    .sort((a, b) => a.price - b.price)[0] ?? null;
}

function calculateHistoricalLevels(report, candles) {
  const sections = report.sections;
  const structure = sections.marketStructure;
  const sr = sections.supportResistance;

  const currentPrice = candles[candles.length - 1].close;

  const supports = Array.isArray(sr.supports)
    ? sr.supports
    : [];

  const resistances = Array.isArray(sr.resistances)
    ? sr.resistances
    : [];

  const support = nearestBelow(supports, currentPrice);
  const resistance = nearestAbove(resistances, currentPrice);

  const trend = structure.trend;

  if (trend === "BULLISH") {
    return {
      trend,
      currentPrice,
      levels: [
        {
          name: "TARGET",
          price: resistance?.price,
          color: COLORS.bullish,
          description: "ऐतिहासिक ऊपरी Resistance क्षेत्र"
        },
        {
          name: "ENTRY",
          price: support?.price,
          color: COLORS.entry,
          description: "ऐतिहासिक निचला Support क्षेत्र"
        },
        {
          name: "STOP LOSS",
          price: support?.lower,
          color: COLORS.bearish,
          description: "ऐतिहासिक Support Zone की निचली सीमा"
        }
      ]
    };
  }

  if (trend === "BEARISH") {
    return {
      trend,
      currentPrice,
      levels: [
        {
          name: "STOP LOSS",
          price: resistance?.upper,
          color: COLORS.bearish,
          description: "ऐतिहासिक Resistance Zone की ऊपरी सीमा"
        },
        {
          name: "ENTRY",
          price: resistance?.price,
          color: COLORS.entry,
          description: "ऐतिहासिक ऊपरी Resistance क्षेत्र"
        },
        {
          name: "TARGET",
          price: support?.price,
          color: COLORS.bullish,
          description: "ऐतिहासिक निचला Support क्षेत्र"
        }
      ]
    };
  }

  return {
    trend: "UNKNOWN",
    currentPrice,
    levels: []
  };
}

// ------------------------------------------------------
// HISTORICAL SMC CONFLUENCE SCORE
// This is NOT institutional activity probability.
// ------------------------------------------------------

function isPriceInsideZone(price, zone) {
  return (
    Number.isFinite(zone.lower) &&
    Number.isFinite(zone.upper) &&
    price >= zone.lower &&
    price <= zone.upper
  );
}

function recentDirectionalEvent(events, direction, candles) {
  const recentStart = Math.max(0, candles.length - 20);

  return events.some(event =>
    event.direction === direction &&
    event.index >= recentStart &&
    event.index < candles.length
  );
}

function calculateSMCScores(structure, candles) {
  const current = candles[candles.length - 1];
  const price = current.close;

  const orderBlocks = structure.orderBlocks ?? [];
  const gaps = structure.fairValueGaps ?? [];
  const liquidity = structure.liquidity ?? [];
  const events = structure.structureEvents ?? [];

  const bullishOB = orderBlocks.some(zone =>
    zone.type === "BULLISH_ORDER_BLOCK" &&
    isPriceInsideZone(price, zone)
  );

  const bearishOB = orderBlocks.some(zone =>
    zone.type === "BEARISH_ORDER_BLOCK" &&
    isPriceInsideZone(price, zone)
  );

  const bullishFVG = gaps.some(zone =>
    zone.type === "BULLISH_FVG" &&
    zone.status === "UNMITIGATED_IN_AVAILABLE_HISTORY" &&
    isPriceInsideZone(price, zone)
  );

  const bearishFVG = gaps.some(zone =>
    zone.type === "BEARISH_FVG" &&
    zone.status === "UNMITIGATED_IN_AVAILABLE_HISTORY" &&
    isPriceInsideZone(price, zone)
  );

  const bullishEvent = recentDirectionalEvent(
    events,
    "BULLISH",
    candles
  );

  const bearishEvent = recentDirectionalEvent(
    events,
    "BEARISH",
    candles
  );

  const nearEqualLows = liquidity.some(zone =>
    zone.type === "EQUAL_LOWS" &&
    Math.abs(zone.price - current.low) / zone.price <= 0.002
  );

  const nearEqualHighs = liquidity.some(zone =>
    zone.type === "EQUAL_HIGHS" &&
    Math.abs(zone.price - current.high) / zone.price <= 0.002
  );

  const entryChecks = [
    bullishOB,
    bullishFVG,
    bullishEvent,
    nearEqualLows
  ];

  const exitChecks = [
    bearishOB,
    bearishFVG,
    bearishEvent,
    nearEqualHighs
  ];

  const entryScore =
    entryChecks.filter(Boolean).length * 25;

  const exitScore =
    exitChecks.filter(Boolean).length * 25;

  return {
    entryScore,
    exitScore,
    entryEvidence: entryChecks.filter(Boolean).length,
    exitEvidence: exitChecks.filter(Boolean).length,
    totalChecks: 4
  };
}

// ------------------------------------------------------
// RENDER HISTORICAL LEVELS
// ------------------------------------------------------

function renderLevels(timeframe, result) {
  prepareDashboard(timeframe);

  const summary = getElement(TIMEFRAMES[timeframe].summary);

  const container = summary?.querySelector(
    ".master-levels-container"
  );

  if (!container) return;

  container.replaceChildren();

  const trendLabel = createElement(
    "p",
    "",
    `ऐतिहासिक दिशा: ${result.trend} | अंतिम उपलब्ध बंद भाव: ${formatPrice(result.currentPrice)}`
  );

  trendLabel.style.cssText = `
    color:${COLORS.muted};
    font-size:12px;
    margin:0 0 10px;
  `;

  container.appendChild(trendLabel);

  if (!result.levels.length) {
    const message = createElement(
      "p",
      "",
      "ऐतिहासिक दिशा स्पष्ट नहीं है। Entry, Stop Loss और Target के स्तर उपलब्ध नहीं हैं।"
    );

    message.style.color = COLORS.neutral;
    container.appendChild(message);
    return;
  }

  for (const level of result.levels) {
    const value = Number.isFinite(level.price)
      ? formatPrice(level.price)
      : "ऐतिहासिक स्तर उपलब्ध नहीं";

    container.appendChild(
      makeCard(
        level.name,
        value,
        level.color,
        level.description
      )
    );
  }
}

// ------------------------------------------------------
// RENDER SMC SCORES
// ------------------------------------------------------

function renderSMC(timeframe, result) {
  prepareDashboard(timeframe);

  const summary = getElement(TIMEFRAMES[timeframe].summary);

  const container = summary?.querySelector(
    ".master-smc-container"
  );

  if (!container) return;

  container.replaceChildren();

  const entry = makeCard(
    "SMART MONEY ENTRY",
    formatPercent(result.entryScore),
    COLORS.bullish,
    `ऐतिहासिक Entry-जैसे पैटर्न: ${result.entryEvidence}/${result.totalChecks} जाँचें पूरी`
  );

  const exit = makeCard(
    "SMART MONEY EXIT",
    formatPercent(result.exitScore),
    COLORS.bearish,
    `ऐतिहासिक Exit-जैसे पैटर्न: ${result.exitEvidence}/${result.totalChecks} जाँचें पूरी`
  );

  container.append(entry, exit);

  const note = createElement(
    "p",
    "",
    "यह स्कोर चार ऐतिहासिक SMC शर्तों के मेल पर आधारित है। यह वास्तविक संस्थागत ऑर्डर या भविष्य की संभावना नहीं बताता।"
  );

  note.style.cssText = `
    grid-column:1/-1;
    color:#94a3b8;
    font-size:11px;
    line-height:1.5;
    margin:8px 0 0;
  `;

  container.appendChild(note);
}

// ------------------------------------------------------
// MAIN ANALYSIS
// ------------------------------------------------------

function analyzeTimeframe(timeframe, candles) {
  const report = generateHistoricalReport({
    candles,
    timeframe
  });

  if (!report || report.status !== "OK") {
    throw new Error(
      report?.error || "Historical report failed."
    );
  }

  if (report.dataType !== "HISTORICAL_ONLY") {
    throw new Error("Unexpected data type.");
  }

  const structure = analyzeMarketStructure(candles);

  if (structure.status !== "OK") {
    throw new Error("SMC historical analysis failed.");
  }

  const levels = calculateHistoricalLevels(
    report,
    candles
  );

  const smc = calculateSMCScores(
    structure,
    candles
  );

  renderLevels(timeframe, levels);
  renderSMC(timeframe, smc);

  const status = getElement(TIMEFRAMES[timeframe].status);

  if (status) {
    status.textContent +=
      ` | Master Analysis: ${candles.length} ऐतिहासिक कैंडल्स जाँची गईं।`;
  }

  return {
    status: "OK",
    timeframe,
    candleCount: candles.length,
    historicalTrend: levels.trend,
    levels,
    smc
  };
}

// ------------------------------------------------------
// DATA LOADING
// ------------------------------------------------------

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

    analyzeTimeframe(timeframe, candles);
    return true;

  } catch (error) {
    console.warn(
      `${timeframe} saved master data error:`,
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

  analyzeTimeframe(timeframe, candles);
  return true;
}

// ------------------------------------------------------
// INITIALIZATION
// ------------------------------------------------------

async function initializeTimeframe(timeframe) {
  prepareDashboard(timeframe);

  try {
    const loaded = await loadCloudflareData(timeframe);

    if (loaded) return;

    if (loadSavedData(timeframe)) return;

    renderLevels(timeframe, {
      trend: "WAITING_FOR_DATA",
      currentPrice: NaN,
      levels: []
    });

    renderSMC(timeframe, {
      entryScore: 0,
      exitScore: 0,
      entryEvidence: 0,
      exitEvidence: 0,
      totalChecks: 4
    });

  } catch (error) {
    console.warn(
      `${timeframe} master initialization error:`,
      error
    );

    if (loadSavedData(timeframe)) return;

    renderLevels(timeframe, {
      trend: "WAITING_FOR_DATA",
      currentPrice: NaN,
      levels: []
    });

    renderSMC(timeframe, {
      entryScore: 0,
      exitScore: 0,
      entryEvidence: 0,
      exitEvidence: 0,
      totalChecks: 4
    });
  }
}

// ------------------------------------------------------
// FILE IMPORT LISTENER
// ------------------------------------------------------

function setupFileImport(timeframe) {
  const config = TIMEFRAMES[timeframe];
  const input = getElement(config.input);

  if (!input) return;

  input.addEventListener("change", async event => {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const imported = parseHistoricalDataText(
        await file.text(),
        file.name,
        timeframe
      );

      if (imported.status !== "OK") {
        throw new Error(imported.error);
      }

      analyzeTimeframe(
        timeframe,
        imported.candles
      );

    } catch (error) {
      console.error(
        `${timeframe} master import error:`,
        error
      );

      renderLevels(timeframe, {
        trend: "INSUFFICIENT_DATA",
        currentPrice: NaN,
        levels: []
      });
    }
  });
}

// ------------------------------------------------------
// START
// ------------------------------------------------------

for (const timeframe of ["1d", "15m"]) {
  prepareDashboard(timeframe);
  setupFileImport(timeframe);
}

initializeTimeframe("1d");
initializeTimeframe("15m");
