
const API_BASE =
  "https://badal-severiya-data.mrstarrdbs.workers.dev";

const INDEX = "NIFTY";
const PAGE_SIZE = 5000;
const MAX_OFFSET = 10000000;

const TIMEFRAMES = [
  { value: "15m", label: "15 मिनट (15M)" },
  { value: "1d", label: "1 दिन (1D)" }
];

function element(tag, text, className) {
  const node = document.createElement(tag);

  if (text !== undefined) {
    node.textContent = text;
  }

  if (className) {
    node.className = className;
  }

  return node;
}

function formatDate(value) {
  if (!value) return "उपलब्ध नहीं";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function getLocalDashboardCount(timeframe) {
  const key =
    "badal-severiya-v12-historical-import-" + timeframe;

  try {
    const saved = localStorage.getItem(key);

    if (!saved) return 0;

    const parsed = JSON.parse(saved);

    return Array.isArray(parsed.candles)
      ? parsed.candles.length
      : 0;
  } catch {
    return 0;
  }
}

async function readDatabaseTimeframe(timeframe) {
  let offset = 0;
  let pagesRead = 0;
  let totalCandles = 0;
  let earliest = null;
  let latest = null;

  while (true) {
    if (offset > MAX_OFFSET) {
      throw new Error(
        "API की अधिकतम pagination सीमा पार हो गई।"
      );
    }

    const params = new URLSearchParams({
      index: INDEX,
      timeframe,
      limit: String(PAGE_SIZE),
      offset: String(offset)
    });

    const response = await fetch(
      API_BASE + "/api/data/candles?" + params.toString(),
      {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        "HTTP " + response.status +
        " — " + timeframe + " डेटा नहीं पढ़ा जा सका।"
      );
    }

    const payload = await response.json();

    if (
      !payload ||
      payload.index !== INDEX ||
      payload.timeframe !== timeframe ||
      !Array.isArray(payload.candles)
    ) {
      throw new Error(
        "API response गलत है: " + timeframe
      );
    }

    const candles = payload.candles;

    pagesRead++;
    totalCandles += candles.length;

    for (const candle of candles) {
      const timestamp = candle.timestamp;

      if (
        typeof timestamp !== "string" ||
        !Number.isFinite(Date.parse(timestamp))
      ) {
        throw new Error(
          "गलत candle timestamp मिला: " + timeframe
        );
      }

      if (
        earliest === null ||
        Date.parse(timestamp) < Date.parse(earliest)
      ) {
        earliest = timestamp;
      }

      if (
        latest === null ||
        Date.parse(timestamp) > Date.parse(latest)
      ) {
        latest = timestamp;
      }
    }

    if (payload.hasMore !== true) {
      break;
    }

    if (candles.length === 0) {
      throw new Error(
        "API ने खाली पेज के साथ hasMore=true भेजा।"
      );
    }

    offset += PAGE_SIZE;
  }

  return {
    timeframe,
    totalCandles,
    pagesRead,
    earliest,
    latest,
    dashboardCacheCount:
      getLocalDashboardCount(timeframe)
  };
}

function createDatabasePanel() {
  const panel = element("section");
  panel.id = "database-status-panel";

  panel.style.cssText = [
    "padding:16px",
    "margin:16px 0",
    "background:#172338",
    "border:1px solid #334155",
    "border-radius:12px",
    "color:#f1f5f9"
  ].join(";");

  const heading = element(
    "h2",
    "CLOUDFLARE DATABASE STATUS"
  );

  heading.style.color = "#7dd3fc";

  const description = element(
    "p",
    "NIFTY का पूरा ऐतिहासिक डेटा पेज-दर-पेज पढ़कर जाँचा जाएगा।"
  );

  description.style.cssText =
    "color:#cbd5e1;font-size:13px;line-height:1.5";

  const status = element(
    "p",
    "Database जाँच शुरू होने की प्रतीक्षा है।"
  );

  status.id = "database-status-message";
  status.style.color = "#fbbf24";

  const results = element("div");
  results.id = "database-status-results";

  const button = element(
    "button",
    "REFRESH DATABASE STATUS"
  );

  button.type = "button";
  button.style.cssText = [
    "width:100%",
    "padding:13px",
    "margin-top:12px",
    "border:0",
    "border-radius:8px",
    "background:#2563eb",
    "color:white",
    "font-size:15px",
    "font-weight:bold"
  ].join(";");

  button.addEventListener("click", runDatabaseCheck);

  panel.append(
    heading,
    description,
    status,
    results,
    button
  );

  return panel;
}

function renderTimeframeResult(parent, result) {
  const card = element("section");

  card.style.cssText = [
    "margin-top:12px",
    "padding:13px",
    "background:#0b1220",
    "border:1px solid #475569",
    "border-radius:10px"
  ].join(";");

  const heading = element(
    "h3",
    result.timeframe === "15m"
      ? "NIFTY — 15 MINUTES"
      : "NIFTY — DAILY"
  );

  heading.style.color = "#7dd3fc";

  const lines = [
    ["Database में कुल candles", result.totalCandles],
    ["पढ़े गए pages", result.pagesRead],
    ["सबसे पुरानी candle", formatDate(result.earliest)],
    ["सबसे नई candle", formatDate(result.latest)],
    [
      "Dashboard में स्थानीय रूप से सेव",
      result.dashboardCacheCount
    ]
  ];

  card.appendChild(heading);

  for (const [label, value] of lines) {
    const line = element(
      "p",
      label + ": " + value
    );

    line.style.cssText =
      "font-size:13px;color:#cbd5e1;overflow-wrap:anywhere";

    card.appendChild(line);
  }

  parent.appendChild(card);
}

async function runDatabaseCheck() {
  const status =
    document.getElementById("database-status-message");

  const results =
    document.getElementById("database-status-results");

  const button =
    document.querySelector(
      "#database-status-panel button"
    );

  if (!status || !results || !button) return;

  button.disabled = true;
  status.textContent = "Cloudflare Database जाँचा जा रहा है...";
  status.style.color = "#fbbf24";
  results.replaceChildren();

  try {
    const healthResponse = await fetch(
      API_BASE + "/api/health",
      {
        method: "GET",
        cache: "no-store"
      }
    );

    if (!healthResponse.ok) {
      throw new Error(
        "Database health check HTTP " +
        healthResponse.status
      );
    }

    const health = await healthResponse.json();

    if (health.status !== "OK") {
      throw new Error(
        "Cloudflare Database connected नहीं है।"
      );
    }

    status.textContent =
      "Database connected. पूरा डेटा पढ़ा जा रहा है...";

    const allResults = [];

    for (const item of TIMEFRAMES) {
      status.textContent =
        item.label + " का पूरा डेटा पढ़ा जा रहा है...";

      const result = await readDatabaseTimeframe(
        item.value
      );

      allResults.push(result);
      renderTimeframeResult(results, result);
    }

    status.textContent =
      "सफलता: Database की दोनों टाइमफ्रेम जाँच पूरी हुई।";

    status.style.color = "#86efac";

    const note = element(
      "p",
      "नोट: Database की कुल संख्या पूरे pagination से मिली है। Dashboard का स्थानीय cache अलग संख्या दिखा सकता है।"
    );

    note.style.cssText =
      "font-size:12px;color:#94a3b8;line-height:1.5";

    results.appendChild(note);

    console.info(
      "BADAL DATABASE STATUS:",
      allResults
    );

  } catch (error) {
    status.textContent =
      "ERROR: " + (error.message || String(error));

    status.style.color = "#fca5a5";

    console.error(
      "Database status check failed:",
      error
    );
  } finally {
    button.disabled = false;
  }
}

function initializeDatabasePanel() {
  if (
    document.getElementById("database-status-panel")
  ) {
    return;
  }

  const header = document.querySelector("header");

  if (!header) {
    console.error("Dashboard header नहीं मिला।");
    return;
  }

  const panel = createDatabasePanel();

  header.insertAdjacentElement("afterend", panel);

  runDatabaseCheck();
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeDatabasePanel,
    { once: true }
  );
} else {
  initializeDatabasePanel();
}
