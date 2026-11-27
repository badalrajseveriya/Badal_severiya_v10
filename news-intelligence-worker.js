
// BADAL SEVERIYA NEWS INTELLIGENCE — Phase 1.3.1
// Experimental contextual news collection and filtering. No live trading signals,
// predictions, or investment advice.

const APP = "BADAL SEVERIYA NEWS INTELLIGENCE";
const VERSION = "1.3.1";
const CACHE_SECONDS = 180;
const MAX_PER_SOURCE = 25;
const MAX_OUTPUT = 80;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;

const SOURCES = [
  {
    id: "google-india-market", name: "Google News — India Markets", type: "rss", retryLimit: 0,
    urls: [
      "https://news.google.com/rss/search?q=NIFTY+OR+Sensex+OR+Indian+stock+market&hl=en-IN&gl=IN&ceid=IN:en",
      "https://news.google.com/rss/search?q=NIFTY+OR+Sensex+market&hl=en-IN&gl=IN&ceid=IN:en",
      "https://news.google.com/rss/search?q=India+stock+market+economy&hl=en-IN&gl=IN&ceid=IN:en"
    ]
  },
  {
    id: "google-global-macro", name: "Google News — Global Macro", type: "rss", retryLimit: 0,
    urls: [
      "https://news.google.com/rss/search?q=Federal+Reserve+OR+inflation+OR+crude+oil+OR+global+markets&hl=en-IN&gl=IN&ceid=IN:en",
      "https://news.google.com/rss/search?q=Federal+Reserve+OR+inflation+OR+crude+oil&hl=en-IN&gl=IN&ceid=IN:en",
      "https://news.google.com/rss/search?q=global+markets+central+bank+oil&hl=en-IN&gl=IN&ceid=IN:en"
    ]
  },
  {
    id: "google-nifty-impact", name: "Google News — NIFTY Impact", type: "rss", retryLimit: 0,
    urls: [
      "https://news.google.com/rss/search?q=NIFTY+OR+NSE+OR+RBI+OR+FII+India+stock+market&hl=en-IN&gl=IN&ceid=IN:en",
      "https://news.google.com/rss/search?q=crude+oil+OR+USD+INR+OR+FII&hl=en-IN&gl=IN&ceid=IN:en",
      "https://news.google.com/rss/search?q=India+economy+foreign+investment&hl=en-IN&gl=IN&ceid=IN:en"
    ]
  },
  { id: "bbc-business", name: "BBC News", type: "rss", retryLimit: 2, urls: ["https://feeds.bbci.co.uk/news/business/rss.xml"] },
  { id: "dw-business", name: "DW News", type: "rss", retryLimit: 2, urls: ["https://rss.dw.com/rdf/rss-en-business"] },
  { id: "aljazeera", name: "Al Jazeera", type: "rss", retryLimit: 2, urls: ["https://www.aljazeera.com/xml/rss/all.xml"] },
  { id: "federal-reserve", name: "Federal Reserve", type: "rss", retryLimit: 2, urls: ["https://www.federalreserve.gov/feeds/press_all.xml"] },
  { id: "rbi", name: "Reserve Bank of India", type: "rss", retryLimit: 2, urls: ["https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=0"] },
  { id: "nse", name: "NSE India", type: "rss", retryLimit: 2, urls: ["https://www.nseindia.com/press-releases"] },
  {
    id: "gdelt", name: "GDELT — Global News Monitor", type: "json", retryLimit: 0,
    urls: [
      "https://api.gdeltproject.org/api/v2/doc/doc?query=(NIFTY%20OR%20India%20stock%20market%20OR%20RBI%20OR%20FII)&mode=ArtList&format=json&maxrecords=25&sort=DateDesc"
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

const NIFTY_TERMS = [
  "nifty", "sensex", "nse", "bse", "indian stock", "india market",
  "indian market", "rupee", "inr", "rbi", "reserve bank of india",
  "fii", "fpi", "dii", "foreign investor", "foreign investment",
  "bank nifty", " nifty 50"
];

const IMPACT_TERMS = [
  "federal reserve", "fed", "interest rate", "inflation", "crude oil",
  "oil price", "usd", "dollar", "bond yield", "geopolitical", "war",
  "tariff", "trade", "china", "global market", "commodity", "gold"
];

function stripHtml(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function xmlTag(item, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = item.match(re);
  if (!match) return "";

  const raw = match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return stripHtml(raw);
}

function parseRss(xml, source, url) {
  const entries = xml.match(/<(item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) || [];

  return entries.slice(0, MAX_PER_SOURCE).map((item) => {
    const title = xmlTag(item, "title");
    const description =
      xmlTag(item, "description") ||
      xmlTag(item, "summary") ||
      xmlTag(item, "content");

    let link = xmlTag(item, "link");

    if (!link) {
      const href = item.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (href) link = href[1];
    }

    const dateText =
      xmlTag(item, "pubDate") ||
      xmlTag(item, "published") ||
      xmlTag(item, "updated") ||
      xmlTag(item, "date");

    return {
      title,
      description,
      link,
      publishedAt: validDate(dateText),
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: url
    };
  }).filter((item) => item.title);
}

function validDate(dateText) {
  if (!dateText) return null;

  const date = new Date(dateText);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function parseGdelt(json, source, url) {
  const articles = Array.isArray(json?.articles) ? json.articles : [];

  return articles.slice(0, MAX_PER_SOURCE).map((article) => ({
    title: stripHtml(article.title || ""),
    description: stripHtml(article.seendate || article.description || ""),
    link: article.url || "",
    publishedAt: validDate(article.seendate),
    sourceId: source.id,
    sourceName: article.source?.name || source.name,
    sourceUrl: url
  })).filter((article) => article.title);
}

function scoreItem(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();

  const niftyHits = NIFTY_TERMS.filter((term => text.includes(term))).length;
  const impactHits = IMPACT_TERMS.filter((term => text.includes(term))).length;
  const positiveHits = POSITIVE_TERMS.filter((term => text.includes(term))).length;
  const negativeHits = NEGATIVE_TERMS.filter((term => text.includes(term))).length;

  const relevance = Math.min(
    100,
    niftyHits * 18 + impactHits * 7 + (niftyHits ? 10 : 0)
  );

  const sentimentScore = positiveHits - negativeHits;
  let sentiment = "NEUTRAL";

  if (sentimentScore >= 2) sentiment = "POSITIVE";
  else if (sentimentScore <= -2) sentiment = "NEGATIVE";
  else if (sentimentScore !== 0) {
    sentiment = sentimentScore > 0 ? "SLIGHTLY_POSITIVE" : "SLIGHTLY_NEGATIVE";
  }

  let impact = "LOW";
  if (relevance >= 60) impact = "HIGH";
  else if (relevance >= 30) impact = "MEDIUM";

  return {
    ...item,
    relevanceScore: relevance,
    sentiment,
    sentimentScore,
    impact,
    niftyRelevant: niftyHits > 0 || impactHits > 1
  };
}

function isRecent(item) {
  if (!item.publishedAt) return true;

  const age = Date.now() - new Date(item.publishedAt).getTime();
  return age <= MAX_AGE_MS && age >= -5 * 60 * 1000;
}

function dedupe(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key = item.title.toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchWithRetry(url, source) {
  const retryLimit = Number.isInteger(source.retryLimit)
    ? Math.max(0, source.retryLimit)
    : MAX_RETRIES;

  let lastError = "Unknown error";

  for (let attempt = 0; attempt <= retryLimit; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": `Mozilla/5.0 (compatible; BADAL-SEVERIYA-News-Intelligence/${VERSION}; +https://news.google.com)`,
          "Accept": source.type === "json"
            ? "application/json,text/plain,*/*"
            : "application/rss+xml,application/xml,text/xml,text/plain,*/*",
          "Accept-Language": "en-IN,en;q=0.9"
        }
      });

      clearTimeout(timeout);

      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        const retryable =
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500;

        if (!retryable || attempt >= retryLimit) break;
      } else {
        if (source.type === "json") {
          return { data: await response.json(), url };
        }
        return { data: await response.text(), url };
      }
    } catch (error) {
      clearTimeout(timeout);

      lastError = error?.name === "AbortError"
        ? `Timeout after ${FETCH_TIMEOUT_MS}ms`
        : (error?.message || "Network error");

      if (attempt >= retryLimit) break;
    }

    if (attempt < retryLimit) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(1000 * (attempt + 1), 2000))
      );
    }
  }

  throw new Error(lastError);
}

