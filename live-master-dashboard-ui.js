
/* ==========================================================
   BADAL SEVERIYA V12
   LIVE MASTER DASHBOARD UI

   - Separate from Historical Master.
   - Displays only validated 1D and 15M live analysis.
   - Requires caller-supplied real candle data.
   - Missing, stale, or invalid data displays WAIT.
   - Shows evidence percentages, not forecasts.
   - Displays ATR-based levels only after validation.
   - Custom indicator source is never executed.
   - No order execution.
   ========================================================== */

import {
  createLiveMasterCustomIndicatorIntegration
} from "./live-master-custom-indicator-integration.js";

import {
  calculateLiveMasterLevels
} from "./live-master-levels.js";

const MODULE = "LIVE_MASTER_DASHBOARD_UI";
const API_NAME = "BADAL_SEVERIYA_LIVE_MASTER";

const DISCLAIMER =
  "Educational live market context only. Not a forecast, trading signal, or financial advice.";

const RULE_LABELS = {
  EMA_TREND: "EMA Trend",
  RSI_MACD_MOMENTUM: "RSI / MACD Momentum",
  VOLUME_SPIKE: "Volume Spike",
  BREAKOUT_BREAKDOWN: "Breakout / Breakdown",
  CANDLE_CLOSE_REJECTION: "Candle Close / Rejection",
  ATR_VOLATILITY: "ATR / Volatility",
  OI_PCR: "Open Interest / PCR",
  EVENT_TIME_WINDOW: "Event / Time Window"
};

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function formatPrice(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    : "—";
}

function formatPercent(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? `${number.toFixed(1)}%`
    : "—";
}

function formatTime(value) {
  const timestamp = Number(value);

  if (!Number.isFinite(timestamp)) return "—";

  try {
    return new Date(timestamp).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "medium"
    });
  } catch {
    return "—";
  }
}

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function createStyles() {
  return `
    #live-master-dashboard {
      margin: 18px 0;
      padding: 18px;
      color: #e2e8f0;
      background: #111c2e;
      border: 1px solid #256079;
      border-radius: 14px;
      font-family: Arial, sans-serif;
    }

    #live-master-dashboard * {
      box-sizing: border-box;
    }

    #live-master-dashboard h2,
    #live-master-dashboard h3,
    #live-master-dashboard h4 {
      margin-top: 0;
    }

    #live-master-dashboard h2 {
      color: #7dd3fc;
      font-size: 20px;
    }

    #live-master-dashboard h3 {
      color: #bae6fd;
      font-size: 17px;
    }

    #live-master-dashboard h4 {
      color: #cbd5e1;
      font-size: 14px;
    }

    #live-master-dashboard .lm-muted {
      color: #94a3b8;
      font-size: 12px;
    }

    #live-master-dashboard .lm-topline {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }

    #live-master-dashboard .lm-status {
      display: inline-block;
      padding: 5px 10px;
      border-radius: 20px;
      background: #334155;
      color: #e2e8f0;
      font-size: 12px;
      font-weight: 700;
    }

    #live-master-dashboard .lm-status.ready {
      background: #14532d;
      color: #bbf7d0;
    }

    #live-master-dashboard .lm-status.wait {
      background: #713f12;
      color: #fef3c7;
    }

    #live-master-dashboard .lm-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }

    #live-master-dashboard .lm-card {
      min-width: 0;
      padding: 14px;
      background: #17263b;
      border: 1px solid #334155;
      border-radius: 12px;
    }

    #live-master-dashboard .lm-metrics,
    #live-master-dashboard .lm-levels,
    #live-master-dashboard .lm-percentages {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin: 12px 0;
    }

    #live-master-dashboard .lm-metric,
    #live-master-dashboard .lm-level,
    #live-master-dashboard .lm-percent {
      min-width: 0;
      padding: 10px 8px;
      background: #0f1929;
      border: 1px solid #334155;
      border-radius: 9px;
    }

    #live-master-dashboard .lm-value {
      display: block;
      margin-top: 5px;
      font-size: 15px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    #live-master-dashboard .lm-label {
      color: #94a3b8;
      font-size: 11px;
    }

    #live-master-dashboard .lm-up {
      color: #4ade80;
    }

    #live-master-dashboard .lm-down {
      color: #f87171;
    }

    #live-master-dashboard .lm-neutral {
      color: #facc15;
    }

    #live-master-dashboard .lm-rules {
      display: grid;
      gap: 7px;
      margin-top: 10px;
    }

    #live-master-dashboard .lm-rule {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 9px;
      background: #0f1929;
      border-radius: 7px;
      font-size: 12px;
    }

    #live-master-dashboard .lm-rule span:last-child {
      text-align: right;
      overflow-wrap: anywhere;
    }

    #live-master-dashboard .lm-reason {
      margin: 10px 0;
      padding: 10px;
      background: #0f1929;
      border-radius: 8px;
      color: #cbd5e1;
      font-size: 12px;
    }

    #live-master-dashboard .lm-custom {
      margin-top: 14px;
    }

    #live-master-dashboard .lm-custom-slot {
      padding: 8px 10px;
      margin-top: 6px;
      border-radius: 7px;
      background: #0f1929;
      font-size: 12px;
    }

    #live-master-dashboard .lm-disclaimer {
      margin: 14px 0 0;
      padding-top: 10px;
      border-top: 1px solid #334155;
      color: #94a3b8;
      font-size: 11px;
      line-height: 1.5;
    }

    @media (max-width: 760px) {
      #live-master-dashboard .lm-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 420px) {
      #live-master-dashboard {
        padding: 12px;
      }

      #live-master-dashboard .lm-metrics,
      #live-master-dashboard .lm-levels,
      #live-master-dashboard .lm-percentages {
        grid-template-columns: 1fr 1fr;
      }
    }
  `;
}

