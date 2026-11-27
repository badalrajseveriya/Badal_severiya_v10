// BADAL SEVERIYA NEWS INTELLIGENCE — Phase 1.1
// Global news collection + NIFTY relevance + transparent rule scoring.
// Experimental only. No fact-check certification or trading prediction.

const APP = "BADAL SEVERIYA NEWS INTELLIGENCE";
const VERSION = "1.1.0";
const CACHE_SECONDS = 180;
const MAX_PER_SOURCE = 35;
const MAX_OUTPUT = 80;

const SOURCES = [
  {
    id: "google-india-market",
    name: "Google News — India Markets",
    kind: "aggregator",
    url: "https://news.google.com/rss/search?q=NIFTY+OR+Indian+stock+market+OR+RBI+OR+SEBI+OR+India+inflation&hl=en-IN&gl=IN&ceid=IN:en"
  },
  {
    id: "google-global-macro",
    name: "Google News — Global Macro",
    kind: "aggregator",
    url: "https://news.google.com/rss/search?q=Federal+Reserve+OR+US+inflation+OR+oil+prices+OR+war+OR+trade+tariff&hl=en&gl=US&ceid=US:en"
  },
  {
    id: "google-nifty-impact",
    name: "Google News — NIFTY Impact",
    kind: "aggregator",
    url: "https://news.google.com/rss/search?q=crude+oil+OR+USD+INR+OR+FII+OR+India+GDP+OR+Indian+economy&hl=en-IN&gl=IN&ceid=IN:en"
  },
  {
    id: "bbc-world",
    name: "BBC World",
    kind: "publisher",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml"
  },
  {
    id: "dw-world",
    name: "DW World",
    kind: "publisher",
    url: "https://rss.dw.com/rdf/rss-en-world"
  },
  {
    id: "aljazeera",
    name: "Al Jazeera",
    kind: "publisher",
    url: "https://www.aljazeera.com/xml/rss/all.xml"
  },
  {
    id: "fed",
    name: "Federal Reserve",
    kind: "official",
    url: "https://www.federalreserve.gov/feeds/press_all.xml"
  },
  {
    id: "rbi",
    name: "Reserve Bank of India",
    kind: "official",
    url: "https://rbi.org.in/pressreleases_rss.xml"
  },
  {
    id: "nse",
    name: "NSE Corporate Announcements",
    kind: "official",
    url: "https://archives.nseindia.com/content/RSS/Online_announcements.xml"
  },
  {
    id: "gdelt",
    name: "GDELT Global News",
    kind: "aggregator",
    url: "https://api.gdeltproject.org/api/v2/doc/doc?query=NIFTY%20OR%20India%20stock%20market%20OR%20RBI%20OR%20crude%20oil%20OR%20Federal%20Reserve&mode=ArtList&format=json&maxrecords=50&sort=DateDesc"
  }
];

const RELEVANCE_TERMS = [
  "nifty", "india", "indian", "rbi", "sebi", "nse", "bse",
  "sensex", "rupee", "inr", "fii", "fpi", "dii", "crude",
  "oil", "fed", "federal reserve", "inflation", "cpi", "gdp",
  "interest rate", "tariff", "trade", "war", "sanction",
  "bank", "bond", "yield", "vix", "stock", "market", "economy",
  "budget", "tax", "monsoon", "cyclone", "election", "policy",
  "earnings", "index", "liquidity", "recession", "commodity",
  "china", "us", "united states", "europe", "opec"
];

const HIGH_IMPACT_TERMS = [
  "war", "invasion", "missile", "attack", "terror", "terrorism",
  "emergency", "crisis", "default", "crash", "collapse",
  "sanction", "sanctions", "ceasefire", "blockade", "shutdown",
  "rate cut", "rate hike", "interest rate", "inflation", "cpi",
  "federal reserve", "rbi", "policy decision", "tariff", "trade war",
  "oil surge", "crude oil", "earthquake", "cyclone", "flood",
  "pandemic", "major disruption", "bank failure", "liquidity crisis",
  "budget", "gdp"
];

const CRITICAL_TERMS = [
  "war", "invasion", "missile attack", "terror attack",
  "terrorism", "liquidity crisis", "bank failure",
  "financial crisis", "market crash", "default",
  "emergency", "blockade", "major disruption"
];

const BULLISH_TERMS = [
  "rate cut", "cuts rates", "lower interest", "inflation cool",
  "inflation falls", "oil falls", "crude falls", "ceasefire",
  "peace deal", "stimulus", "strong growth", "record profit",
  "upgrade", "liquidity injection", "tax cut", "trade deal",
  "reopens", "easing"
];

const BEARISH_TERMS = [
  "rate hike", "raises rates", "inflation rises", "inflation hot",
  "oil rises", "crude surges", "war", "invasion", "attack",
  "terror", "sanctions", "tariff", "trade war", "recession",
  "default", "crash", "collapse", "bank failure", "liquidity crisis",
  "downgrade", "shutdown", "disruption", "sell-off", "selloff",
  "outflow"
];

