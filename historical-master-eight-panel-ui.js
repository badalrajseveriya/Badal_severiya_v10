// ======================================================
// BADAL SEVERIYA V12
// MASTER EIGHT-PANEL HISTORICAL UI
// 1D + 15M | Historical Educational Analysis Only
// ======================================================

import { parseHistoricalDataText } from "./historical-data-import.js";
import { generateHistoricalReport } from "./historical-analysis-report.js";
import { analyzeMarket } from "./market-data.js";
import { analyzeMarketStructure } from "./market-structure.js";
import { fetchHistoricalCandlePages } from "./historical-candle-pagination.js";

const API_BASE = "https://badal-severiya-data.mrstarrdbs.workers.dev";
const MAX_CLOUD_CANDLES = 25000;
const API_PAGE_SIZE = 5000;
const NOTE = "केवल ऐतिहासिक शैक्षणिक विश्लेषण। यह भविष्यवाणी, ट्रेडिंग सलाह या लाइव सिग्नल नहीं है।";

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
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "उपलब्ध नहीं";
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "N/A";
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function makeCard(title, value, color, description) {
  const card = createElement("section", "master-eight-card");
  card.style.cssText = `background:${COLORS.panel};border:1px solid ${COLORS.border};border-radius:10px;padding:12px;min-width:0;text-align:center;`;
  const heading = createElement("div", "", title);
  heading.style.cssText = `color:${color};font-weight:bold;font-size:13px;margin-bottom:8px;`;
  const result = createElement("div", "", value);
  result.style.cssText = `color:${COLORS.text};font-size:18px;font-weight:bold;overflow-wrap:anywhere;`;
  const note = createElement("div", "", description);
  note.style.cssText = `color:${COLORS.muted};font-size:11px;line-height:1.5;margin-top:7px;`;
  card.append(heading, result, note);
  return card;
}

function makeSection(title) {
  const section = createElement("section", "master-eight-section");
  section.style.cssText = `margin-top:13px;padding:12px;background:#0b1220;border:1px solid ${COLORS.border};border-radius:10px;`;
  const heading = createElement("h4", "", title);
  heading.style.cssText = "margin:0 0 11px;color:#7dd3fc;font-size:14px;";
  section.appendChild(heading);
  return section;
}

function prepareDashboard(timeframe) {
  const config = TIMEFRAMES[timeframe];
  const summary = getElement(config.summary);
  if (!summary) return null;

  let container = summary.querySelector(".master-eight-container");
  if (container) return container;

  const oldReferenceGrid = summary.querySelector(".reference-grid");
  if (oldReferenceGrid) oldReferenceGrid.style.display = "none";

  container = createElement("div", "master-eight-container");
  container.style.marginTop = "12px";

  const factorSection = makeSection("EIGHT-RULE MARKET FACTOR PANEL — Historical Data");
  const factorContainer = createElement("div", "master-factor-container");
  factorContainer.style.cssText = "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;";
  factorSection.appendChild(factorContainer);

  const levelsSection = makeSection("ENTRY • STOP LOSS • TARGET — Historical Reference Levels");
  const levelsContainer = createElement("div", "master-levels-container");
  levelsContainer.style.cssText = "display:grid;grid-template-columns:1fr;gap:8px;";
  levelsSection.appendChild(levelsContainer);

  const smcSection = makeSection("SMART MONEY ACTIVITY — Historical SMC Pattern Scores");
  const smcContainer = createElement("div", "master-smc-container");
  smcContainer.style.cssText = "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;";
  smcSection.appendChild(smcContainer);

  container.append(factorSection, levelsSection, smcSection);
  const percentageGrid = summary.querySelector(".percentage-grid");
  if (percentageGrid) percentageGrid.after(container);
  else summary.appendChild(container);
  return container;
}

function nearestBelow(zones, price) {
  return zones
    .filter(zone => Number.isFinite(zone?.price) && zone.price < price)
    .sort((a, b) => b.price - a.price)[0] ?? null;
}

