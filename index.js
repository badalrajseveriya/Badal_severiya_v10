
import { analyzeMarket } from "./market-data.js";

const FEEDS = [
  {
    name: "NIFTY / Indian Markets",
    url: "https://news.google.com/rss/search?q=NIFTY+50+OR+Indian+stock+market&hl=en-IN&gl=IN&ceid=IN:en"
  },
  {
    name: "RBI / Economy",
    url: "https://news.google.com/rss/search?q=RBI+India+economy+monetary+policy&hl=en-IN&gl=IN&ceid=IN:en"
  },
  {
    name: "IPO / Company Results",
    url: "https://news.google.com/rss/search?q=India+IPO+OR+quarterly+results+companies&hl=en-IN&gl=IN&ceid=IN:en"
  },
  {
    name: "Global Markets",
    url: "https://news.google.com/rss/search?q=US+Federal+Reserve+OR+global+markets&hl=en-IN&gl=IN&ceid=IN:en"
  }
];

const POSITIVE = [
  "beats estimates", "profit rises", "growth", "surge",
  "record high", "rate cut", "approval", "strong results",
  "inflows", "upgrade"
];

const NEGATIVE = [
  "misses estimates", "loss widens", "decline", "falls",
  "crash", "rate hike", "warning", "fraud",
  "outflows", "downgrade", "ban"
];

function decodeXml(s = "") {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function tag(xml, name) {
  const m = xml.match(
    new RegExp(
      `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`,
      "i"
    )
  );

  return m ? decodeXml(m[1]) : "";
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, function(c) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c];
  });
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function classify(title, description) {
  const text = (title + " " + description).toLowerCase();

  const positiveCount =
    POSITIVE.filter(k => text.includes(k)).length;

  const negativeCount =
    NEGATIVE.filter(k => text.includes(k)).length;

  if (positiveCount > negativeCount) {
    return {
      label: "Positive keywords",
      tone: "positive"
    };
  }

  if (negativeCount > positiveCount) {
    return {
      label: "Negative keywords",
      tone: "negative"
    };
  }

  return {
    label: "Needs review",
    tone: "neutral"
  };
}

async function getNews() {
  const results = await Promise.all(
    FEEDS.map(async feed => {
      try {
        const response = await fetch(feed.url, {
          headers: {
            "User-Agent": "BadalSeveriyaNews/1.0"
          },
          cf: {
            cacheTtl: 300,
            cacheEverything: true
          }
        });

        if (!response.ok) {
          throw new Error("Feed returned " + response.status);
        }

        const xml = await response.text();

        const items = [
          ...xml.matchAll(
            /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi
          )
        ].slice(0, 12);

        return items.map(match => {
          const item = match[1];

          const title = tag(item, "title");
          const link = tag(item, "link");
          const pubDate = tag(item, "pubDate");
          const description = tag(item, "description");

          return {
            source: feed.name,
            title,
            link,
            pubDate,
            ...classify(title, description)
          };
        }).filter(item => item.title);

      } catch (error) {
        return [{
          source: feed.name,
          title: "Feed temporarily unavailable",
          link: "",
          pubDate: "",
          label: "No data",
          tone: "neutral"
        }];
      }
    })
  );

  return results
    .flat()
    .sort((a, b) =>
      (Date.parse(b.pubDate) || 0) -
      (Date.parse(a.pubDate) || 0)
    );
}