function cleanText(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16))
    )
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Match whole words or phrases, not accidental substrings.
// Example: "us" won't match "focus"; "rate" won't match "corporate".
function termMatch(text, term) {
  const normalized = String(text || "").toLowerCase();
  const t = String(term).toLowerCase().trim();
  if (!t) return false;

  const pattern = escapeRegExp(t).replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, "i")
    .test(normalized);
}

function countHits(text, terms) {
  return terms.filter(term => termMatch(text, term)).length;
}

function getTag(xml, name) {
  const escaped = escapeRegExp(name);
  const regex = new RegExp(
    `<(?:[\\w.-]+:)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${escaped}\\s*>`,
    "i"
  );

  const match = String(xml).match(regex);
  return match ? cleanText(match[1]) : "";
}

function getAttribute(tagText, name) {
  const match = String(tagText).match(
    new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*["']([^"']+)["']`, "i")
  );
  return match ? cleanText(match[1]) : "";
}

function safeHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function parsePublished(raw) {
  if (!raw) return null;

  const s = String(raw);

  if (/^\d{14}$/.test(s)) {
    const iso =
      `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` +
      `T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`;

    const d = Date.parse(iso);
    return Number.isFinite(d) ? new Date(d).toISOString() : null;
  }

  const d = Date.parse(s);
  return Number.isFinite(d) ? new Date(d).toISOString() : null;
}

function parseRss(xml, source) {
  const rssItems = [
    ...String(xml).matchAll(
      /<(?:[\w.-]+:)?item\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?item\s*>/gi
    )
  ];

  const atomEntries = rssItems.length
    ? rssItems
    : [
        ...String(xml).matchAll(
          /<(?:[\w.-]+:)?entry\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?entry\s*>/gi
        )
      ];

  return atomEntries.slice(0, MAX_PER_SOURCE).map(match => {
    const entry = match[1];
    const linkElement =
      (entry.match(/<(?:[\w.-]+:)?link\b[^>]*>/i) || [""])[0];

    const rawLink = getAttribute(linkElement, "href") || getTag(entry, "link");

    return {
      title: getTag(entry, "title"),
      description:
        getTag(entry, "description") ||
        getTag(entry, "summary") ||
        getTag(entry, "content"),
      link: safeHttps(rawLink),
      published: parsePublished(
        getTag(entry, "pubDate") ||
        getTag(entry, "published") ||
        getTag(entry, "updated") ||
        getTag(entry, "date")
      ),
      sourceId: source.id,
      sourceName: source.name,
      sourceKind: source.kind,
      sourceStatus: "FETCHED"
    };
  }).filter(item => item.title);
}

function parseGdelt(json, source) {
  const articles = Array.isArray(json?.articles) ? json.articles : [];

  return articles.slice(0, MAX_PER_SOURCE).map(article => ({
    title: cleanText(article.title),
    description: cleanText(article.snippet || ""),
    link: safeHttps(article.url),
    published: parsePublished(article.seendate),
    sourceId: source.id,
    sourceName: cleanText(article.source || source.name),
    sourceKind: "aggregator",
    sourceStatus: "FETCHED"
  })).filter(item => item.title);
}

function isNiftyRelevant(news) {
  const text = `${news.title || ""} ${news.description || ""}`.toLowerCase();
  const hits = RELEVANCE_TERMS.filter(term => termMatch(text, term));

  const priorityTerms = [
    "nifty", "india", "rbi", "crude", "federal reserve",
    "inflation", "fii", "tariff", "war", "gdp"
  ];

  const hasPriorityTerm = hits.some(term => priorityTerms.includes(term));

  return {
    relevant: hits.length > 0,
    hits: hits.slice(0, 10),
    relevanceScore: Math.min(
      100,
      hits.length * 12 + (hasPriorityTerm ? 28 : 0)
    )
  };
}

function analyzeNewsItem(news) {
  const text = `${news.title || ""} ${news.description || ""}`.toLowerCase();

  const relevance = isNiftyRelevant(news);
  const bullishHits = countHits(text, BULLISH_TERMS);
  const bearishHits = countHits(text, BEARISH_TERMS);
  const impactHits = countHits(text, HIGH_IMPACT_TERMS);
  const criticalHits = countHits(text, CRITICAL_TERMS);

  const highImpact = impactHits >= 2;
  const critical = criticalHits >= 1;

  let direction = "NEUTRAL";
  if (bullishHits > bearishHits) direction = "BULLISH";
  if (bearishHits > bullishHits) direction = "BEARISH";

  let bullish = 34;
  let bearish = 33;
  let neutral = 33;

  if (direction === "BULLISH") {
    bullish += Math.min(24, bullishHits * 8);
    bearish -= Math.min(12, bullishHits * 3);
  } else if (direction === "BEARISH") {
    bearish += Math.min(24, bearishHits * 8);
    bullish -= Math.min(12, bearishHits * 3);
  }

  if (highImpact && direction !== "NEUTRAL") neutral -= 8;

  const total = bullish + bearish + neutral;
  bullish = Math.round(bullish * 100 / total);
  bearish = Math.round(bearish * 100 / total);
  neutral = 100 - bullish - bearish;

  let priority = "P3_MEDIUM";
  let impactStrength = "LOW";

  if (!relevance.relevant) {
    priority = "P4_LOW";
  } else if (critical) {
    priority = "P1_CRITICAL";
    impactStrength = "HIGH";
  } else if (highImpact || relevance.relevanceScore >= 60) {
    priority = "P2_HIGH";
    impactStrength = "MEDIUM";
  }

  const official = news.sourceKind === "official";

  return {
    ...news,
    niftyRelevance: relevance.relevanceScore,
    relevanceTerms: relevance.hits,
    priority,
    impactStrength,
    verification: official
      ? "OFFICIAL_SOURCE — independent fact-check not completed"
      : "UNVERIFIED — independent corroboration required",
    sourceTypeScore: official ? 65 : 45,
    directionBias: direction,
    impactProbabilities: { bullish, bearish, neutral },
    scoringMethod: "transparent whole-word keyword rules; experimental",
    scoreWarning:
      "Percentages are experimental rule-based estimates, not calibrated forecasts or trading signals. Source labels do not prove claim truth."
  };
}

function normalizeTitle(title) {
  return cleanText(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function deduplicate(items) {
  const seen = new Set();

  return items.filter(item => {
    const key = normalizeTitle(item.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isFresh(news, now = Date.now()) {
  if (!news.published) return true;

  const age = now - Date.parse(news.published);
  // Ignore articles with dates older than 48h; retain unknown dates.
  return !Number.isFinite(age) || age <= 48 * 60 * 60 * 1000;
}

function prioritize(items) {
  return deduplicate(items.map(analyzeNewsItem))
    .filter(item => item.niftyRelevance > 0 && isFresh(item))
    .sort((a, b) =>
      (b.niftyRelevance - a.niftyRelevance) ||
      Date.parse(b.published || 0) - Date.parse(a.published || 0)
    )
    .slice(0, MAX_OUTPUT);
}

async function fetchSource(source) {
  try {
    const response = await fetch(source.url, {
      headers: {
        Accept: source.id === "gdelt"
          ? "application/json"
          : "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        "User-Agent": "BADAL-SEVERIYA-News-Intelligence/1.1"
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const body = await response.text();
    if (!body.trim()) throw new Error("Empty response");
    if (/^\s*<(?:!doctype html|html\b)/i.test(body)) {
      throw new Error("HTML response, not feed/data");
    }

    const items = source.id === "gdelt"
      ? parseGdelt(JSON.parse(body), source)
      : parseRss(body, source);

    return {
      sourceId: source.id,
      sourceName: source.name,
      status: items.length ? "CONNECTED" : "EMPTY",
      count: items.length,
      error: null,
      items
    };
  } catch (error) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      status: "ERROR",
      count: 0,
      error: String(error?.message || error),
      items: []
    };
  }
}

async function collectNews() {
  const sourceResults = await Promise.all(SOURCES.map(fetchSource));
  const allItems = sourceResults.flatMap(source => source.items);
  const news = prioritize(allItems);

  return {
    app: APP,
    version: VERSION,
    generatedAt: new Date().toISOString(),
    sourcesConfigured: SOURCES.length,
    connectedSources: sourceResults.filter(s => s.status === "CONNECTED").length,
    emptySources: sourceResults.filter(s => s.status === "EMPTY").length,
    failedSources: sourceResults.filter(s => s.status === "ERROR").length,
    fetchedItems: allItems.length,
    niftyRelevantItems: news.length,
    sourceStatus: sourceResults.map(({ items, ...status }) => status),
    news,
    methodology: {
      relevance: "whole-word keyword matching; transparent term list",
      direction: "rule-based sentiment bias only",
      verification: "official-source label only; independent claim verification is not implemented",
      percentages: "experimental and not calibrated against market outcomes",
      freshness: "known-dated articles older than 48 hours are filtered out"
    }
  };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store"
  };
}

async function cachedCollect() {
  const key = new Request(
    "https://badal-severiya-cache.invalid/news-intelligence-v1"
  );

  // Cache API is available in the Cloudflare Worker runtime.
  const cache = caches.default;
  const cached = await cache.match(key);

  if (cached) return cached.json();

  const data = await collectNews();

  const response = new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`
    }
  });

  await cache.put(key, response.clone());
  return data;
}

export {
  analyzeNewsItem,
  isNiftyRelevant,
  parseRss,
  parseGdelt,
  prioritize,
  SOURCES
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        app: APP,
        version: VERSION,
        configuredSources: SOURCES.length,
        mode: "experimental-rule-based-news-filter"
      }, { headers: corsHeaders() });
    }

    if (url.pathname === "/api/news-intelligence") {
      if (request.method !== "GET") {
        return Response.json({ error: "GET only" }, {
          status: 405,
          headers: corsHeaders()
        });
      }

      try {
        return Response.json(await cachedCollect(), {
          headers: corsHeaders()
        });
      } catch (error) {
        return Response.json({
          ok: false,
          app: APP,
          version: VERSION,
          error: String(error?.message || error)
        }, {
          status: 502,
          headers: corsHeaders()
        });
      }
    }

    return new Response("Not found", {
      status: 404,
      headers: corsHeaders()
    });
  }
};