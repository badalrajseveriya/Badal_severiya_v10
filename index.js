
import { analyzeMarket } from "./market-data.js";

// ================================================
// BADAL SEVERIYA V10.2 - OFFICIAL NEWS ENGINE
// ================================================

const NEWS_DAYS = 30;
const MAX_ITEMS_PER_FEED = 10;
const MAX_TOTAL_NEWS = 50;

const FEEDS = [
  {
    name: "RBI / India Economy",
    category: "RBI Official Press Release",
    url: "https://rbi.org.in/pressreleases_rss.xml"
  },
  {
    name: "SEBI / Market Regulations",
    category: "Regulatory Update",
    url: "https://www.sebi.gov.in/sebirss.xml"
  },
  {
    name: "NSE / Corporate Announcements",
    category: "Company Filing",
    url: "https://archives.nseindia.com/content/RSS/Online_announcements.xml"
  },
  {
    name: "NSE / Financial Results",
    category: "Financial Results",
    url: "https://nsearchives.nseindia.com/content/RSS/Financial_Results.xml"
  },
  {
    name: "Federal Reserve / Global Economy",
    category: "Global Monetary Policy",
    url: "https://www.federalreserve.gov/feeds/press_all.xml"
  }
];

// ================================================
// XML HELPERS
// ================================================

function decodeXml(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(parseInt(code, 16))
    )
    .replace(/&#([0-9]+);/g, (_, code) =>
      String.fromCodePoint(parseInt(code, 10))
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function getTag(xml, name) {
  const pattern = new RegExp(
    `<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}\\s*>`,
    "i"
  );

  const match = String(xml || "").match(pattern);
  return match ? decodeXml(match[1]) : "";
}

function getAtomLink(xml) {
  const links = String(xml || "").match(
    /<(?:[\w.-]+:)?link\b[^>]*>/gi
  ) || [];

  for (const linkTag of links) {
    const rel = linkTag.match(/\brel=["']([^"']+)["']/i);
    const href = linkTag.match(/\bhref=["']([^"']+)["']/i);

    if (href && (!rel || rel[1] === "alternate")) {
      return decodeXml(href[1]);
    }
  }

  return getTag(xml, "link");
}

function extractEntries(xml) {
  const matches = [
    ...String(xml || "").matchAll(
      /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi
    )
  ];

  return matches.map(match => match[2]);
}

// ================================================
// SECURITY HELPERS
// ================================================

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));

    if (url.protocol !== "https:") return "";

    return url.href;
  } catch {
    return "";
  }
}

// ================================================
// DATE HELPERS
// ================================================

function parseNewsDate(value) {
  if (!value) return null;

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : null;
}

function isRecent(timestamp) {
  if (!timestamp) return false;

  const now = Date.now();
  const cutoff = now - NEWS_DAYS * 24 * 60 * 60 * 1000;

  return timestamp >= cutoff &&
    timestamp <= now + 5 * 60 * 1000;
}

function formatNewsDate(timestamp) {
  if (!timestamp) return "Date unavailable";

  return new Date(timestamp).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata"
  }) + " IST";
}

// ================================================
// FETCH ONE NEWS FEED
// ================================================

