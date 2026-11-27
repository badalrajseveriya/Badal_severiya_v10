// BADAL SEVERIYA NEWS INTELLIGENCE — Phase 1.3.0
// Source reliability, retries, fallback feeds, and safer response parsing.
// Experimental only. No fact-check certification or trading prediction.

const APP = "BADAL SEVERIYA NEWS INTELLIGENCE";
const VERSION = "1.3.0";
const CACHE_SECONDS = 180;
const MAX_PER_SOURCE = 35;
const MAX_OUTPUT = 80;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;

const SOURCES = [
  {
    id: "google-india-market",
    name: "Google News — India Markets",
    kind: "aggregator",
    url: "https://news.google.com/rss/search?q=NIFTY+OR+Indian+stock+market+OR+RBI+OR+SEBI+OR+India+inflation&hl=en-IN&gl=IN&ceid=IN:en",
    fallbackUrls: [
      "https://news.google.com/rss/search?q=NIFTY+India+market+RBI+SEBI&hl=en-IN&gl=IN&ceid=IN:en",
      "https://news.google.com/rss/search?q=Indian+stock+market+economy&hl=en-IN&gl=IN&ceid=IN:en"
    ]
  },
  {
    id: "google-global-macro",
    name: "Google News — Global Macro",
    kind: "aggregator",
    url: "https://news.google.com/rss/search?q=Federal+Reserve+OR+US+inflation+OR+oil+prices+OR+war+OR+trade+tariff&hl=en&gl=US&ceid=US:en",
    fallbackUrls: [
      "https://news.google.com/rss/search?q=Federal+Reserve+inflation+oil+prices+tariffs&hl=en&gl=US&ceid=US:en",
      "https://news.google.com/rss/search?q=global+economy+central+bank+oil&hl=en&gl=US&ceid=US:en"
    ]
  },
  {
    id: "google-nifty-impact",
    name: "Google News — NIFTY Impact",
    kind: "aggregator",
    url: "https://news.google.com/rss/search?q=crude+oil+OR+USD+INR+OR+FII+OR+India+GDP+OR+Indian+economy&hl=en-IN&gl=IN&ceid=IN:en",
    fallbackUrls: [
      "https://news.google.com/rss/search?q=crude+oil+USD+INR+FII+India+GDP&hl=en-IN&gl=IN&ceid=IN:en",
      "https://news.google.com/rss/search?q=India+economy+foreign+investment+rupee&hl=en-IN&gl=IN&ceid=IN:en"
    ]
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
    url: "https://api.gdeltproject.org/api/v2/doc/doc?query=NIFTY%20OR%20RBI%20OR%20%22India%20stock%20market%22%20OR%20%22crude%20oil%22&mode=ArtList&format=json&maxrecords=50&sort=DateDesc",
    fallbackUrls: [
      "https://api.gdeltproject.org/api/v2/doc/doc?query=NIFTY%20OR%20RBI%20OR%20India&mode=ArtList&format=json&maxrecords=50&sort=DateDesc",
      "https://api.gdeltproject.org/api/v2/doc/doc?query=%22India%20stock%20market%22&mode=ArtList&format=json&maxrecords=50&sort=DateDesc"
    ]
  }
];

// Direct Indian market anchors can qualify without broad keyword matching.
const INDIA_MARKET_ANCHORS = [
  "nifty", "nifty 50", "bank nifty", "nifty bank",
  "sensex", "bse sensex", "indian stock market",
  "india stock market", "indian equities", "indian equity market",
  "nse", "bse", "sebi", "reserve bank of india",
  "rbi monetary policy", "fii", "fpi", "dii",
  "usd inr", "rupee", "indian rupee",
  "nifty futures", "sensex futures", "india vix"
];

const INDIA_CONTEXT_ANCHORS = [
  "india", "indian", "rbi", "reserve bank"
];