function statusClass(status) {
  return status === "READY" ? "ready" : "wait";
}

function renderCustomIndicators(customResult, slots) {
  const entries = Array.isArray(slots) ? slots : [];

  const results = Array.isArray(customResult?.indicatorResults)
    ? customResult.indicatorResults
    : [];

  const slotHTML = entries.map(slot => {
    if (!slot?.occupied || !slot.indicator) {
      return `
        <div class="lm-custom-slot">
          Slot ${escapeHTML(slot?.slot ?? "—")}: खाली
        </div>
      `;
    }

    const indicator = slot.indicator;

    const result = results.find(
      item => item.indicatorId === indicator.id
    );

    const state = result?.status ||
      (indicator.analysis?.active
        ? "VALIDATION_PENDING"
        : "NOT_ACTIVE");

    return `
      <div class="lm-custom-slot">
        Slot ${escapeHTML(slot.slot)} ·
        <strong>${escapeHTML(indicator.name || "Custom Indicator")}</strong>
        <span class="lm-muted"> — ${escapeHTML(state)}</span>
      </div>
    `;
  }).join("");

  return `
    <div class="lm-custom">
      <h4>Custom Indicators · 3 Slots</h4>

      ${slotHTML || `
        <div class="lm-custom-slot">
          Custom Indicator slots उपलब्ध नहीं हैं।
        </div>
      `}

      <p class="lm-muted">
        केवल validated और analysis-enabled indicators का context शामिल होता है।
        Imported source execute नहीं होता।
      </p>
    </div>
  `;
}

