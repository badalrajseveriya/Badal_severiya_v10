// BADAL SEVERIYA NEWS INTELLIGENCE — Phase 1.3.2
// RSS source recovery, source isolation, stricter India-market relevance,
// safer parsing, and corrected collection metrics. Experimental context only.

const APP = "BADAL SEVERIYA NEWS INTELLIGENCE";
const VERSION = "1.3.2";
const CACHE_SECONDS = 120;
const MAX_PER_SOURCE = 30;
const MAX_OUTPUT = 100;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 7000;
const MAX_RETRIES = 1;

const SOURCES = [
  {
    id: "livemint-markets",
    name: "Livemint — Markets",
    type: "rss",
    retryLimit: 1,
    urls: ["https://www.livemint.com/rss/marketsRSS"]
  },
  {
    id: "bbc-business",
    name: "BBC News — Business",
    type: "rss",
    retryLimit: 1,
    urls: ["https://feeds.bbci.co.uk/news/business/rss.xml"]
  },
  {
    id: "dw-business",
    name: "DW News — Business",
    type: "rss",
    retryLimit: 0,
    urls: ["https://rss.dw.com/rdf/rss-en-business"]
  },
  {
    id: "aljazeera",
    name: "Al Jazeera — News",
    type: "rss",
    retryLimit: 1,
    urls: ["https://www.aljazeera.com/xml/rss/all.xml"]
  },
  {
    id: "federal-reserve",
    name: "Federal Reserve — Press Releases",
    type: "rss",
    retryLimit: 1,
    urls: ["https://www.federalreserve.gov/feeds/press_all.xml"]
  },
  {
    id: "rbi-press",
    name: "Reserve Bank of India — Press Releases",
    type: "rss",
    retryLimit: 1,
    urls: ["https://www.rbi.org.in/pressreleases_rss.xml"]
  },
  {
    id: "rbi-notifications",
    name: "Reserve Bank of India — Notifications",
    type: "rss",
    retryLimit: 1,
    urls: ["https://www.rbi.org.in/notifications_rss.xml"]
  },
  {
    id: "nse-announcements",
    name: "NSE India — Announcements",
    type: "rss",
    retryLimit: 1,
    urls: [
      "https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml"
    ]
  },
  {
    id: "bse-notices",
    name: "BSE — Notices",
    type: "rss",
    retryLimit: 1,
    urls: ["https://www.bseindia.com/data/xml/notices.xml"]
  },
  {
    id: "gdelt",
    name: "GDELT — Global News Monitor",
    type: "json",
    retryLimit: 0,
    urls: [
      "https://api.gdeltproject.org/api/v2/doc/doc?query=(India%20OR%20NIFTY%20OR%20RBI%20OR%20Indian%20markets)%20AND%20(crude%20OR%20inflation%20OR%20stocks%20OR%20economy)&mode=ArtList&format=json&maxrecords=15&sort=DateDesc"
    ]
  }
];

const POSITIVE_TERMS = [
  "gain", "gains", "rise", "rises", "rising", "surge", "surges",
  "record high", "bullish", "rally", "rallies", "strong growth",
  "profit", "profits", "upgrade", "upgraded", "inflow", "inflows",
  "cuts rates", "rate cut", "eases", "easing", "beat estimates",
  "higher than expected"
];

const NEGATIVE_TERMS = [
  "fall", "falls", "fell", "decline", "declines", "drop", "drops",
  "crash", "selloff", "sell-off", "bearish", "loss", "losses",
  "downgrade", "downgraded", "outflow", "outflows", "rate hike",
  "hikes rates", "inflation surge", "war", "conflict", "sanction",
  "weak growth", "miss estimates", "lower than expected"
];

const INDIA_MARKET_TERMS = [
  "nifty", "sensex", "nse", "bse", "indian stock",
  "india stock market", "indian market", "india markets",
  "rupee", "inr", "rbi", "reserve bank of india",
  "fii", "fpi", "dii", "foreign investor", "foreign investment",
  "bank nifty", "india equity", "indian equities", "sebi",
  "indian economy", "india economy"
];

const GLOBAL_MACRO_TERMS = [
  "federal reserve", "fed rate", "interest rate", "inflation",
  "crude oil", "oil price", "usd", "dollar", "bond yield",
  "geopolitical", "tariff", "trade war", "china", "global market",
  "commodity", "gold", "ecb", "central bank", "recession"
];

const INDIA_LINK_TERMS = [
  "india", "indian", "rupee", "inr", "nifty", "sensex",
  "rbi", "fii", "fpi"
];

function stripHtml(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCodePoint(Number(n))
    )
    .replace(/&#x([\da-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16))
    )
    .replace(/\s+/g, " ")
    .trim();
}