function nearestAbove(zones, price) {
  return zones
    .filter(zone => Number.isFinite(zone?.price) && zone.price > price)
    .sort((a, b) => a.price - b.price)[0] ?? null;
}

function calculateHistoricalLevels(report, candles) {
  const structure = report.sections.marketStructure;
  const sr = report.sections.supportResistance;
  const currentPrice = candles[candles.length - 1].close;
  const supports = Array.isArray(sr.supports) ? sr.supports : [];
  const resistances = Array.isArray(sr.resistances) ? sr.resistances : [];
  const support = nearestBelow(supports, currentPrice);
  const resistance = nearestAbove(resistances, currentPrice);
  const trend = structure.trend ?? "UNKNOWN";

  if (trend === "BULLISH") {
    return {
      trend,
      currentPrice,
      levels: [
        { name: "TARGET", price: resistance?.price, color: COLORS.bullish, description: "ऐतिहासिक ऊपरी Resistance क्षेत्र; न मिले तो उपलब्ध नहीं" },
        { name: "ENTRY REFERENCE", price: support?.price, color: COLORS.entry, description: "ऐतिहासिक निचला Support क्षेत्र; वास्तविक Entry आदेश नहीं" },
        { name: "STOP-LOSS REFERENCE", price: support?.lower, color: COLORS.bearish, description: "ऐतिहासिक Support Zone की निचली सीमा; वास्तविक Stop Loss नहीं" }
      ]
    };
  }

  if (trend === "BEARISH") {
    return {
      trend,
      currentPrice,
      levels: [
        { name: "STOP-LOSS REFERENCE", price: resistance?.upper, color: COLORS.bearish, description: "ऐतिहासिक Resistance Zone की ऊपरी सीमा; वास्तविक Stop Loss नहीं" },
        { name: "ENTRY REFERENCE", price: resistance?.price, color: COLORS.entry, description: "ऐतिहासिक ऊपरी Resistance क्षेत्र; वास्तविक Entry आदेश नहीं" },
        { name: "TARGET", price: support?.price, color: COLORS.bullish, description: "ऐतिहासिक निचला Support क्षेत्र" }
      ]
    };
  }
  return { trend: "UNKNOWN", currentPrice, levels: [] };
}

function isPriceInsideZone(price, zone) {
  return Number.isFinite(zone?.lower) && Number.isFinite(zone?.upper) &&
    zone.lower <= zone.upper && price >= zone.lower && price <= zone.upper;
}

function recentDirectionalEvent(events, direction, candles) {
  const recentStart = Math.max(0, candles.length - 20);
  return events.some(event => event?.direction === direction &&
    Number.isInteger(event.index) && event.index >= recentStart && event.index < candles.length);
}

function calculateSMCScores(structure, candles) {
  const current = candles[candles.length - 1];
  const price = current.close;
  const orderBlocks = structure.orderBlocks ?? [];
  const gaps = structure.fairValueGaps ?? [];
  const liquidity = structure.liquidity ?? [];
  const events = structure.structureEvents ?? [];

  const bullishOB = orderBlocks.some(zone => zone.type === "BULLISH_ORDER_BLOCK" && isPriceInsideZone(price, zone));
  const bearishOB = orderBlocks.some(zone => zone.type === "BEARISH_ORDER_BLOCK" && isPriceInsideZone(price, zone));
  const bullishFVG = gaps.some(zone => zone.type === "BULLISH_FVG" && zone.status === "UNMITIGATED_IN_AVAILABLE_HISTORY" && isPriceInsideZone(price, zone));
  const bearishFVG = gaps.some(zone => zone.type === "BEARISH_FVG" && zone.status === "UNMITIGATED_IN_AVAILABLE_HISTORY" && isPriceInsideZone(price, zone));
  const bullishEvent = recentDirectionalEvent(events, "BULLISH", candles);
  const bearishEvent = recentDirectionalEvent(events, "BEARISH", candles);
  const nearEqualLows = liquidity.some(zone => zone.type === "EQUAL_LOWS" && Number.isFinite(zone.price) && zone.price !== 0 && Math.abs(zone.price - current.low) / Math.abs(zone.price) <= 0.002);
  const nearEqualHighs = liquidity.some(zone => zone.type === "EQUAL_HIGHS" && Number.isFinite(zone.price) && zone.price !== 0 && Math.abs(zone.price - current.high) / Math.abs(zone.price) <= 0.002);

  const entryChecks = [bullishOB, bullishFVG, bullishEvent, nearEqualLows];
  const exitChecks = [bearishOB, bearishFVG, bearishEvent, nearEqualHighs];
  return {
    status: "OK",
    entryScore: entryChecks.filter(Boolean).length * 25,
    exitScore: exitChecks.filter(Boolean).length * 25,
    entryEvidence: entryChecks.filter(Boolean).length,
    exitEvidence: exitChecks.filter(Boolean).length,
    totalChecks: 4
  };
}