const INDIA_FINANCIAL_CONTEXT = [
  "stock market", "equity", "equities", "share market",
  "shares", "nifty", "sensex", "bse", "nse", "sebi",
  "rupee", "inr", "forex", "currency", "bond", "bond yield",
  "yield", "interest rate", "monetary policy", "inflation",
  "cpi", "wpi", "gdp", "economic growth", "fiscal deficit",
  "liquidity", "banking", "bank", "credit", "fii", "fpi",
  "dii", "foreign investment", "capital flows", "market",
  "financial", "budget", "tax", "government borrowing",
  "trade deficit", "current account", "oil import",
  "crude import", "industrial production"
];

const GLOBAL_MACRO_ANCHORS = [
  "federal reserve", "fed", "ecb", "bank of england",
  "bank of japan", "central bank", "opec", "crude oil",
  "oil prices", "brent crude", "wti crude",
  "strait of hormuz", "red sea shipping",
  "shipping disruption", "supply chain disruption",
  "trade tariff", "tariffs", "sanctions",
  "global recession", "sovereign default",
  "us inflation", "china economy", "european economy",
  "us treasury", "treasury yields"
];

const GLOBAL_FINANCIAL_CONTEXT = [
  "stock market", "equity", "equities", "market",
  "financial market", "bond", "bond yield", "treasury",
  "yield", "interest rate", "rate cut", "rate hike",
  "inflation", "cpi", "currency", "forex", "dollar",
  "exchange rate", "crude", "oil price", "oil supply",
  "energy price", "commodity", "trade", "tariff",
  "export", "import", "shipping", "supply chain",
  "liquidity", "central bank", "monetary policy",
  "recession", "gdp", "economic growth", "banking",
  "credit", "capital flow", "investor", "investment",
  "financial", "risk appetite"
];

const HIGH_IMPACT_TERMS = [
  "market crash", "market plunge", "sharp sell-off",
  "financial crisis", "bank failure", "banking crisis",
  "liquidity crisis", "sovereign default",
  "emergency rate hike", "emergency rate cut",
  "oil supply disruption", "oil supply shock",
  "strait of hormuz blockade", "exchange outage",
  "trading halt", "major market disruption",
  "record inflation", "unexpected rate hike",
  "unexpected rate cut", "currency crisis",
  "credit crisis", "systemic risk"
];

const CRITICAL_TERMS = [
  "market crash", "financial crisis", "bank failure",
  "systemic banking crisis", "liquidity crisis",
  "sovereign default", "oil supply disruption",
  "strait of hormuz blockade", "exchange outage",
  "currency crisis", "credit crisis"
];

const BULLISH_TERMS = [
  "rate cut", "cuts rates", "lower interest",
  "inflation cools", "inflation falls", "oil prices fall",
  "crude falls", "peace deal", "stimulus",
  "strong growth", "record profit", "earnings beat",
  "upgrade", "liquidity injection", "tax cut",
  "trade deal", "reopens", "easing",
  "buying returns", "foreign inflows"
];