function xmlTag(item, tag) {
  const re = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
    "i"
  );

  const match = item.match(re);
  return match ? stripHtml(match[1]) : "";
}

function validDate(dateText) {
  if (!dateText) return null;

  const date = new Date(dateText);
  return Number.isFinite(date.getTime())
    ? date.toISOString()
    : null;
}

function parseRss(xml, source, url) {
  const entries =
    xml.match(/<(item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) || [];

  return entries.slice(0, MAX_PER_SOURCE).map((entry) => {
    const title = xmlTag(entry, "title");

    const description =
      xmlTag(entry, "description") ||
      xmlTag(entry, "summary") ||
      xmlTag(entry, "content");

    let link = xmlTag(entry, "link");

    if (!link) {
      const href = entry.match(
        /<link[^>]+href=["']([^"']+)["']/i
      );

      if (href) link = href[1];
    }

    const dateText =
      xmlTag(entry, "pubDate") ||
      xmlTag(entry, "published") ||
      xmlTag(entry, "updated") ||
      xmlTag(entry, "date");

    return {
      title,
      description,
      link,
      publishedAt: validDate(dateText),
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: url
    };
  }).filter((item) => item.title && item.link);
}

function parseGdelt(json, source, url) {
  const articles = Array.isArray(json?.articles)
    ? json.articles
    : [];

  return articles.slice(0, MAX_PER_SOURCE).map((article) => ({
    title: stripHtml(article.title || ""),
    description: stripHtml(
      article.seendate || article.description || ""
    ),
    link: article.url || "",
    publishedAt: validDate(article.seendate),
    sourceId: source.id,
    sourceName: article.source?.name || source.name,
    sourceUrl: url
  })).filter((article) => article.title && article.link);
}

function scoreItem(item) {
  const text =
    `${item.title} ${item.description}`.toLowerCase();

  const directHits = INDIA_MARKET_TERMS.filter(
    (term) => text.includes(term)
  ).length;

  const macroHits = GLOBAL_MACRO_TERMS.filter(
    (term) => text.includes(term)
  ).length;

  const indiaContextHits = INDIA_LINK_TERMS.filter(
    (term) => text.includes(term)
  ).length;

  const positiveHits = POSITIVE_TERMS.filter(
    (term) => text.includes(term)
  ).length;

  const negativeHits = NEGATIVE_TERMS.filter(
    (term) => text.includes(term)
  ).length;

  const relevant =
    directHits > 0 ||
    (macroHits > 0 && indiaContextHits > 0);

  const score = Math.min(
    100,
    directHits * 20 +
    (directHits ? 15 : 0) +
    (macroHits && indiaContextHits
      ? Math.min(25, macroHits * 7)
      : 0)
  );

  const sentimentScore = positiveHits - negativeHits;

  let sentiment = "NEUTRAL";

  if (sentimentScore >= 2) {
    sentiment = "POSITIVE";
  } else if (sentimentScore <= -2) {
    sentiment = "NEGATIVE";
  } else if (sentimentScore !== 0) {
    sentiment = sentimentScore > 0
      ? "SLIGHTLY_POSITIVE"
      : "SLIGHTLY_NEGATIVE";
  }

  const impact = score >= 65
    ? "HIGH"
    : score >= 35
      ? "MEDIUM"
      : "LOW";

  return {
    ...item,
    relevanceScore: score,
    sentiment,
    sentimentScore,
    impact,
    niftyRelevant: relevant
  };
}

function isRecent(item) {
  if (!item.publishedAt) return true;

  const age =
    Date.now() - new Date(item.publishedAt).getTime();

  return age <= MAX_AGE_MS &&
    age >= -5 * 60 * 1000;
}

function dedupe(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key =
      `${item.title.toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()}|${item.link}`;

    if (!key || seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

async function fetchWithRetry(url, source) {
  const retries = Number.isInteger(source.retryLimit)
    ? Math.max(0, source.retryLimit)
    : MAX_RETRIES;

  let lastError = "Unknown error";

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      FETCH_TIMEOUT_MS
    );

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            `Mozilla/5.0 (compatible; BADAL-SEVERIYA-News/${VERSION})`,
          "Accept": source.type === "json"
            ? "application/json,text/plain,*/*"
            : "application/rss+xml,application/xml,text/xml,text/plain,*/*",
          "Accept-Language": "en-IN,en;q=0.8"
        }
      });

      clearTimeout(timer);

      if (!response.ok) {
        lastError = `HTTP ${response.status}`;

        const retryable =
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500;

        if (!retryable || attempt >= retries) break;
      } else {
        const data = source.type === "json"
          ? await response.json()
          : await response.text();

        return { data, url };
      }
    } catch (error) {
      clearTimeout(timer);

      lastError = error?.name === "AbortError"
        ? `Timeout after ${FETCH_TIMEOUT_MS}ms`
        : (error?.message || "Network error");

      if (attempt >= retries) break;
    }

    if (attempt < retries) {
      await new Promise((resolve) =>
        setTimeout(resolve, 500 * (attempt + 1))
      );
    }
  }

  throw new Error(lastError);
}