function factorRow(title, value, color, description) {
  return makeCard(title, value, color, description);
}

function buildFactorRows(market, report, candles) {
  const indicators = market?.indicators ?? {};
  const latest = candles[candles.length - 1];
  const supportZones = report.sections.supportResistance.supports ?? [];
  const resistanceZones = report.sections.supportResistance.resistances ?? [];
  const support = nearestBelow(supportZones, latest.close);
  const resistance = nearestAbove(resistanceZones, latest.close);

  const emaValues = [indicators.ema9, indicators.ema21, indicators.ema50, indicators.ema200];
  let emaValue = "N/A";
  let emaColor = COLORS.neutral;
  let emaNote = "EMA डेटा उपलब्ध नहीं";
  if (emaValues.every(Number.isFinite)) {
    if (indicators.ema9 > indicators.ema21 && indicators.ema21 > indicators.ema50 && indicators.ema50 > indicators.ema200) {
      emaValue = "BULLISH ALIGNMENT"; emaColor = COLORS.bullish;
    } else if (indicators.ema9 < indicators.ema21 && indicators.ema21 < indicators.ema50 && indicators.ema50 < indicators.ema200) {
      emaValue = "BEARISH ALIGNMENT"; emaColor = COLORS.bearish;
    } else { emaValue = "MIXED"; }
    emaNote = `EMA 9: ${formatNumber(indicators.ema9)} | 21: ${formatNumber(indicators.ema21)} | 50: ${formatNumber(indicators.ema50)} | 200: ${formatNumber(indicators.ema200)}`;
  }

  const rsi = indicators.rsi14;
  const histogram = indicators.macd?.histogram;
  let momentumValue = "N/A";
  let momentumColor = COLORS.neutral;
  if (Number.isFinite(rsi) && Number.isFinite(histogram)) {
    if (rsi > 55 && histogram > 0) { momentumValue = "POSITIVE"; momentumColor = COLORS.bullish; }
    else if (rsi < 45 && histogram < 0) { momentumValue = "NEGATIVE"; momentumColor = COLORS.bearish; }
    else momentumValue = "MIXED / NEUTRAL";
  }
  const momentumNote = `RSI 14: ${formatNumber(rsi)} | MACD Histogram: ${formatNumber(histogram, 4)}`;

  const volume = indicators.volume ?? {};
  let volumeValue = "N/A";
  let volumeColor = COLORS.neutral;
  let volumeNote = "इस timeframe के लिए भरोसेमंद Volume डेटा उपलब्ध नहीं";
  if (volume.available === true && Number.isFinite(volume.relativeVolume)) {
    if (volume.relativeVolume >= 1.5) { volumeValue = "VOLUME SPIKE"; volumeColor = COLORS.bullish; }
    else if (volume.relativeVolume >= 1) volumeValue = "ABOVE / NEAR BASELINE";
    else { volumeValue = "BELOW BASELINE"; volumeColor = COLORS.neutral; }
    volumeNote = `Relative Volume: ${formatNumber(volume.relativeVolume, 3)}× | Current: ${formatNumber(volume.current, 0)} | 20-candle average: ${formatNumber(volume.average20, 0)}`;
  }

  const previous = candles.length > 1 ? candles[candles.length - 2] : null;
  const bullishBreak = previous && resistanceZones.some(zone =>
    Number.isFinite(zone?.upper) && previous.close <= zone.upper && latest.close > zone.upper
  );
  const bearishBreak = previous && supportZones.some(zone =>
    Number.isFinite(zone?.lower) && previous.close >= zone.lower && latest.close < zone.lower
  );
  let srValue = "NO NEW BREAKOUT ON LATEST CANDLE";
  let srColor = COLORS.neutral;
  if (bullishBreak) { srValue = "BULLISH RESISTANCE BREAK"; srColor = COLORS.bullish; }
  else if (bearishBreak) { srValue = "BEARISH SUPPORT BREAK"; srColor = COLORS.bearish; }
  let srNote = `Nearest support: ${support ? formatPrice(support.price) : "N/A"} | Nearest resistance: ${resistance ? formatPrice(resistance.price) : "N/A"}`;
  if (support && resistance) srNote += " | कीमत ऐतिहासिक क्षेत्रों के बीच है, जब तक नवीनतम candle किसी zone को cross न करे";
  else if (support) srNote += " | ऊपर की Resistance उपलब्ध इतिहास में नहीं मिली";
  else if (resistance) srNote += " | नीचे का Support उपलब्ध इतिहास में नहीं मिला";

  const quality = market?.latestCandleQuality ?? {};
  const candleType = quality.candleType ?? "N/A";
  const candleColor = candleType.includes("BULLISH") || candleType === "LONG_LOWER_WICK" ? COLORS.bullish :
    candleType.includes("BEARISH") || candleType === "LONG_UPPER_WICK" ? COLORS.bearish : COLORS.neutral;
  const candleNote = `Open ${formatPrice(latest.open)} | High ${formatPrice(latest.high)} | Low ${formatPrice(latest.low)} | Close ${formatPrice(latest.close)} | Body ${(Number.isFinite(quality.bodyRatio) ? quality.bodyRatio * 100 : 0).toFixed(1)}%`;

  const atr = indicators.atr14;
  const atrPercent = Number.isFinite(atr) && latest.close > 0 ? atr / latest.close * 100 : null;
  const atrNote = `ATR 14: ${formatNumber(atr)} (${formatNumber(atrPercent)}% of close) | Bollinger width: ${formatNumber(indicators.bollingerBands?.widthPercent)}% | India VIX: N/A — source not connected`;

  return [
    factorRow("1. EMA TREND", emaValue, emaColor, emaNote),
    factorRow("2. RSI + MACD MOMENTUM", momentumValue, momentumColor, momentumNote),
    factorRow("3. VOLUME SPIKE", volumeValue, volumeColor, volumeNote),
    factorRow("4. SUPPORT / RESISTANCE", srValue, srColor, srNote),
    factorRow("5. LATEST CANDLE / CLOSE", candleType, candleColor, candleNote),
    factorRow("6. ATR / VOLATILITY", Number.isFinite(atr) ? `${formatNumber(atr)} ATR` : "N/A", COLORS.neutral, atrNote),
    factorRow("7. OI + PCR", "N/A — NOT CONNECTED", COLORS.neutral, "Open Interest और Put-Call Ratio का बाहरी स्रोत अभी जोड़ा नहीं गया है।"),
    factorRow("8. NEWS / EVENT / FII-DII", "N/A — NOT CONNECTED", COLORS.neutral, "News, Event Calendar और FII/DII डेटा का बाहरी स्रोत अभी जोड़ा नहीं गया है।")
  ];
}