const BEARISH_TERMS = [
  "rate hike", "raises rates", "inflation rises",
  "inflation accelerates", "oil prices rise",
  "crude surges", "sanctions", "tariff",
  "trade war", "recession", "default",
  "market crash", "market plunge", "bank failure",
  "liquidity crisis", "downgrade", "shutdown",
  "supply disruption", "sell-off", "selloff",
  "outflow", "foreign outflows", "currency crisis",
  "bond yields rise", "yields surge"
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

function termMatch(text, term) {
  const normalized = String(text || "").toLowerCase();
  const t = String(term || "").toLowerCase().trim();
  if (!t) return false;

  const pattern = escapeRegExp(t).replace(/\s+/g, "\\s+");

  return new RegExp(
    `(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`,
    "i"
  ).test(normalized);
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

  const s = String(raw).trim();

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

  const entries = rssItems.length
    ? rssItems
    : [
        ...String(xml).matchAll(
          /<(?:[\w.-]+:)?entry\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?entry\s*>/gi
        )
      ];

  return entries.slice(0, MAX_PER_SOURCE).map(match => {
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
  const text = `${news.title || ""} ${news.description || ""}`;

  const directHits = countHits(text, INDIA_MARKET_ANCHORS);
  const indiaHits = countHits(text, INDIA_CONTEXT_ANCHORS);
  const indiaFinanceHits = countHits(text, INDIA_FINANCIAL_CONTEXT);
  const globalHits = countHits(text, GLOBAL_MACRO_ANCHORS);
  const globalFinanceHits = countHits(text, GLOBAL_FINANCIAL_CONTEXT);

  const directMatch = directHits > 0;
  const indiaContextMatch = indiaHits > 0 && indiaFinanceHits > 0;
  const globalContextMatch = globalHits > 0 && globalFinanceHits > 0;

  const relevant = directMatch || indiaContextMatch || globalContextMatch;

  const hits = [
    ...INDIA_MARKET_ANCHORS.filter(term => termMatch(text, term)),
    ...INDIA_CONTEXT_ANCHORS.filter(term => termMatch(text, term)),
    ...INDIA_FINANCIAL_CONTEXT.filter(term => termMatch(text, term)),
    ...GLOBAL_MACRO_ANCHORS.filter(term => termMatch(text, term)),
    ...GLOBAL_FINANCIAL_CONTEXT.filter(term => termMatch(text, term))
  ];

  const uniqueHits = [...new Set(hits)];

  let relevanceScore = 0;

  if (directMatch) {
    relevanceScore = Math.min(100, 65 + directHits * 8);
  } else if (indiaContextMatch) {
    relevanceScore = Math.min(85, 35 + indiaFinanceHits * 10);
  } else if (globalContextMatch) {
    relevanceScore = Math.min(75, 25 + globalFinanceHits * 8);
  }

  return {
    relevant,
    hits: uniqueHits.slice(0, 12),
    relevanceScore,
    relevanceType: directMatch
      ? "DIRECT_INDIA_MARKET"
      : indiaContextMatch
        ? "INDIA_MACRO_FINANCIAL"
        : globalContextMatch
          ? "GLOBAL_MACRO_TRANSMISSION"
          : "NOT_RELEVANT"
  };
}

function analyzeNewsItem(news) {
  const text = `${news.title || ""} ${news.description || ""}`;
  const relevance = isNiftyRelevant(news);

  const bullishHits = relevance.relevant
    ? countHits(text, BULLISH_TERMS)
    : 0;
  const bearishHits = relevance.relevant
    ? countHits(text, BEARISH_TERMS)
    : 0;
  const impactHits = relevance.relevant
    ? countHits(text, HIGH_IMPACT_TERMS)
    : 0;
  const criticalHits = relevance.relevant
    ? countHits(text, CRITICAL_TERMS)
    : 0;

  const highImpact = impactHits >= 1;
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
  } else if (highImpact || relevance.relevanceScore >= 75) {
    priority = "P2_HIGH";
    impactStrength = "MEDIUM";
  }

  const official = news.sourceKind === "official";

  return {
    ...news,
    niftyRelevance: relevance.relevanceScore,
    relevanceTerms: relevance.hits,
    relevanceType: relevance.relevanceType,
    priority,
    impactStrength,
    verification: official
      ? "OFFICIAL_SOURCE — independent fact-check not completed"
      : "UNVERIFIED — independent corroboration required",
    sourceTypeScore: official ? 65 : 45,
    verificationConfidence: official ? 65 : 45,
    directionBias: direction,
    impactProbabilities: { bullish, bearish, neutral },
    scoringMethod: "contextual whole-word rules; experimental",
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

  const published = Date.parse(news.published);
  if (!Number.isFinite(published)) return true;

  const age = now - published;

  return age <= MAX_AGE_MS && age >= -10 * 60 * 1000;
}

function prioritize(items) {
  return deduplicate(items.map(analyzeNewsItem))
    .filter(item => item.niftyRelevance > 0 && isFresh(item))
    .sort((a, b) =>
      (b.niftyRelevance - a.niftyRelevance) ||
      (Date.parse(b.published || 0) - Date.parse(a.published || 0))
    )
    .slice(0, MAX_OUTPUT);
}

// Fetch with timeout and retry for temporary server/network failures.
async function fetchWithRetry(url, source) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          Accept: source.id === "gdelt"
            ? "application/json"
            : "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
          "User-Agent": `BADAL-SEVERIYA-News-Intelligence/${VERSION}`
        }
      });

      if (!response.ok) {
        const retryable =
          response.status === 429 ||
          response.status >= 500;

        throw Object.assign(
          new Error(`HTTP ${response.status}`),
          { retryable }
        );
      }

      const body = await response.text();

      if (!body.trim()) {
        throw Object.assign(new Error("Empty response"), {
          retryable: true
        });
      }

      if (/^\s*<(?:!doctype html|html\b)/i.test(body)) {
        throw Object.assign(new Error("HTML response, not feed/data"), {
          retryable: false
        });
      }

      return body;
    } catch (error) {
      lastError = error;

      const retryable =
        error?.retryable === true ||
        error?.name === "TimeoutError" ||
        error?.name === "AbortError" ||
        error?.name === "TypeError";

      if (!retryable || attempt >= MAX_RETRIES) break;

      // Small exponential backoff: 400ms, then 800ms.
      await new Promise(resolve =>
        setTimeout(resolve, 400 * Math.pow(2, attempt))
      );
    }
  }

  throw lastError || new Error("Fetch failed");
}