function renderNewsItem(item) {
  const tone = ["positive", "negative", "neutral"].includes(item.tone)
    ? item.tone
    : "neutral";

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
        ${escapeHtml(item.pubDate || "Date unavailable")}
      </div>

      <div class="pill ${tone}">
        ${escapeHtml(item.label)}
      </div>

      <div class="headline">
        ${titleHtml}
      </div>
    </article>
  `;
}

function page(items) {
  const newsHtml = items.length
    ? items.map(renderNewsItem).join("")
    : '<p class="empty">No headlines available right now. Please refresh.</p>';

  const updatedAt = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata"
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0b1220">
<title>BADAL SEVERIYA V10</title>

<style>
:root {
  color-scheme: dark;
}

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
  padding: 24px 16px;
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

.bar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin: 10px 0 18px;
}

.btn {
  display: inline-block;
  background: #2563eb;
  color: white;
  border: 0;
  border-radius: 9px;
  padding: 11px 16px;
  font-weight: 700;
  font-size: 15px;
  text-decoration: none;
}

.muted {
  color: #9aaac4;
  font-size: 13px;
}

.notice {
  padding: 13px;
  border: 1px solid #594b22;
  background: #2a2414;
  border-radius: 10px;
  color: #f6df9b;
  margin: 14px 0 20px;
  line-height: 1.5;
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
  line-height: 1.5;
}

.headline {
  margin-top: 5px;
  line-height: 1.5;
  overflow-wrap: anywhere;
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
  margin: 8px 0 5px;
}

.positive {
  background: #123b2e;
  color: #8df0c1;
}

.negative {
  background: #4a2028;
  color: #ffabb4;
}

.neutral {
  background: #344056;
  color: #d0daeb;
}

.empty {
  color: #aab8d0;
  padding: 20px 0;
}

footer {
  color: #8998b2;
  font-size: 12px;
  padding: 22px 0;
  line-height: 1.6;
}
</style>
</head>

<body>

<header>
  <div class="wrap">
    <h1>BADAL SEVERIYA V10</h1>
    <p>Market news and data intelligence dashboard</p>
  </div>
</header>

<main class="wrap">

  <div class="bar">
    <a class="btn" href="/">Refresh news</a>
    <span class="muted">
      Updated: ${escapeHtml(updatedAt)} (IST)
    </span>
  </div>

  <div class="notice">
    <b>Important:</b>
    News labels are based on simple keyword matching.
    They are not verified market impact, trading signals,
    forecasts, or probability of profit.
    Always check original news sources.
  </div>

  <section id="news">
    ${newsHtml}
  </section>

  <footer>
    News headlines are collected from Google News RSS.
    Availability and coverage can change.
    Educational information only.
  </footer>

</main>

</body>
</html>`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // HEALTH CHECK
    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        app: "BADAL SEVERIYA V10",
        mode: "prototype",
        marketEngine: "connected"
      });
    }

    // NEWS API
    if (url.pathname === "/api/news") {
      if (request.method !== "GET") {
        return Response.json(
          { error: "Method not allowed" },
          { status: 405 }
        );
      }

      const items = await getNews();

      return Response.json({
        updatedAt: new Date().toISOString(),
        count: items.length,
        items
      }, {
        headers: {
          "Cache-Control": "no-store"
        }
      });
    }

    // MARKET ANALYSIS API
    if (url.pathname === "/api/analyze") {
      if (request.method !== "POST") {
        return Response.json(
          {
            error: "Send candle data using POST"
          },
          { status: 405 }
        );
      }

      try {
        const body = await request.json();

        if (!body || !Array.isArray(body.candles)) {
          return Response.json(
            {
              status: "INVALID_REQUEST",
              error: "Request must contain a candles array"
            },
            { status: 400 }
          );
        }

        if (body.candles.length > 5000) {
          return Response.json(
            {
              status: "DATA_LIMIT_EXCEEDED",
              error: "Maximum 5000 candles allowed"
            },
            { status: 400 }
          );
        }

        const result = analyzeMarket(body.candles);

        return Response.json({
          app: "BADAL SEVERIYA V10",
          analysisTime: new Date().toISOString(),
          result
        }, {
          headers: {
            "Cache-Control": "no-store"
          }
        });

      } catch (error) {
        return Response.json(
          {
            status: "ERROR",
            error: "Invalid JSON or analysis request"
          },
          { status: 400 }
        );
      }
    }

    // MAIN DASHBOARD
    if (
      url.pathname === "/" ||
      url.pathname === "/index.html"
    ) {
      const items = await getNews();

      return new Response(page(items), {
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
