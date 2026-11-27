
// BADAL SEVERIYA NEWS INTELLIGENCE — Phase 1.3.3
// Feed recovery, robust RSS/Atom parsing, relevance improvements,
// source diagnostics, corrected metrics, and cache refresh support.
// Experimental news context only. No signals, predictions, or advice.

const APP = "BADAL SEVERIYA NEWS INTELLIGENCE";
const VERSION = "1.3.3";

const CACHE_SECONDS = 120;
const MAX_PER_SOURCE = 40;
const MAX_OUTPUT = 100;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 9000;
const MAX_RETRIES = 1;

const SOURCES = [
  {
    id: "livemint-markets",
    name: "Livemint — Markets",
    type: "rss",
    retryLimit: 1,
    urls: [
      "https://www.livemint.com/rss/markets",
      "https://www.livemint.com/rss/marketsRSS"
    ]
  },
  {
    id: "bbc-business",
    name: "BBC News — Business",
    type: "rss",
    retryLimit: 1,
    urls: [
      "https://feeds.bbci.co.uk/news/business/rss.xml",
      "https://feeds.bbci.co.uk/news/rss.xml"
    ]
  },
  {
    id: "dw-business",
    name: "DW News — English",
    type: "rss",
    retryLimit: 1,
    urls: [
      "https://rss.dw.com/xml/rss-en-all",
      "https://rss.dw.com/rdf/rss-en-all"
    ]
  },
  {
    id: "aljazeera",
    name: "Al Jazeera — News",
    type: "rss",
    retryLimit: 1,
    urls: [
      "https://www.aljazeera.com/xml/rss/all.xml"
    ]
  },
  {
    id: "federal-reserve",
    name: "Federal Reserve — Press Releases",
    type: "rss",
    retryLimit: 1,
    urls: [
      "https://www.federalreserve.gov/feeds/press_all.xml"
    ]
  },
  {
    id: "rbi-press",
    name: "Reserve Bank of India — Press Releases",
    type: "rss",
    retryLimit: 1,
    urls: [
      "https://www.rbi.org.in/pressreleases_rss.xml"
    ]
  },
  {
    id: "rbi-notifications",
    name: "Reserve Bank of India — Notifications",
    type: "rss",
    retryLimit: 1,
    urls: [
      "https://www.rbi.org.in/notifications_rss.xml"
    ]
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
    urls: [
      "https://www.bseindia.com/data/xml/notices.xml"
    ]
  },
  {
    id: "gdelt",
    name: "GDELT — Global News Monitor",
    type: "json",
    retryLimit: 0,
    urls: [
      "https://api.gdeltproject.org/api/v2/doc/doc?query=India%20OR%20NIFTY%20OR%20RBI%20OR%20Indian%20markets%20OR%20Sensex&mode=ArtList&format=json&maxrecords=15&sort=DateDesc"
    ]
  }
];

const POSITIVE_TERMS = [
  "gain", "gains", "rise", "rises", "rising", "surge", "surges",
  "record high", "bullish", "rally", "rallies", "strong growth",
  "profit", "profits", "upgrade", "upgraded", "inflow", "inflows",
  "cuts rates", "rate cut", "eases", "easing", "beat estimates",
  "higher than expected", "positive outlook"
];

const NEGATIVE_TERMS = [
  "fall", "falls", "fell", "decline", "declines", "drop", "drops",
  "crash", "selloff", "sell-off", "bearish", "loss", "losses",
  "downgrade", "downgraded", "outflow", "outflows", "rate hike",
  "hikes rates", "inflation surge", "war", "conflict", "sanction",
  "weak growth", "miss estimates", "lower than expected",
  "default", "fraud", "bankruptcy"
];

const INDIA_MARKET_TERMS = [
  "nifty", "sensex", "nse", "bse", "bank nifty", "finnifty",
  "indian stock market", "india stock market", "indian markets",
  "india markets", "indian equities", "india equity market",
  "rupee", "inr", "rbi", "reserve bank of india",
  "fii", "fpi", "dii", "foreign investors",
  "sebi", "indian economy", "india economy",
  "stock exchange india", "indian shares"
];

const GLOBAL_MACRO_TERMS = [
  "federal reserve", "fed rate", "interest rate", "inflation",
  "crude oil", "oil price", "usd", "dollar", "bond yield",
  "geopolitical", "tariff", "trade war", "china", "global market",
  "commodity", "gold", "ecb", "central bank", "recession",
  "economic growth", "treasury yield", "monetary policy"
];

const INDIA_CONTEXT_TERMS = [
  "india", "indian", "rupee", "inr", "nifty", "sensex",
  "rbi", "fii", "fpi", "dii", "sebi", "mumbai"
];

const INDIA_CORPORATE_EVENT_TERMS = [
  "quarterly results", "financial results", "earnings",
  "dividend", "buyback", "merger", "acquisition",
  "share split", "stock split", "bonus shares",
  "board meeting", "order win", "contract win",
  "fund raising", "fundraising", "debt", "default",
  "rating downgrade", "rating upgrade", "ipo", "listing",
  "promoter", "pledge", "shareholding", "insider trading"
];