function renderTimeframeCard(timeframe, result, candles) {
  const analysis = result?.liveAnalysis;

  const ready =
    result?.status === "READY" &&
    analysis?.feed?.fresh === true;

  const summary = analysis?.summary;
  const percentages = summary?.evidencePercentages;

  const percentagesValid =
    analysis?.validation?.percentagesTotal100 === true &&
    percentages &&
    [
      percentages.bullish,
      percentages.bearish,
      percentages.neutral
    ].every(value => Number.isFinite(Number(value)));

  const levelsResult = ready
    ? calculateLiveMasterLevels({
        timeframe,
        analysis,
        candles
      })
    : null;

  const levels = levelsResult?.status === "VALID"
    ? levelsResult.levels
    : null;

  const direction = ready
    ? analysis.direction
    : "WAIT";

  const directionClass =
    direction === "BULLISH"
      ? "lm-up"
      : direction === "BEARISH"
        ? "lm-down"
        : "lm-neutral";

  const rules = Array.isArray(analysis?.rules)
    ? analysis.rules
    : [];

  const rulesHTML = rules.map(rule => {
    const label =
      RULE_LABELS[rule.id] || rule.id || "Rule";

    const ruleClass =
      rule.direction === "BULLISH"
        ? "lm-up"
        : rule.direction === "BEARISH"
          ? "lm-down"
          : "lm-neutral";

    return `
      <div class="lm-rule">
        <span>${escapeHTML(label)}</span>
        <span class="${ruleClass}">
          ${escapeHTML(rule.direction || rule.status || "WAIT")}
        </span>
      </div>
    `;
  }).join("");

  const reason = ready
    ? (
        levels
          ? "Levels latest validated candle close और ATR से निकाले गए हैं।"
          : (
              levelsResult?.reason ||
              "Levels के लिए valid directional analysis आवश्यक है।"
            )
      )
    : (
        analysis?.feed?.reason ||
        analysis?.error ||
        result?.customIndicators?.reason ||
        "वास्तविक, fresh live candles की प्रतीक्षा है।"
      );

  return `
    <section class="lm-card" data-timeframe="${timeframe}">

      <div class="lm-topline">
        <h3>${timeframe} Live Analysis</h3>
        <span class="lm-status ${statusClass(ready ? "READY" : "WAIT")}">
          ${ready ? "READY" : "WAIT"}
        </span>
      </div>

      <div class="lm-metrics">
        <div class="lm-metric">
          <span class="lm-label">Direction</span>
          <strong class="lm-value ${directionClass}">
            ${escapeHTML(direction)}
          </strong>
        </div>

        <div class="lm-metric">
          <span class="lm-label">Latest Close</span>
          <strong class="lm-value">
            ${formatPrice(analysis?.market?.close)}
          </strong>
        </div>

        <div class="lm-metric">
          <span class="lm-label">Candles</span>
          <strong class="lm-value">
            ${Number(analysis?.market?.candleCount) || 0}
          </strong>
        </div>
      </div>

      <p class="lm-muted">
        Latest candle:
        ${escapeHTML(formatTime(analysis?.feed?.timestamp))}
      </p>

      <h4>8-Rule Evidence Context</h4>

      ${
        percentagesValid
          ? `
            <div class="lm-percentages">
              <div class="lm-percent">
                <span class="lm-label">Bullish evidence</span>
                <strong class="lm-value lm-up">
                  ${formatPercent(percentages.bullish)}
                </strong>
              </div>

              <div class="lm-percent">
                <span class="lm-label">Bearish evidence</span>
                <strong class="lm-value lm-down">
                  ${formatPercent(percentages.bearish)}
                </strong>
              </div>

              <div class="lm-percent">
                <span class="lm-label">Neutral evidence</span>
                <strong class="lm-value lm-neutral">
                  ${formatPercent(percentages.neutral)}
                </strong>
              </div>
            </div>
          `
          : `
            <p class="lm-muted">
              Evidence percentages अभी उपलब्ध नहीं हैं।
            </p>
          `
      }

      <div class="lm-rules">
        ${
          rulesHTML ||
          `
            <div class="lm-reason">
              8-rule analysis के लिए valid live data की प्रतीक्षा है।
            </div>
          `
        }
      </div>

      <h4 style="margin-top:14px">Dynamic Levels</h4>

      ${
        levels
          ? `
            <div class="lm-levels">
              <div class="lm-level">
                <span class="lm-label">ENTRY</span>
                <strong class="lm-value">
                  ${formatPrice(levels.entry)}
                </strong>
              </div>

              <div class="lm-level">
                <span class="lm-label">TARGET 1</span>
                <strong class="lm-value lm-up">
                  ${formatPrice(levels.target1)}
                </strong>
              </div>

              <div class="lm-level">
                <span class="lm-label">TARGET 2</span>
                <strong class="lm-value lm-up">
                  ${formatPrice(levels.target2)}
                </strong>
              </div>

              <div class="lm-level">
                <span class="lm-label">STOP LOSS</span>
                <strong class="lm-value lm-down">
                  ${formatPrice(levels.stopLoss)}
                </strong>
              </div>

              <div class="lm-level">
                <span class="lm-label">ATR</span>
                <strong class="lm-value">
                  ${formatPrice(levelsResult.atr)}
                </strong>
              </div>

              <div class="lm-level">
                <span class="lm-label">R:R · T1 / T2</span>
                <strong class="lm-value">
                  ${escapeHTML(levelsResult.rewardRisk.target1)}
                  /
                  ${escapeHTML(levelsResult.rewardRisk.target2)}
                </strong>
              </div>
            </div>
          `
          : `
            <div class="lm-reason">
              Levels: WAIT — valid directional analysis और ATR data आवश्यक है।
            </div>
          `
      }

      <div class="lm-reason">
        ${escapeHTML(reason)}
      </div>

      ${renderCustomIndicators(
        result?.customIndicators,
        result?._customSlots
      )}

    </section>
  `;
}

function mount() {
  if (typeof document === "undefined") return null;

  let root = document.getElementById(
    "live-master-dashboard"
  );

  if (root) return root;

  const style = document.createElement("style");

  style.id = "live-master-dashboard-styles";
  style.textContent = createStyles();

  document.head.appendChild(style);

  root = document.createElement("section");
  root.id = "live-master-dashboard";

  root.innerHTML = `
    <div class="lm-topline">
      <div>
        <h2>LIVE MASTER · NIFTY</h2>

        <p class="lm-muted">
          Live Master अलग module है; Historical Master का data
          या परिणाम इसमें forecast की तरह उपयोग नहीं होता।
        </p>
      </div>

      <span id="lm-overall-status" class="lm-status wait">
        WAITING FOR DATA
      </span>
    </div>

    <div id="lm-timeframe-grid" class="lm-grid">

      <section class="lm-card">
        <h3>1D Live Analysis</h3>
        <span class="lm-status wait">WAIT</span>
        <p class="lm-reason">
          वास्तविक 1D live candle feed की प्रतीक्षा है।
        </p>
      </section>

      <section class="lm-card">
        <h3>15M Live Analysis</h3>
        <span class="lm-status wait">WAIT</span>
        <p class="lm-reason">
          वास्तविक 15M live candle feed की प्रतीक्षा है।
        </p>
      </section>

    </div>

    <p class="lm-disclaimer">
      ${escapeHTML(DISCLAIMER)}
      Percentages rule-based evidence distribution हैं,
      भविष्य की संभावना या prediction नहीं।
      कोई order execute नहीं होता।
    </p>
  `;

  const main = document.querySelector("main");

  if (main?.parentNode) {
    main.parentNode.insertBefore(root, main);
  } else {
    document.body.appendChild(root);
  }

  return root;
}