function parseSourceBody(body, source) {
  if (source.id === "gdelt") {
    let json;

    try {
      json = JSON.parse(body);
    } catch {
      const preview = cleanText(body).slice(0, 140);
      throw new Error(
        `GDELT non-JSON response: ${preview || "empty error response"}`
      );
    }

    if (!Array.isArray(json?.articles)) {
      throw new Error("GDELT JSON missing articles array");
    }

    return parseGdelt(json, source);
  }

  return parseRss(body, source);
}

async function fetchSource(source) {
  const urls = [
    source.url,
    ...(Array.isArray(source.fallbackUrls) ? source.fallbackUrls : [])
  ].filter(Boolean);

  const errors = [];

  for (let urlIndex = 0; urlIndex < urls.length; urlIndex++) {
    const url = urls[urlIndex];

    try {
      const body = await fetchWithRetry(url, source);
      const items = parseSourceBody(body, source);

      if (items.length) {
        return {
          sourceId: source.id,
          sourceName: source.name,
          status: "CONNECTED",
          count: items.length,
          error: null,
          fallbackUsed: urlIndex > 0,
          items
        };
      }

      errors.push(
        urlIndex === 0
          ? "Primary feed returned no items"
          : `Fallback ${urlIndex} returned no items`
      );
    } catch (error) {
      errors.push(
        `Feed ${urlIndex + 1}: ${String(error?.message || error)}`
      );
    }
  }

  const errorText = errors.join(" | ");

  return {
    sourceId: source.id,
    sourceName: source.name,
    status: "ERROR",
    count: 0,
    error: errorText.slice(0, 500),
    fallbackUsed: urls.length > 1,
    items: []
  };
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
      relevance: "direct Indian market anchors, Indian financial context, or global macro with explicit financial transmission context",
      direction: "rule-based sentiment bias only; unrelated stories are not direction-scored",
      priority: "P1 reserved for explicit severe financial or market crisis terms",
      verification: "official-source label only; independent claim verification is not implemented",
      percentages: "experimental and not calibrated against market outcomes",
      freshness: "known-dated articles older than 48 hours or over 10 minutes in the future are filtered",
      reliability: "temporary HTTP failures are retried; configured fallback URLs are attempted; GDELT non-JSON responses are safely reported"
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
    "https://badal-severiya-cache.invalid/news-intelligence-v1.3"
  );

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
  isFresh,
  termMatch,
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
        mode: "experimental-contextual-news-filter-with-source-retries"
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