function renderFactors(timeframe, market, report, candles) {
  prepareDashboard(timeframe);
  const summary = getElement(TIMEFRAMES[timeframe].summary);
  const container = summary?.querySelector(".master-factor-container");
  if (!container) return;
  container.replaceChildren();

  if (!market || market.status !== "OK") {
    container.append(factorRow("TECHNICAL FACTORS", "N/A", COLORS.neutral, market?.error || "Indicator data is not available."));
  } else {
    for (const row of buildFactorRows(market, report, candles)) container.appendChild(row);
  }

  const note = createElement("p", "", "ये आठों जाँचें उपलब्ध ऐतिहासिक डेटा का वर्णन करती हैं; इनका प्रतिशत भविष्य की संभावना नहीं है। बाहरी स्रोत जुड़ने तक OI/PCR, India VIX, News/Event और FII/DII N/A रहेंगे।");
  note.style.cssText = "grid-column:1/-1;color:#94a3b8;font-size:11px;line-height:1.5;margin:8px 0 0;";
  container.appendChild(note);
}

function renderLevels(timeframe, result) {
  prepareDashboard(timeframe);
  const summary = getElement(TIMEFRAMES[timeframe].summary);
  const container = summary?.querySelector(".master-levels-container");
  if (!container) return;
  container.replaceChildren();

  const trendLabel = createElement("p", "", `ऐतिहासिक दिशा: ${result.trend} | अंतिम उपलब्ध बंद भाव: ${formatPrice(result.currentPrice)}`);
  trendLabel.style.cssText = `color:${COLORS.muted};font-size:12px;margin:0 0 10px;`;
  container.appendChild(trendLabel);

  if (!result.levels.length) {
    const message = createElement("p", "", "ऐतिहासिक दिशा स्पष्ट नहीं है। Reference levels उपलब्ध नहीं हैं।");
    message.style.color = COLORS.neutral;
    container.appendChild(message);
  } else {
    for (const level of result.levels) {
      const value = Number.isFinite(level.price) ? formatPrice(level.price) : "ऐतिहासिक स्तर उपलब्ध नहीं";
      container.appendChild(makeCard(level.name, value, level.color, level.description));
    }
  }
  const note = createElement("p", "", "ये केवल पुराने डेटा से निकले Support/Resistance reference हैं। इन्हें live Entry, Stop Loss या Target आदेश न समझें।");
  note.style.cssText = "color:#94a3b8;font-size:11px;line-height:1.5;margin:8px 0 0;";
  container.appendChild(note);
}