async function fetchSource(source) {
  const errors = [];

  for (const url of source.urls) {
    try {
      const fetched = await fetchWithRetry(url, source);

      const items = source.type === "json"
        ? parseGdelt(fetched.data, source, url)
        : parseRss(fetched.data, source, url);

      if (items.length) {
        return {
          sourceId: source.id,
          sourceName: source.name,
          status: "CONNECTED",
          fetchedItems: items.length,
          items,
          url
        };
      }

      return {
        sourceId: source.id,
        sourceName: source.name,
        status: "EMPTY",
        fetchedItems: 0,
        items: [],
        error: `${url}: feed returned no valid parsed entries`,
        url
      };
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }

  return {
    sourceId: source.id,
    sourceName: source.name,
    status: "ERROR",
    fetchedItems: 0,
    items: [],
    error: errors.join(" | ")
  };
}

async function collectNews() {
  const results = await Promise.all(
    SOURCES.map(fetchSource)
  );

  const fetchedItems = results.reduce(
    (sum, result) => sum + result.fetchedItems,
    0
  );

  const allParsed = results
    .flatMap((result) => result.items)
    .map(scoreItem);

  const recent = allParsed.filter(isRecent);

  const unique = dedupe(recent).sort((a, b) =>
    b.relevanceScore - a.relevanceScore ||
    (b.publishedAt || "").localeCompare(
      a.publishedAt || ""
    )
  );

  const output = unique.slice(0, MAX_OUTPUT);

  const connectedSources = results.filter(
    (result) => result.status === "CONNECTED"
  ).length;

  const emptySources = results.filter(
    (result) => result.status === "EMPTY"
  ).length;

  const failedSources = results.filter(
    (result) => result.status === "ERROR"
  ).length;

  return {
    app: APP,
    version: VERSION,
    generatedAt: new Date().toISOString(),
    sourcesConfigured: SOURCES.length,
    connectedSources,
    emptySources,
    failedSources,
    fetchedItems,
    uniqueItems: unique.length,
    niftyRelevantItems: output.filter(
      (item) => item.niftyRelevant
    ).length,

    sourceStatus: results.map(
      ({ items, ...status }) => status
    ),

    news: output,

    methodology: {
      mode: "experimental-rule-based-news-filter",
      disclaimer:
        "Educational news context only. Not live trading signals, predictions, or investment advice.",
      reliability:
        "Google News search feeds removed after repeated Worker HTTP 503 failures. Official RBI/NSE/BSE feeds and publisher RSS feeds are used. Feed fetch failures are isolated per source. India-market relevance requires direct India-market terms or a global macro term together with India context. Sentiment and relevance remain keyword-based and imperfect."
    }
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`
    }
  });
}

async function getCachedNews(cache) {
  const key = new Request(
    "https://badal-severiya-cache.local/news-intelligence-v1.3.2"
  );

  const cached = await cache.match(key);

  if (cached) return cached;

  const response = jsonResponse(await collectNews());

  await cache.put(key, response.clone());

  return response;
}

function health() {
  return {
    ok: true,
    app: APP,
    version: VERSION,
    configuredSources: SOURCES.length,
    mode: "experimental-rss-recovery-strict-india-market-relevance",
    endpoints: [
      "/api/health",
      "/api/news-intelligence"
    ],
    note:
      "Experimental news context only; no trading signals, predictions, or advice."
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    const path =
      url.pathname.replace(/\/$/, "") || "/";

    if (request.method !== "GET" &&
        request.method !== "HEAD") {
      return jsonResponse(
        { ok: false, error: "Method not allowed" },
        405
      );
    }

    if (path === "/api/health" ||
        path === "/health") {
      return jsonResponse(health());
    }

    if (path === "/api/news-intelligence" ||
        path === "/news-intelligence") {
      try {
        return await getCachedNews(caches.default);
      } catch (error) {
        return jsonResponse({
          ok: false,
          app: APP,
          version: VERSION,
          error: error?.message || "Unexpected error",
          generatedAt: new Date().toISOString()
        }, 500);
      }
    }

    return jsonResponse({
      ok: false,
      app: APP,
      version: VERSION,
      error: "Not found",
      available: [
        "/api/health",
        "/api/news-intelligence"
      ]
    }, 404);
  }
};