export function initializeLiveMasterDashboardUI(options = {}) {
  const root = mount();

  if (!root) {
    return {
      status: "DOM_UNAVAILABLE",
      module: MODULE
    };
  }

  const storage = options.storage || getStorage();

  const integration =
    createLiveMasterCustomIndicatorIntegration({
      bridgeOptions: { storage }
    });

  let lastPayload = null;
  let lastResult = null;

  function render(payload, result) {
    const grid = root.querySelector("#lm-timeframe-grid");
    const overall = root.querySelector("#lm-overall-status");

    if (!grid || !overall) return;

    const daily = result.timeframes["1D"];
    const intraday = result.timeframes["15M"];

    const customSlots =
      integration.bridge.snapshot().indicators;

    const dailyForRender = {
      ...daily,
      _customSlots: customSlots
    };

    const intradayForRender = {
      ...intraday,
      _customSlots: customSlots
    };

    grid.innerHTML =
      renderTimeframeCard(
        "1D",
        dailyForRender,
        payload.candles1D
      ) +
      renderTimeframeCard(
        "15M",
        intradayForRender,
        payload.candles15M
      );

    const readyCount = [daily, intraday]
      .filter(item => item?.status === "READY")
      .length;

    overall.textContent =
      readyCount === 2
        ? "BOTH TIMEFRAMES READY"
        : readyCount === 1
          ? "PARTIAL · ONE TIMEFRAME READY"
          : "WAITING FOR VALID LIVE DATA";

    overall.className =
      `lm-status ${readyCount > 0 ? "ready" : "wait"}`;
  }

  function update(payload = {}) {
    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    ) {
      return {
        status: "INVALID_INPUT",
        reason: "Update payload must be an object."
      };
    }

    const safePayload = {
      candles1D: Array.isArray(payload.candles1D)
        ? payload.candles1D
        : [],

      candles15M: Array.isArray(payload.candles15M)
        ? payload.candles15M
        : [],

      now: payload.now,
      maxAgeMs1D: payload.maxAgeMs1D,
      maxAgeMs15M: payload.maxAgeMs15M,

      externalEvidence1D: payload.externalEvidence1D,
      externalEvidence15M: payload.externalEvidence15M
    };

    const result =
      integration.analyzeBothTimeframes(safePayload);

    lastPayload = safePayload;
    lastResult = result;

    render(safePayload, result);

    return result;
  }

  function refresh() {
    return lastPayload
      ? update(lastPayload)
      : {
          status: "WAITING_FOR_DATA",
          reason: "No real candle payload has been supplied."
        };
  }

  function validateCustomIndicators() {
    return integration.bridge.validateAll();
  }

  function snapshot() {
    return {
      status: lastResult?.status || "WAITING_FOR_DATA",
      module: MODULE,
      lastAnalysis: lastResult,

      integration: integration.snapshot(),

      customIndicators:
        integration.bridge.snapshot(),

      safety: {
        timeframeFallback: false,
        importedSourceExecuted: false,
        arbitraryCodeExecution: false,
        orderExecution: false,
        syntheticCandlesCreated: false
      },

      disclaimer: DISCLAIMER
    };
  }

  const api = {
    update,
    refresh,
    snapshot,
    validateCustomIndicators,

    listCustomIndicators: () =>
      integration.bridge.listIndicators(),

    config: {
      module: MODULE,
      supportedTimeframes: ["1D", "15M"],
      requiresRealCandlePayload: true,
      maximumCustomIndicators: 3,
      timeframeFallback: false,
      orderExecution: false
    }
  };

  try {
    window[API_NAME] = api;

    window.addEventListener(
      "badal:live-master-update",
      event => {
        update(event.detail || {});
      }
    );
  } catch {
    // Dashboard remains visible in WAIT mode if globals are blocked.
  }

  return {
    status: "READY",
    module: MODULE,
    api
  };
}

if (typeof document !== "undefined") {
  initializeLiveMasterDashboardUI();
}