async function fetchFeed(feed) {
  try {
    const response = await fetch(feed.url, {
      headers: {
        "User-Agent": "BadalSeveriyaNews/2.0",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml"
      },
      cf: {
        cacheTtl: 120,
        cacheEverything: true
      }
    });

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    const xml = await response.text();

    if (!xml || !xml.trim()) {
      throw new Error("Empty feed response");
    }

    const entries = extractEntries(xml);

    if (!entries.length) {
      throw new Error("No RSS or Atom entries found");
    }

    const news = entries.map(entry => {
      const title = getTag(entry, "title");

      const description =
        getTag(entry, "description") ||
        getTag(entry, "summary") ||
        getTag(entry, "content");

      const pubDate =
        getTag(entry, "pubDate") ||
        getTag(entry, "published") ||
        getTag(entry, "updated") ||
        getTag(entry, "date");

      const link = getAtomLink(entry);
      const timestamp = parseNewsDate(pubDate);

      return {
        source: feed.name,
        category: feed.category,
        title,
        description,
        link: safeUrl(link),
        pubDate,
        timestamp,
        label: feed.category,
        tone: "neutral"
      };
    }).filter(item => {
      return (
        item.title &&
        item.timestamp &&
        isRecent(item.timestamp)
      );
    });

    const limitedNews = news
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_ITEMS_PER_FEED);

    return {
      name: feed.name,
      status: limitedNews.length
        ? "CONNECTED"
        : "NO RECENT NEWS",
      count: limitedNews.length,
      error: null,
      items: limitedNews
    };

  } catch (error) {
    return {
      name: feed.name,
      status: "ERROR",
      count: 0,
      error: String(error?.message || "Feed request failed"),
      items: []
    };
  }
}

// ================================================
// FETCH ALL NEWS
// ================================================

async function getNews() {
  const feeds = await Promise.all(
    FEEDS.map(feed => fetchFeed(feed))
  );

  const allItems = feeds.flatMap(feed => feed.items);

  const seenTitles = new Set();
  const seenLinks = new Set();

  const uniqueItems = allItems.filter(item => {
    const titleKey = item.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

    const linkKey = item.link.toLowerCase();

    if (!titleKey) return false;

    if (seenTitles.has(titleKey)) return false;

    if (linkKey && seenLinks.has(linkKey)) return false;

    seenTitles.add(titleKey);

    if (linkKey) {
      seenLinks.add(linkKey);
    }

    return true;
  });

  uniqueItems.sort(
    (a, b) => b.timestamp - a.timestamp
  );

  return {
    updatedAt: new Date().toISOString(),
    feedCount: feeds.length,
    connectedFeeds: feeds.filter(
      feed => feed.status === "CONNECTED"
    ).length,
    totalNews: uniqueItems.length,
    feeds,
    items: uniqueItems.slice(0, MAX_TOTAL_NEWS)
  };
}

// ================================================
// NEWS HTML
// ================================================

function renderNewsItem(item) {
  const link = safeUrl(item.link);

  const titleHtml = link
    ? '<a href="' + escapeHtml(link) +
      '" target="_blank" rel="noopener noreferrer">' +
      escapeHtml(item.title) + '</a>'
    : '<span>' + escapeHtml(item.title) + '</span>';

  return `
    <article class="item">
      <div class="meta">
        ${escapeHtml(item.source)}
        ·
        ${escapeHtml(formatNewsDate(item.timestamp))}
      </div>

      <div class="pill neutral">
        ${escapeHtml(item.category)}
      </div>

      <div class="headline">
        ${titleHtml}
      </div>
    </article>
  `;
}

function renderFeedStatus(feed) {
  const statusClass =
    feed.status === "CONNECTED"
      ? "status-ok"
      : feed.status === "NO RECENT NEWS"
        ? "status-warn"
        : "status-error";

  return `
    <div class="feed-status">
      <div>
        <strong>${escapeHtml(feed.name)}</strong>

        <div class="muted">
          ${feed.count} recent headlines
          ${feed.error ? " · " + escapeHtml(feed.error) : ""}
        </div>
      </div>

      <span class="status ${statusClass}">
        ${escapeHtml(feed.status)}
      </span>
    </div>
  `;
}

// ================================================
// MAIN PAGE
// ================================================