function renderSMC(timeframe, result) {
  prepareDashboard(timeframe);
  const summary = getElement(TIMEFRAMES[timeframe].summary);
  const container = summary?.querySelector(".master-smc-container");
  if (!container) return;
  container.replaceChildren();

  if (result.status !== "OK") {
    container.append(
      makeCard("SMART MONEY ENTRY", "N/A", COLORS.neutral, "ऐतिहासिक SMC डेटा उपलब्ध नहीं — WAITING_FOR_DATA"),
      makeCard("SMART MONEY EXIT", "N/A", COLORS.neutral, "ऐतिहासिक SMC डेटा उपलब्ध नहीं — WAITING_FOR_DATA")
    );
  } else {
    container.append(
      makeCard("SMART MONEY ENTRY", `${result.entryScore}%`, COLORS.bullish, `ऐतिहासिक Entry-जैसे पैटर्न: ${result.entryEvidence}/${result.totalChecks} जाँचें पूरी`),
      makeCard("SMART MONEY EXIT", `${result.exitScore}%`, COLORS.bearish, `ऐतिहासिक Exit-जैसे पैटर्न: ${result.exitEvidence}/${result.totalChecks} जाँचें पूरी`)
    );
  }
  const note = createElement("p", "", "यह चार ऐतिहासिक SMC शर्तों का मेल है; वास्तविक संस्थागत ऑर्डर फ्लो या भविष्य की संभावना नहीं।");
  note.style.cssText = "grid-column:1/-1;color:#94a3b8;font-size:11px;line-height:1.5;margin:8px 0 0;";
  container.appendChild(note);
}