function decodeEntities(value = "") {
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    })
    .replace(/&#x([\da-f]+);/gi, (_, n) => {
      const code = parseInt(n, 16);
      return code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    });
}

function stripHtml(value = "") {
  return decodeEntities(
    String(value)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function getXmlTag(item, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const pattern = new RegExp(
    `<(?:[a-z0-9_-]+:)?${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-z0-9_-]+:)?${escaped}\\s*>`,
    "i"
  );

  const match = item.match(pattern);
  return match ? stripHtml(match[1]) : "";
}

function getXmlAttribute(item, tagName, attribute) {
  const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const pattern = new RegExp(
    `<(?:[a-z0-9_-]+:)?${escapedTag}\\b[^>]*\\b${escapedAttribute}\\s*=\\s*["']([^"']+)["']`,
    "i"
  );

  const match = item.match(pattern);
  return match ? decodeEntities(match[1].trim()) : "";
}

function parseDate(value) {
  if (!value) return null;

  const text = String(value).trim();

  // GDELT timestamp: YYYYMMDDTHHmmssZ
  const gdelt = text.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/i
  );

  if (gdelt) {
    const iso =
      `${gdelt[1]}-${gdelt[2]}-${gdelt[3]}T` +
      `${gdelt[4]}:${gdelt[5]}:${gdelt[6]}Z`;

    const date = new Date(iso);

    return Number.isFinite(date.getTime())
      ? date.toISOString()
      : null;
  }

  const date = new Date(text);

  return Number.isFinite(date.getTime())
    ? date.toISOString()
    : null;
}

function parseRss(xml, source, url) {
  const entries = [
    ...(xml.match(
      /<(?:[a-z0-9_-]+:)?item\b[\s\S]*?<\/(?:[a-z0-9_-]+:)?item\s*>/gi
    ) || []),
    ...(xml.match(
      /<(?:[a-z0-9_-]+:)?entry\b[\s\S]*?<\/(?:[a-z0-9_-]+:)?entry\s*>/gi
    ) || [])
  ].slice(0, MAX_PER_SOURCE);

  const items = entries.map((entry) => {
    const title = getXmlTag(entry, "title");

    const description =
      getXmlTag(entry, "description") ||
      getXmlTag(entry, "summary") ||
      getXmlTag(entry, "content:encoded") ||
      getXmlTag(entry, "encoded") ||
      getXmlTag(entry, "content");

    const textLink = getXmlTag(entry, "link");

    const hrefLink =
      getXmlAttribute(entry, "link", "href") ||
      getXmlAttribute(entry, "guid", "href");

    const link = textLink || hrefLink;

    const dateText =
      getXmlTag(entry, "pubDate") ||
      getXmlTag(entry, "published") ||
      getXmlTag(entry, "updated") ||
      getXmlTag(entry, "dc:date") ||
      getXmlTag(entry, "date");

    return {
      title,
      description,
      link,
      publishedAt: parseDate(dateText),
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: url
    };
  }).filter((item) => item.title && item.link);

  return {
    items,
    entryCount: entries.length
  };
}

function parseGdelt(json, source, url) {
  const articles = Array.isArray(json?.articles)
    ? json.articles
    : [];

  const items = articles.slice(0, MAX_PER_SOURCE).map((article) => ({
    title: stripHtml(article.title || ""),
    description: stripHtml(
      article.description || article.seendate || ""
    ),
    link: article.url || "",
    publishedAt: parseDate(article.seendate),
    sourceId: source.id,
    sourceName: article.domain || source.name,
    sourceUrl: url
  })).filter((item) => item.title && item.link);

  return {
    items,
    entryCount: articles.length
  };
}

function countTerms(text, terms) {
  return terms.filter((term) => text.includes(term)).length;
}

function scoreItem(item) {
  const text =
    `${item.title} ${item.description}`.toLowerCase();

  const directHits = countTerms(text, INDIA_MARKET_TERMS);
  const macroHits = countTerms(text, GLOBAL_MACRO_TERMS);
  const indiaContextHits = countTerms(text, INDIA_CONTEXT_TERMS);
  const corporateEventHits = countTerms(
    text,
    INDIA_CORPORATE_EVENT_TERMS
  );

  const positiveHits = countTerms(text, POSITIVE_TERMS);
  const negativeHits = countTerms(text, NEGATIVE_TERMS);

  const isExchangeSource =
    item.sourceId === "nse-announcements" ||
    item.sourceId === "bse-notices";

  const hasIndianCorporateEvent =
    isExchangeSource && corporateEventHits > 0;

  const globalMacroWithIndia =
    macroHits > 0 && indiaContextHits > 0;

  const relevant =
    directHits > 0 ||
    globalMacroWithIndia ||
    hasIndianCorporateEvent;

  let score = 0;

  if (directHits > 0) {
    score += Math.min(65, directHits * 20);
  }

  if (globalMacroWithIndia) {
    score += Math.min(25, macroHits * 7);
  }

  if (hasIndianCorporateEvent) {
    score += Math.min(40, corporateEventHits * 10);
  }

  score = Math.min(100, score);

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
    relevanceScore: relevant ? score : 0,
    sentiment,
    sentimentScore,
    impact,
    niftyRelevant: relevant
  };
}