async function fetchSource(source) {
  const errors = [];

  for (const url of source.urls) {
    try {
      const result = await fetchWithRetry(url, source);

      const items = source.type === "json"
        ? parseGdelt(result.data, source, url)
        : parseRss(result.data, source, url);

      if (items.length) {
        return {
          sourceId: source.id,
          sourceName: source.name,
          status: "CONNECTED",
          fetchedItems: items.length,
          items,
          url: result.url
        };
      }

      errors.push(`${url}: feed returned no parsed items`);
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
  const sourceResults = await Promise.all(SOURCES.map(fetchSource));

  const allItems = sourceResults
    .flatMap((source) => source.items)
    .filter(isRecent)
    .map(scoreItem);

  const unique = dedupe(allItems).sort((a, b) =>
    (b.relevanceScore - a.relevanceScore) ||
    ((b.publishedAt || "").localeCompare(a.publishedAt || ""))
  );

  const output = unique.slice(0, MAX_OUTPUT);
  const connectedSources = sourceResults.filter(
    (source) => source.status === "CONNECTED"
  ).length;
  const failedSources = sourceResults.filter(
    (source) => source.status === "ERROR"
  ).length;

  return {
    app: APP,
    version: VERSION,
    generatedAt: new Date().toISOString(),
    sourcesConfigured: SOURCES.length,
    connectedSources,
    emptySources: 0,
    failedSources,
    fetchedItems: allItems.length,
    uniqueItems: unique.length,
    niftyRelevantItems: output.filter((item => item.niftyRelevant)).length,
    sourceStatus: sourceResults.map(({ items, ...status }) => status),
    news: output,
    methodology: {
      mode: "experimental-rule-based-news-filter",
      disclaimer: "Educational news context only. Not live trading signals, predictions, or investment advice.",
      reliability: "Google News RSS uses tested India-region feeds, fallback query URLs, and no automatic retries. GDELT is limited to one request without retry/fallback to reduce rate-limit pressure. Other sources use bounded retries. Relevance and sentiment are keyword-based and may be imperfect."
    }
  };
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
      ...extraHeaders
    }
  });
}

async function getCachedNews(cache) {
  const key = new Request(
    "https://badal-severiya-cache.local/news-intelligence-v1.3.1"
  );

  const cached = await cache.match(key);
  if (cached) return cached;

  const data = await collectNews();
  const response = jsonResponse(data);

  await cache.put(key, response.clone());
  return response;
}

function health() {
  return {
    ok: true,
    app: APP,
    version: VERSION,
    configuredSources: SOURCES.length,
    mode: "experimental-contextual-news-filter-google-rss-recovery-gdelt-rate-limited",
    endpoints: ["/api/health", "/api/news-intelligence"],
    note: "Experimental news context only; no trading signals, predictions, or advice."
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonResponse(
        { ok: false, error: "Method not allowed" },
        405,
        { "Allow": "GET, HEAD" }
      );
    }

    if (path === "/api/health" || path === "/health") {
      return jsonResponse(health());
    }

    if (path === "/api/news-intelligence" || path === "/news-intelligence") {
      try {
        const cache = caches.default;
        return await getCachedNews(cache);
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
      available: ["/api/health", "/api/news-intelligence"]
    }, 404);
  }
};
