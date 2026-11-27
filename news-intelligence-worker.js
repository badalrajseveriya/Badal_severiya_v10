// BADAL SEVERIYA NEWS INTELLIGENCE ENGINE — Phase 1
// Free-source collection + NIFTY relevance filter + transparent rule-based scoring.
// No AI inference, fact-check certification, live-trading signal, or prediction is claimed.

const APP = "BADAL SEVERIYA NEWS INTELLIGENCE";
const VERSION = "1.0.0-phase1";
const MAX_PER_SOURCE = 35;
const MAX_OUTPUT = 80;
const CACHE_SECONDS = 180;

const SOURCES = [
  {
    id: "google-india-market",
    name: "Google News RSS — India Markets",
    kind: "aggregator",
    url: "https://news.google.com/rss/search?q=(NIFTY+OR+Indian+stock+market+OR+RBI+OR+SEBI+OR+India+inflation)+when:1d&hl=en-IN&gl=IN&ceid=IN:en"
  },
  {
    id: "google-global-macro",
    name: "Google News RSS — Global Macro",
    kind: "aggregator",
    url: "https://news.google.com/rss/search?q=(Federal+Reserve+OR+US+inflation+OR+oil+prices+OR+war+OR+trade+tariff)+when:1d&hl=en&gl=US&ceid=US:en"
  },
  {
    id: "google-nifty-relevance",
    name: "Google News RSS — NIFTY Impact Topics",
    kind: "aggregator",
    url: "https://news.google.com/rss/search?q=(crude+oil+OR+USD+INR+OR+FII+OR+India+GDP+OR+Indian+economy)+when:1d&hl=en-IN&gl=IN&ceid=IN:en"
  },
  {
    id: "bbc-world",
    name: "BBC World RSS",
    kind: "publisher",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml"
  },
  {
    id: "dw-world",
    name: "DW World RSS",
    kind: "publisher",
    url: "https://rss.dw.com/rdf/rss-en-world"
  },
  {
    id: "aljazeera",
    name: "Al Jazeera RSS",
    kind: "publisher",
    url: "https://www.aljazeera.com/xml/rss/all.xml"
  },
  {
    id: "fed",
    name: "Federal Reserve Press Releases",
    kind: "official",
    url: "https://www.federalreserve.gov/feeds/press_all.xml"
  },
  {
    id: "rbi",
    name: "RBI Press Releases",
    kind: "official",
    url: "https://rbi.org.in/pressreleases_rss.xml"
  },
  {
    id: "nse-announcements",
    name: "NSE Corporate Announcements",
    kind: "official",
    url: "https://archives.nseindia.com/content/RSS/Online_announcements.xml"
  },
  {
    id: "gdelt",
    name: "GDELT Global News Search",
    kind: "aggregator",
    url: "https://api.gdeltproject.org/api/v2/doc/doc?query=(NIFTY%20OR%20India%20stock%20market%20OR%20RBI%20OR%20crude%20oil%20OR%20Federal%20Reserve)&mode=ArtList&format=json&maxrecords=50&sort=DateDesc"
  }
];

const NIFTY_TERMS = [
  "nifty", "india", "indian", "rbi", "sebi", "nse", "bse",
  "sensex", "rupee", "inr", "fii", "fpi", "dii", "crude",
  "oil", "fed", "federal reserve", "inflation", "cpi", "gdp",
  "rate", "interest", "tariff", "trade", "war", "sanction",
  "bank", "bond", "yield", "vix", "stock", "market", "economy",
  "budget", "tax", "monsoon", "cyclone", "election", "policy",
  "earnings", "index", "liquidity", "recession", "commodity",
  "china", "us", "united states", "europe", "opec"
];