function isRecent(item) {
  if (!item.publishedAt) return true;

  const time = new Date(item.publishedAt).getTime();

  if (!Number.isFinite(time)) return false;

  const age = Date.now() - time;

  return age <= MAX_AGE_MS &&
    age >= -5 * 60 * 1000;
}

function normalizeTitle(title = "") {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dedupe(items) {
  const seenTitles = new Set();
  const seenLinks = new Set();

  return items.filter((item) => {
    const titleKey = normalizeTitle(item.title);
    const linkKey = String(item.link || "")
      .trim()
      .toLowerCase()
      .replace(/[?#].*$/, "");

    if (!titleKey && !linkKey) return false;

    if (
      (titleKey && seenTitles.has(titleKey)) ||
      (linkKey && seenLinks.has(linkKey))
    ) {
      return false;
    }

    if (titleKey) seenTitles.add(titleKey);
    if (linkKey) seenLinks.add(linkKey);

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
            : "application/rss+xml,application/atom+xml,application/xml,text/xml,text/plain,*/*",
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
  let parsedCount = 0;
  let lastEntryCount = 0;

  for (const url of source.urls) {
    try {
      const fetched = await fetchWithRetry(url, source);

      const parsed = source.type === "json"
        ? parseGdelt(fetched.data, source, url)
        : parseRss(fetched.data, source, url);

      parsedCount = parsed.items.length;
      lastEntryCount = parsed.entryCount;

      if (parsed.items.length > 0) {
        return {
          sourceId: source.id,
          sourceName: source.name,
          status: "CONNECTED",
          fetchedItems: parsed.items.length,
          parsedEntries: parsed.entryCount,
          items: parsed.items,
          url
        };
      }

      errors.push(
        `${url}: parser returned 0 valid items ` +
        `(entries detected: ${parsed.entryCount})`
      );
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }

  const hasParseAttempt = lastEntryCount > 0 || parsedCount > 0;

  return {
    sourceId: source.id,
    sourceName: source.name,
    status: errors.length && errors.every(
      (error) => /HTTP \d+|Timeout|Network error/i.test(error)
    )
      ? "ERROR"
      : "EMPTY",
    fetchedItems: 0,
    parsedEntries: lastEntryCount,
    items: [],
    error: errors.join(" | "),
    diagnostic: hasParseAttempt
      ? "Feed returned entries but none passed item validation."
      : "No valid items were parsed from the attempted feed URLs."
  };
}

async function collectNews() {
  const results = await Promise.all(
    SOURCES.map(fetchSource)
  );

  const rawFetchedItems = results.reduce(
    (sum, result) => sum + result.fetchedItems,
    0
  );

  const allParsed = results
    .flatMap((result) => result.items)
    .map(scoreItem);

  const recent = allParsed.filter(isRecent);
  const oldOrInvalidItems = allParsed.length - recent.length;

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

  const relevantCount = unique.filter(
    (item) => item.niftyRelevant
  ).length;

  return {
    app: APP,
    version: VERSION,
    generatedAt: new Date().toISOString(),

    sourcesConfigured: SOURCES.length,
    connectedSources,
    emptySources,
    failedSources,

    fetchedItems: rawFetchedItems,
    parsedItems: allParsed.length,
    filteredOldOrInvalidItems: oldOrInvalidItems,
    uniqueItems: unique.length,
    outputItems: output.length,
    niftyRelevantItems: relevantCount,

    sourceStatus: results.map(
      ({ items, ...status }) => status
    ),

    news: output,

    methodology: {
      mode: "experimental-rule-based-news-filter-v1.3.3",
      disclaimer:
        "Educational news context only. Not live trading signals, predictions, or investment advice.",
      reliability:
        "Feed failures are isolated per source. RSS and Atom parsing supports common item/entry, CDATA, namespace, and link formats. India-market relevance uses direct Indian market terms, global macro terms combined with India context, or market-related events from NSE/BSE feeds. Sentiment and relevance remain keyword-based and imperfect."
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

async function getCachedNews(cache, forceRefresh = false) {
  const key = new Request(
    `https://badal-severiya-cache.local/news-intelligence-${VERSION}`
  );

  if (forceRefresh) {
    await cache.delete(key);
  } else {
    const cached = await cache.match(key);
    if (cached) return cached;
  }

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
    mode: "experimental-rss-atom-recovery-india-market-relevance-v1.3.3",
    endpoints: [
      "/api/health",
      "/api/news-intelligence",
      "/api/news-intelligence?refresh=1"
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
        const forceRefresh =
          url.searchParams.get("refresh") === "1";

        return await getCachedNews(
          caches.default,
          forceRefresh
        );
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
        "/api/news-intelligence",
        "/api/news-intelligence?refresh=1"
      ]
    }, 404);
  }
};