function page(newsData) {
  const items = newsData.items || [];
  const feeds = newsData.feeds || [];

  const newsHtml = items.length
    ? items.map(renderNewsItem).join("")
    : '<p class="empty">No recent headlines available right now.</p>';

  const feedStatusHtml = feeds.length
    ? feeds.map(renderFeedStatus).join("")
    : '<p class="muted">Feed status unavailable.</p>';

  const updatedAt = new Date(
    newsData.updatedAt || Date.now()
  ).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata"
  });

  return `<!doctype html>
<html lang="en">

<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0b1220">

<title>BADAL SEVERIYA V10.2</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #0b1220;
  color: #e8eefc;
  font: 15px system-ui, Arial, sans-serif;
}

header {
  padding: 22px 16px;
  background: #111c30;
  border-bottom: 1px solid #26344d;
}

h1 {
  margin: 0;
  font-size: 23px;
}

header p {
  margin: 7px 0 0;
  color: #aab8d0;
}

.wrap {
  max-width: 900px;
  margin: auto;
  padding: 16px;
}

.panel {
  background: #121e32;
  border: 1px solid #263650;
  border-radius: 12px;
  padding: 16px;
  margin: 16px 0;
}

h2 {
  font-size: 19px;
  margin-top: 0;
}

.btn {
  display: inline-block;
  background: #2563eb;
  color: white;
  border: 0;
  border-radius: 9px;
  padding: 12px 15px;
  font-weight: 700;
  font-size: 14px;
  margin: 5px 5px 5px 0;
  cursor: pointer;
  text-decoration: none;
}

.btn.secondary {
  background: #344056;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

textarea {
  width: 100%;
  min-height: 190px;
  resize: vertical;
  background: #080f1c;
  color: #dce8ff;
  border: 1px solid #40516d;
  border-radius: 9px;
  padding: 12px;
  font: 12px monospace;
}

input[type="file"] {
  display: block;
  width: 100%;
  margin: 12px 0;
  color: #dce8ff;
}

.notice {
  padding: 12px;
  border: 1px solid #594b22;
  background: #2a2414;
  border-radius: 10px;
  color: #f6df9b;
  line-height: 1.5;
  margin: 12px 0;
}

.result {
  background: #080f1c;
  border: 1px solid #40516d;
  border-radius: 10px;
  padding: 14px;
  margin-top: 14px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.muted {
  color: #9aaac4;
  font-size: 13px;
}

.item {
  background: #121e32;
  border: 1px solid #263650;
  border-radius: 12px;
  padding: 15px;
  margin: 11px 0;
}

.meta {
  color: #9eafca;
  font-size: 12px;
}

.headline {
  margin-top: 8px;
  line-height: 1.5;
}

.item a {
  color: #dce8ff;
  text-decoration: none;
  font-weight: 650;
}

.item a:hover {
  text-decoration: underline;
}

.pill {
  display: inline-block;
  padding: 4px 9px;
  border-radius: 20px;
  font-size: 11px;
  margin-top: 8px;
}

.neutral {
  background: #344056;
  color: #d0daeb;
}

.feed-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #263650;
}

.feed-status:last-child {
  border-bottom: 0;
}

.status {
  font-size: 11px;
  font-weight: 700;
  padding: 5px 8px;
  border-radius: 20px;
  white-space: nowrap;
}

.status-ok {
  background: #123b2e;
  color: #8df0c1;
}

.status-warn {
  background: #493a1c;
  color: #f6df9b;
}

.status-error {
  background: #4a2028;
  color: #ffabb4;
}

.empty {
  color: #9aaac4;
  padding: 10px 0;
}

footer {
  color: #8998b2;
  font-size: 12px;
  padding: 22px 0;
  line-height: 1.6;
}

@media (max-width: 480px) {
  .feed-status {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
</head>

<body>

<header>
  <div class="wrap">
    <h1>BADAL SEVERIYA V10.2</h1>
    <p>Market Data Intelligence Prototype</p>
  </div>
</header>

<main class="wrap">

  <section class="panel">

    <h2>Market Engine Test</h2>

    <p class="muted">
      Generate demo candles, upload a JSON file,
      or paste historical OHLCV data.
    </p>

    <div class="notice">
      Demo data is synthetic and is not actual NIFTY market data.
      Historical indicator results are educational calculations,
      not forecasts or trading recommendations.
    </div>

    <button class="btn secondary" id="demoButton">
      Generate Demo Candles
    </button>

    <button class="btn" id="analyzeButton">
      Analyze Market
    </button>

    <hr>

    <h2>Historical JSON Data Import</h2>

    <p class="muted">
      Select a JSON file containing a candles array or a direct
      array of OHLCV candles. Maximum file size: 2 MB.
    </p>

    <input
      type="file"
      id="jsonFile"
      accept=".json,application/json"
    >

    <button class="btn secondary" id="clearButton">
      Clear Data
    </button>

    <p class="muted" id="fileStatus">
      No file selected.
    </p>

    <textarea
      id="candleInput"
      placeholder="Paste JSON candle data here."
    ></textarea>

    <div id="result" class="result">
      <p class="muted">Analysis result will appear here.</p>
    </div>

  </section>

  <section class="panel">

    <h2>News Feed Status</h2>

    <p class="muted">
      Official news sources are checked separately.
    </p>

    ${feedStatusHtml}

  </section>

  <section class="panel">

    <h2>Market News</h2>

    <p class="muted">
      Updated: ${escapeHtml(updatedAt)} (IST)
      · Showing dated news from the last ${NEWS_DAYS} days.
    </p>

    <a class="btn" href="/">Refresh news</a>

    <section id="news">
      ${newsHtml}
    </section>

  </section>

  <footer>
    BADAL SEVERIYA V10.2 — Educational prototype.
    News items are official-source updates, not verified
    market-impact measurements or future price predictions.
    Historical indicators are educational calculations only.
  </footer>

</main>

<script>
(function() {
  const input = document.getElementById("candleInput");
  const result = document.getElementById("result");
  const demoButton = document.getElementById("demoButton");
  const analyzeButton = document.getElementById("analyzeButton");
  const jsonFile = document.getElementById("jsonFile");
  const fileStatus = document.getElementById("fileStatus");
  const clearButton = document.getElementById("clearButton");

  function showMessage(message) {
    result.textContent = message;
  }

  function extractCandles(data) {
    if (Array.isArray(data)) return data;

    if (
      data &&
      typeof data === "object" &&
      Array.isArray(data.candles)
    ) {
      return data.candles;
    }

    if (
      data &&
      typeof data === "object" &&
      Array.isArray(data.data)
    ) {
      return data.data;
    }

    throw new Error(
      "JSON must contain a candle array or a candles property."
    );
  }

  function checkCandles(candles) {
    if (!Array.isArray(candles)) {
      throw new Error("Candle data must be an array.");
    }

    if (candles.length < 200) {
      throw new Error(
        "At least 200 candles are required. Found: " +
        candles.length
      );
    }

    if (candles.length > 5000) {
      throw new Error("Maximum 5000 candles are allowed.");
    }

    return candles;
  }

  // ----------------------------------------------
  // DEMO CANDLES
  // ----------------------------------------------

  demoButton.addEventListener("click", function() {
    const candles = [];
    let previousClose = 24000;

    for (let i = 0; i < 220; i++) {
      const movement =
        Math.sin(i / 8) * 7 +
        Math.cos(i / 17) * 3 +
        0.12;

      const open = previousClose;
      const close = open + movement;
      const high = Math.max(open, close) + 3;
      const low = Math.min(open, close) - 3;
      const volume = 1000 + (i % 20) * 100;

      candles.push({
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        volume
      });

      previousClose = close;
    }

    input.value = JSON.stringify(candles, null, 2);

    fileStatus.textContent =
      "220 synthetic demo candles created.";

    showMessage(
      "Demo candles created. Press Analyze Market to test."
    );
  });

  // ----------------------------------------------
  // JSON FILE IMPORT
  // ----------------------------------------------

  jsonFile.addEventListener("change", async function() {
    const file = jsonFile.files[0];

    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showMessage(
        "File is too large. Maximum allowed size is 2 MB."
      );

      jsonFile.value = "";
      return;
    }

    if (!file.name.toLowerCase().endsWith(".json")) {
      showMessage("Please select a .json file.");
      jsonFile.value = "";
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const candles = checkCandles(
        extractCandles(parsed)
      );

      input.value = JSON.stringify(candles, null, 2);

      fileStatus.textContent =
        "Loaded " + candles.length +
        " candles from " + file.name;

      showMessage(
        "JSON file loaded successfully. Press Analyze Market."
      );

    } catch (error) {
      showMessage("IMPORT ERROR: " + error.message);
      fileStatus.textContent = "File import failed.";
    }
  });

  // ----------------------------------------------
  // CLEAR DATA
  // ----------------------------------------------

  clearButton.addEventListener("click", function() {
    input.value = "";
    jsonFile.value = "";

    fileStatus.textContent = "Data cleared.";

    showMessage(
      "Data cleared. Upload a JSON file or generate demo candles."
    );
  });

  // ----------------------------------------------
  // HISTORICAL ANALYSIS
  // ----------------------------------------------

  analyzeButton.addEventListener("click", async function() {
    analyzeButton.disabled = true;

    showMessage("Checking and analyzing candle data...");

    try {
      const parsed = JSON.parse(input.value);

      const candles = checkCandles(
        extractCandles(parsed)
      );

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ candles })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Server returned HTTP " + response.status
        );
      }

      result.textContent = JSON.stringify(data, null, 2);

    } catch (error) {
      result.textContent =
        "TEST ERROR: " + error.message;

    } finally {
      analyzeButton.disabled = false;
    }
  });

})();
</script>

</body>
</html>`;
}