const HIGH_IMPACT_TERMS = [
  "war", "invasion", "missile", "attack", "terror", "terrorism",
  "emergency", "crisis", "default", "crash", "collapse", "sanction",
  "sanctions", "ceasefire", "blockade", "shutdown", "surprise rate",
  "rate cut", "rate hike", "interest rate", "inflation", "cpi",
  "federal reserve", "rbi", "policy decision", "tariff", "trade war",
  "oil surge", "crude oil", "earthquake", "cyclone", "flood",
  "pandemic", "major disruption", "bank failure", "liquidity crisis",
  "budget", "gdp"
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

function tag(xml, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const m = String(xml).match(
    new RegExp(
      `<(?:(?:[\\w.-]+):)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${escaped}\\s*>`,
      "i"
    )
  );

  return m ? cleanText(m[1]) : "";
}

function attr(tagText, name) {
  const m = String(tagText).match(
    new RegExp(`\\b${name}\\s*=\\s*[\\"']([^\\"']+)[\\"']`, "i")
  );

  return m ? cleanText(m[1]) : "";
}

function parseRss(xml, source) {
  const itemMatches = [
    ...String(xml).matchAll(
      /<(?:[\w.-]+:)?item\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?item\s*>/gi
    )
  ];

  const entryMatches = itemMatches.length
    ? itemMatches
    : [
        ...String(xml).matchAll(
          /<(?:[\w.-]+:)?entry\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?entry\s*>/gi
        )
      ];

  return entryMatches.slice(0, MAX_PER_SOURCE).map(m => {
    const entry = m[1];

    const title = tag(entry, "title");

    const description =
      tag(entry, "description") ||
      tag(entry, "summary") ||
      tag(entry, "content");

    const pubDate =
      tag(entry, "pubDate") ||
      tag(entry, "published") ||
      tag(entry, "updated") ||
      tag(entry, "date");

    const linkTag = (
      entry.match(/<(?:[\w.-]+:)?link\b[^>]*>/i) || [""]
    )[0];

    let link = attr(linkTag, "href") || tag(entry, "link");

    try {
      link = new URL(link, "https://news.invalid").href;

      if (link.startsWith("https://news.invalid")) {
        link = "";
      }
    } catch {
      link = "";
    }

    const timestamp = Date.parse(pubDate);

    return {
      title,
      description,
      link,
      published: Number.isFinite(timestamp)
        ? new Date(timestamp).toISOString()
        : null,
      sourceId: source.id,
      sourceName: source.name,
      sourceKind: source.kind,
      sourceStatus: "FETCHED"
    };
  }).filter(item => item.title);
}

function parseGdelt(json, source) {
  const articles = Array.isArray(json?.articles)
    ? json.articles
    : [];

  return articles.slice(0, MAX_PER_SOURCE).map(a => ({
    title: cleanText(a.title),
    description: cleanText(a.seendate || a.snippet || ""),
    link: safeHttps(a.url),
    published: parseGdeltDate(a.seendate),
    sourceId: source.id,
    sourceName: cleanText(a.source || source.name),
    sourceKind: "aggregator",
    sourceStatus: "FETCHED"
  })).filter(a => a.title);
}

function parseGdeltDate(raw) {
  if (!raw) return null;

  const s = String(raw);

  if (/^\d{14}$/.test(s)) {
    const iso =
      `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` +
      `T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`;

    const d = Date.parse(iso);

    return Number.isFinite(d)
      ? new Date(d).toISOString()
      : null;
  }

  const d = Date.parse(s);

  return Number.isFinite(d)
    ? new Date(d).toISOString()
    : null;
}

function safeHttps(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}

function normalizeTitle(title) {
  return cleanText(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function isNiftyRelevant(news) {
  const text = `${news.title} ${news.description}`.toLowerCase();

  const hits = NIFTY_TERMS.filter(term => text.includes(term));

  return {
    relevant: hits.length > 0,
    hits: hits.slice(0, 8),
    relevanceScore: Math.min(
      100,
      hits.length * 17 +
      (hits.some(t =>
        [
          "nifty", "india", "rbi", "crude",
          "federal reserve", "inflation", "fii",
          "tariff", "war"
        ].includes(t)
      ) ? 25 : 0)
    )
  };
}

function countHits(text, terms) {
  return terms.reduce(
    (sum, term) => sum + (text.includes(term) ? 1 : 0),
    0
  );
}

function analyzeNewsItem(news) {
  const text =
    `${news.title || ""} ${news.description || ""}`.toLowerCase();

  const rel = isNiftyRelevant(news);

  const bull = countHits(text, BULLISH_TERMS);
  const bear = countHits(text, BEARISH_TERMS);
  const impactHits = countHits(text, HIGH_IMPACT_TERMS);

  const highImpact =
    impactHits >= 2 ||
    /\b(rbi|federal reserve|fed|war|invasion|terror|crisis|tariff|oil|crude|inflation|gdp)\b/i
      .test(news.title || "");

  let direction = "NEUTRAL";

  if (bull > bear) direction = "BULLISH";
  else if (bear > bull) direction = "BEARISH";

  let bullish = 34;
  let bearish = 33;
  let neutral = 33;

  if (direction === "BULLISH") {
    bullish += Math.min(24, bull * 8);
    bearish -= Math.min(12, bull * 3);
  }

  if (direction === "BEARISH") {
    bearish += Math.min(24, bear * 8);
    bullish -= Math.min(12, bear * 3);
  }

  if (highImpact && direction !== "NEUTRAL") {
    neutral -= 8;
  }

  const total = bullish + bearish + neutral;

  bullish = Math.round(bullish * 100 / total);
  bearish = Math.round(bearish * 100 / total);
  neutral = 100 - bullish - bearish;

  const sourceConfidence =
    news.sourceKind === "official" ? 65 : 45;

  return {
    ...news,

    niftyRelevance: rel.relevanceScore,
    relevanceTerms: rel.hits,

    priority: !rel.relevant
      ? "P4_LOW"
      : highImpact
        ? "P1_CRITICAL"
        : rel.relevanceScore >= 60
          ? "P2_HIGH"
          : "P3_MEDIUM",

    impactStrength: !rel.relevant
      ? "LOW"
      : highImpact
        ? "HIGH"
        : rel.relevanceScore >= 60
          ? "MEDIUM"
          : "LOW",

    verification: news.sourceKind === "official"
      ? "OFFICIAL_SOURCE — claim not independently fact-checked"
      : "UNVERIFIED — corroboration required",

    verificationConfidence: sourceConfidence,

    directionBias: direction,

    impactProbabilities: {
      bullish,
      bearish,
      neutral
    },

    scoringMethod:
      "transparent keyword rules; experimental; not calibrated",

    scoreWarning:
      "These percentages are rule-based experimental estimates, not forecasts or trading signals. They do not establish claim truth."
  };
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

function prioritize(items) {
  return deduplicate(items.map(analyzeNewsItem))
    .filter(item => item.niftyRelevance > 0)
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
        "Accept": source.id === "gdelt"
          ? "application/json"
          : "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",

        "User-Agent": "BADAL-SEVERIYA-News-Intelligence/1.0"
      },

      cf: {
        cacheTtl: 0,
        cacheEverything: false
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();

    if (!text.trim()) {
      throw new Error("Empty source response");
    }

    if (/^\s*<(?:!doctype html|html\b)/i.test(text)) {
      throw new Error("HTML response instead of feed/data");
    }

    const items = source.id === "gdelt"
      ? parseGdelt(JSON.parse(text), source)
      : parseRss(text, source);

    return {
      sourceId: source.id,
      sourceName: source.name,
      status: items.length ? "CONNECTED" : "EMPTY",
      count: items.length,
      error: null,
      items
    };
  } catch (e) {
    return {
      sourceId: source.id,
      sourceName: source.name,
      status: "ERROR",
      count: 0,
      error: String(e?.message || e),
      items: []
    };
  }
}

async function collectNews() {
  const sourceResults = await Promise.all(
    SOURCES.map(fetchSource)
  );

  const all = sourceResults.flatMap(s => s.items);
  const relevant = prioritize(all);

  return {
    app: APP,
    version: VERSION,
    generatedAt: new Date().toISOString(),

    sourcesConfigured: SOURCES.length,

    connectedSources:
      sourceResults.filter(s => s.status === "CONNECTED").length,

    emptySources:
      sourceResults.filter(s => s.status === "EMPTY").length,

    failedSources:
      sourceResults.filter(s => s.status === "ERROR").length,

    fetchedItems: all.length,

    deduplicatedNiftyRelevantItems: relevant.length,

    sourceStatus: sourceResults.map(({ items, ...summary }) => summary),

    news: relevant,

    methodology: {
      relevance:
        "keyword-based filter; terms are transparent and tunable",

      direction:
        "keyword-based sentiment bias only",

      verification:
        "source-type label only; independent cross-source claim matching and fact-checking not implemented in phase 1",

      percentages:
        "experimental rules; not calibrated against outcomes"
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
  const cacheKey = new Request(
    "https://badal-severiya-cache.invalid/news-intelligence-v1"
  );

  const cache = caches.default;

  const existing = await cache.match(cacheKey);

  if (existing) {
    return existing.json();
  }

  const payload = await collectNews();

  const response = new Response(
    JSON.stringify(payload),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_SECONDS}`
      }
    }
  );

  await cache.put(cacheKey, response.clone());

  return payload;
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
      return Response.json(
        {
          ok: true,
          app: APP,
          version: VERSION,
          configuredSources: SOURCES.length,
          mode: "experimental-rule-based-news-filter"
        },
        {
          headers: corsHeaders()
        }
      );
    }

    if (url.pathname === "/api/news-intelligence") {
      if (request.method !== "GET") {
        return Response.json(
          { error: "GET only" },
          {
            status: 405,
            headers: corsHeaders()
          }
        );
      }

      try {
        return Response.json(
          await cachedCollect(),
          {
            headers: corsHeaders()
          }
        );
      } catch (error) {
        return Response.json(
          {
            ok: false,
            error: String(error?.message || error),
            app: APP,
            version: VERSION
          },
          {
            status: 502,
            headers: corsHeaders()
          }
        );
      }
    }

    return new Response("Not found", {
      status: 404,
      headers: corsHeaders()
    });
  }
};