function analyzeTimeframe(timeframe, candles) {
  const report = generateHistoricalReport({ candles, timeframe }, { maxCandles: MAX_CLOUD_CANDLES });
  if (!report || report.status !== "OK") throw new Error(report?.error || "Historical report failed.");
  if (report.dataType !== "HISTORICAL_ONLY") throw new Error("Unexpected data type.");

  const structure = analyzeMarketStructure(candles);
  if (!structure || structure.status !== "OK") throw new Error("SMC historical analysis failed.");

  const market = analyzeMarket({ candles, timeframe }, { maxCandles: MAX_CLOUD_CANDLES });
  const levels = calculateHistoricalLevels(report, candles);
  const smc = calculateSMCScores(structure, candles);

  renderFactors(timeframe, market, report, candles);
  renderLevels(timeframe, levels);
  renderSMC(timeframe, smc);

  const status = getElement(TIMEFRAMES[timeframe].status);
  if (status) status.textContent += ` | Master Analysis: ${candles.length} ऐतिहासिक कैंडल्स जाँची गईं।`;

  return { status: "OK", timeframe, candleCount: candles.length, historicalTrend: levels.trend, levels, smc, marketStatus: market.status };
}

function parseCandles(candles, timeframe, filename) {
  const imported = parseHistoricalDataText(JSON.stringify(candles), filename, timeframe, { maxCandles: MAX_CLOUD_CANDLES });
  if (imported.status !== "OK") throw new Error(imported.error);
  return imported.candles;
}

function loadSavedData(timeframe) {
  const config = TIMEFRAMES[timeframe];
  try {
    const savedText = localStorage.getItem(config.storageKey);
    if (!savedText) return false;
    const saved = JSON.parse(savedText);
    if (!saved || !Array.isArray(saved.candles) || saved.timeframe !== timeframe) return false;
    const candles = parseCandles(saved.candles, timeframe, "saved-historical-data.json");
    analyzeTimeframe(timeframe, candles);
    return true;
  } catch (error) {
    console.warn(`${timeframe} saved master data error:`, error);
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
  if (!fetched || fetched.status !== "OK") throw new Error(fetched?.error || "Cloudflare historical pagination failed.");
  if (!Array.isArray(fetched.candles)) throw new Error("Cloudflare API ने सही candle array नहीं दिया।");
  if (fetched.candles.length === 0) return false;

  const candles = parseCandles(fetched.candles, timeframe, `cloudflare-${timeframe}.json`);
  analyzeTimeframe(timeframe, candles);

  const status = getElement(TIMEFRAMES[timeframe].status);
  if (status) {
    status.textContent += ` | API Pages: ${fetched.pageCount} | ${fetched.candleCount} कैंडल्स` +
      (fetched.truncated ? " | पुराने डेटा के कुछ पेज बाकी हैं" : " | सभी उपलब्ध पेज लोड");
  }
  return true;
}

function renderWaitingState(timeframe) {
  renderFactors(timeframe, null, null, []);
  renderLevels(timeframe, { trend: "WAITING_FOR_DATA", currentPrice: NaN, levels: [] });
  renderSMC(timeframe, { status: "WAITING_FOR_DATA" });
}

async function initializeTimeframe(timeframe) {
  prepareDashboard(timeframe);
  try {
    const loaded = await loadCloudflareData(timeframe);
    if (loaded) return;
    if (loadSavedData(timeframe)) return;
    renderWaitingState(timeframe);
  } catch (error) {
    console.warn(`${timeframe} master initialization error:`, error);
    if (loadSavedData(timeframe)) return;
    renderWaitingState(timeframe);
  }
}

function setupFileImport(timeframe) {
  const config = TIMEFRAMES[timeframe];
  const input = getElement(config.input);
  if (!input) return;
  input.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = parseHistoricalDataText(await file.text(), file.name, timeframe, { maxCandles: MAX_CLOUD_CANDLES });
      if (imported.status !== "OK") throw new Error(imported.error);
      analyzeTimeframe(timeframe, imported.candles);
    } catch (error) {
      console.error(`${timeframe} master import error:`, error);
      renderWaitingState(timeframe);
      const status = getElement(config.status);
      if (status) status.textContent = `Import error: ${error.message}`;
    }
  });
}

for (const timeframe of ["1d", "15m"]) {
  prepareDashboard(timeframe);
  setupFileImport(timeframe);
}

initializeTimeframe("1d");
initializeTimeframe("15m");