// ================================================
// CLOUDFLARE WORKER
// ================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // --------------------------------------------
    // HEALTH CHECK
    // --------------------------------------------

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        app: "BADAL SEVERIYA V10.2",
        mode: "prototype",
        marketEngine: "connected",
        jsonImport: "client-side-enabled",
        newsEngine: "official-sources",
        newsDays: NEWS_DAYS,
        feedsConfigured: FEEDS.length
      });
    }

    // --------------------------------------------
    // NEWS API
    // --------------------------------------------

    if (url.pathname === "/api/news") {
      if (request.method !== "GET") {
        return Response.json(
          { error: "Method not allowed" },
          { status: 405 }
        );
      }

      const newsData = await getNews();

      return Response.json(newsData, {
        headers: {
          "Cache-Control": "no-store"
        }
      });
    }

    // --------------------------------------------
    // HISTORICAL ANALYSIS API
    // --------------------------------------------

    if (url.pathname === "/api/analyze") {
      if (request.method !== "POST") {
        return Response.json(
          { error: "Send candle data using POST" },
          { status: 405 }
        );
      }

      try {
        const body = await request.json();

        if (!body || !Array.isArray(body.candles)) {
          return Response.json({
            status: "INVALID_REQUEST",
            error: "Request must contain a candles array"
          }, { status: 400 });
        }

        if (body.candles.length > 5000) {
          return Response.json({
            status: "DATA_LIMIT_EXCEEDED",
            error: "Maximum 5000 candles allowed"
          }, { status: 400 });
        }

        const result = analyzeMarket(body.candles);

        return Response.json({
          app: "BADAL SEVERIYA V10.2",
          analysisTime: new Date().toISOString(),
          result
        }, {
          headers: {
            "Cache-Control": "no-store"
          }
        });

      } catch (error) {
        return Response.json({
          status: "ERROR",
          error: String(
            error?.message ||
            "Invalid JSON or analysis request"
          )
        }, { status: 400 });
      }
    }

    // --------------------------------------------
    // HOME PAGE
    // --------------------------------------------

    if (
      url.pathname === "/" ||
      url.pathname === "/index.html"
    ) {
      const newsData = await getNews();

      return new Response(page(newsData), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "Cache-Control": "no-store"
        }
      });
    }

    return new Response("Not found", {
      status: 404
    });
  }
};
