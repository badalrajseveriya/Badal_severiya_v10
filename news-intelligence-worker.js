// BADAL SEVERIYA NEWS INTELLIGENCE — Phase 1.3.5
// Structured Indian-market and global-market news context.
// Educational information only; no trading signals, predictions, or advice.

const APP = "BADAL SEVERIYA NEWS INTELLIGENCE";
const VERSION = "1.3.5";
const CACHE_SECONDS = 120;
const MAX_PER_SOURCE = 40;
const MAX_OUTPUT = 100;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 9000;

const SOURCES = [
  { id: "livemint-markets", name: "Livemint — Markets", type: "rss", urls: ["https://www.livemint.com/rss/markets"] },
  { id: "bbc-business", name: "BBC News — Business", type: "rss", urls: ["https://feeds.bbci.co.uk/news/business/rss.xml"] },
  { id: "dw-business", name: "DW News — English", type: "rss", urls: ["https://rss.dw.com/xml/rss-en-all"] },
  { id: "aljazeera", name: "Al Jazeera — News", type: "rss", urls: ["https://www.aljazeera.com/xml/rss/all.xml"] },
  { id: "federal-reserve", name: "Federal Reserve — Press Releases", type: "rss", urls: ["https://www.federalreserve.gov/feeds/press_all.xml"] },
  { id: "rbi-press", name: "Reserve Bank of India — Press Releases", type: "rss", urls: ["https://www.rbi.org.in/pressreleases_rss.xml"] },
  { id: "rbi-notifications", name: "Reserve Bank of India — Notifications", type: "rss", urls: ["https://www.rbi.org.in/notifications_rss.xml"] },
  { id: "nse-announcements", name: "NSE India — Announcements", type: "rss", urls: ["https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml"] },
  { id: "bse-notices", name: "BSE — Notices", type: "rss", urls: ["https://www.bseindia.com/data/xml/notices.xml"] },
  { id: "gdelt", name: "GDELT — Global News Monitor", type: "json", urls: ["https://api.gdeltproject.org/api/v2/doc/doc?query=India%20OR%20NIFTY%20OR%20RBI%20OR%20Indian%20markets%20OR%20Sensex&mode=ArtList&format=json&maxrecords=15&sort=DateDesc"] }
];

const POSITIVE_TERMS = ["gain", "gains", "rise", "rises", "rising", "surge", "surges", "record high", "bullish", "rally", "rallies", "strong growth", "profit", "profits", "upgrade", "upgraded", "inflow", "inflows", "cuts rates", "rate cut", "eases", "easing", "beat estimates", "higher than expected", "positive outlook"];
const NEGATIVE_TERMS = ["fall", "falls", "fell", "decline", "declines", "drop", "drops", "crash", "selloff", "sell-off", "bearish", "loss", "losses", "downgrade", "downgraded", "outflow", "outflows", "rate hike", "hikes rates", "inflation surge", "weak growth", "miss estimates", "lower than expected", "default", "fraud", "bankruptcy"];

function decodeEntities(value = "") {
  return String(value).replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => {
      const c = Number(n); return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : "";
    }).replace(/&#x([\da-f]+);/gi, (_, n) => {
      const c = parseInt(n, 16); return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : "";
    });
}

function stripHtml(value = "") {
  return decodeEntities(String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function getTag(xml, tag) {
  const safe = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<(?:(?:[\\w.-]+):)?${safe}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${safe}\\s*>`, "i");
  const m = String(xml).match(re);
  return m ? stripHtml(m[1]) : "";
}

function getAttribute(xml, tag, attr) {
  const safeTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const safeAttr = attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<(?:(?:[\\w.-]+):)?${safeTag}\\b[^>]*\\b${safeAttr}\\s*=\\s*["']([^"']+)["']`, "i");
  const m = String(xml).match(re);
  return m ? decodeEntities(m[1].trim()) : "";
}

function parseDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  const gdelt = s.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/i);
  const input = gdelt ? `${gdelt[1]}-${gdelt[2]}-${gdelt[3]}T${gdelt[4]}:${gdelt[5]}:${gdelt[6]}Z` : s;
  const d = new Date(input);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function parseRss(xml, source = {}, url = "") {
  const raw = String(xml || "");
  const entries = [
    ...(raw.match(/<(?:[\w.-]+:)?item\b[\s\S]*?<\/(?:[\w.-]+:)?item\s*>/gi) || []),
    ...(raw.match(/<(?:[\w.-]+:)?entry\b[\s\S]*?<\/(?:[\w.-]+:)?entry\s*>/gi) || [])
  ].slice(0, MAX_PER_SOURCE);

  const items = entries.map(entry => {
    const title = getTag(entry, "title");
    const description = getTag(entry, "description") || getTag(entry, "summary") || getTag(entry, "content:encoded") || getTag(entry, "content");
    const link = getTag(entry, "link") || getAttribute(entry, "link", "href") || getTag(entry, "guid");
    const publishedAt = parseDate(getTag(entry, "pubDate") || getTag(entry, "published") || getTag(entry, "updated") || getTag(entry, "dc:date") || getTag(entry, "date"));

    return {
      title,
      description,
      link,
      publishedAt,
      sourceId: source.id || "unknown",
      sourceName: source.name || "Unknown source",
      sourceUrl: url
    };
  }).filter(x => x.title && x.link);

  return { items, entryCount: entries.length };
}

function parseGdelt(json, source = {}, url = "") {
  const articles = Array.isArray(json?.articles) ? json.articles : [];

  const items = articles.slice(0, MAX_PER_SOURCE).map(a => ({
    title: stripHtml(a.title || ""),
    description: stripHtml(a.description || ""),
    link: a.url || "",
    publishedAt: parseDate(a.seendate || a.date || ""),
    sourceId: source.id || "gdelt",
    sourceName: a.domain || source.name || "GDELT",
    sourceUrl: url
  })).filter(x => x.title && x.link);

  return { items, entryCount: articles.length };
}

function countTerms(text, terms) {
  const normalized = ` ${(String(text).toLowerCase().match(/[a-z0-9]+/g) || []).join(" ")} `;

  return terms.filter(term => {
    const t = ` ${(String(term).toLowerCase().match(/[a-z0-9]+/g) || []).join(" ")} `;
    return t.trim() && normalized.includes(t);
  }).length;
}

function hasAny(text, terms) {
  return terms.some(term => text.includes(term));
}

function scoreItem(item) {
  const text = `${item.title || ""} ${item.description || ""}`.toLowerCase();
  const sourceId = item.sourceId || "";

  const directIndex = [
    "nifty", "nifty 50", "sensex", "bank nifty", "finnifty",
    "indian stock market", "india stock market", "indian equity market",
    "indian equities", "market breadth"
  ];

  const indiaMacro = [
    "rupee", "inr", "fii", "fpi", "dii", "sebi", "indian economy",
    "india economy", "indian markets", "india markets", "gdp",
    "inflation", "bond yield", "forex reserves", "current account"
  ];

  const globalTerms = [
    "federal reserve", "fed rate", "fomc", "interest rate", "inflation",
    "crude oil", "oil price", "oil supply", "usd", "dollar", "bond yield",
    "treasury yield", "global market", "stock market", "financial markets",
    "equities", "gold", "commodity", "ecb", "central bank", "recession",
    "economic growth", "monetary policy", "tariff", "trade war"
  ];

  const marketTerms = [
    "market", "markets", "stock", "stocks", "equity", "equities",
    "financial", "investor", "investors", "bond", "bonds", "yield",
    "inflation", "interest rate", "currency", "rupee", "oil", "crude",
    "gold", "commodity", "commodities", "liquidity", "capital"
  ];

  const liquidityTerms = [
    "variable rate repo", "vrr", "repo auction",
    "liquidity adjustment facility", "laf", "liquidity injection",
    "liquidity absorption", "liquidity operation",
    "standing deposit facility", "marginal standing facility",
    "cash reserve ratio", "crr", "statutory liquidity ratio", "slr",
    "open market operation", "government securities", "repo rate",
    "reverse repo"
  ];

  const policyTerms = [
    "monetary policy", "policy rate", "repo rate", "inflation target",
    "bank rate", "foreign exchange reserves", "forex reserves",
    "payment system", "banking regulation", "rbi policy",
    "reserve bank policy", "liquidity"
  ];

  const regulatoryTerms = [
    "sanctions list", "uapa", "unscr", "compliance", "know your customer",
    "kyc", "regulatory directions", "regulatory framework",
    "notification", "circular", "amendment", "regulated entities",
    "directions"
  ];

  const corporateTerms = [
    "quarterly results", "financial results", "earnings", "dividend",
    "buyback", "merger", "acquisition", "share split", "stock split",
    "bonus shares", "board meeting", "order win", "contract win",
    "fund raising", "fundraising", "ipo", "listing", "promoter",
    "pledge", "shareholding"
  ];

  const isRbi = sourceId === "rbi-press" || sourceId === "rbi-notifications";
  const isExchange = sourceId === "nse-announcements" || sourceId === "bse-notices";
  const rbiRegulatory = isRbi && hasAny(text, regulatoryTerms);
  const rbiLiquidity = isRbi && hasAny(text, liquidityTerms);
  const rbiPolicy = isRbi && hasAny(text, policyTerms);
  const explicitIndex = hasAny(text, directIndex);
  const indiaMacroHit = hasAny(text, indiaMacro);
  const globalMarket = hasAny(text, globalTerms) && hasAny(text, marketTerms);
  const companyContext = (isExchange || hasAny(text, ["india", "indian", "nse", "bse"])) && hasAny(text, corporateTerms);

  let category = "GENERAL_NOISE";
  let niftyRelevant = false;
  let relevanceScore = 0;

  if (rbiRegulatory) {
    category = "INDIA_REGULATORY";
    relevanceScore = 30;
  } else if (rbiLiquidity || rbiPolicy) {
    category = "INDIA_MACRO";
    niftyRelevant = true;
    relevanceScore = rbiLiquidity ? 75 : 65;
  } else if (explicitIndex) {
    category = "INDIA_INDEX_CONTEXT";
    niftyRelevant = true;
    relevanceScore = 85;
  } else if (indiaMacroHit && hasAny(text, [
    "indian economy", "india economy", "indian markets", "india markets",
    "rupee", "inr", "fii", "fpi", "dii", "sebi", "gdp", "inflation",
    "bond yield", "forex reserves", "current account"
  ])) {
    category = "INDIA_MACRO";
    niftyRelevant = true;
    relevanceScore = 65;
  } else if (companyContext) {
    category = "INDIA_STOCK_SPECIFIC";
    relevanceScore = 55;
  } else if (globalMarket) {
    category = "GLOBAL_MARKET_CONTEXT";
    relevanceScore = 45;
  }

  const positive = countTerms(text, POSITIVE_TERMS);
  const negative = countTerms(text, NEGATIVE_TERMS);
  const sentiment = positive && negative ? "MIXED" : positive ? "POSITIVE" : negative ? "NEGATIVE" : "NEUTRAL";

  return {
    ...item,
    relevanceScore,
    relevanceCategory: category,
    sentiment,
    sentimentScore: positive - negative,
    impact: relevanceScore >= 70 ? "HIGH" : relevanceScore >= 40 ? "MEDIUM" : "LOW",
    impactLabelType: "RULE_BASED_CONTEXT_PRIORITY_NOT_MEASURED_MARKET_IMPACT",
    niftyRelevant
  };
}

function isRecent(item, now = Date.now()) {
  if (!item.publishedAt) return true;
  const t = new Date(item.publishedAt).getTime();
  return Number.isFinite(t) && now - t <= MAX_AGE_MS && now - t >= -5 * 60 * 1000;
}

function normalizeTitle(s = "") {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function dedupe(items) {
  const titles = new Set();
  const links = new Set();

  return items.filter(item => {
    const t = normalizeTitle(item.title);
    const l = String(item.link || "").trim().toLowerCase().replace(/[?#].*$/, "");

    if (!t && !l) return false;
    if ((t && titles.has(t)) || (l && links.has(l))) return false;

    if (t) titles.add(t);
    if (l) links.add(l);

    return true;
  });
}

async function fetchWithTimeout(url, source) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": `Mozilla/5.0 (compatible; BADAL-SEVERIYA-News/${VERSION})`,
        "Accept": source.type === "json"
          ? "application/json,text/plain,*/*"
          : "application/rss+xml,application/atom+xml,application/xml,text/xml,text/plain,*/*",
        "Accept-Language": "en-IN,en;q=0.8"
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const body = await response.text();

    return {
      data: source.type === "json" ? JSON.parse(body) : body,
      url
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Timeout after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSource(source) {
  const errors = [];

  for (const url of source.urls) {
    try {
      const fetched = await fetchWithTimeout(url, source);
      const parsed = source.type === "json"
        ? parseGdelt(fetched.data, source, url)
        : parseRss(fetched.data, source, url);

      if (parsed.items.length) {
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

      errors.push(`${url}: parser returned 0 valid items (entries detected: ${parsed.entryCount})`);
    } catch (e) {
      errors.push(`${url}: ${e.message}`);
    }
  }

  const onlyTransportErrors = errors.length > 0 &&
    errors.every(e => /HTTP \d+|Timeout|Network error/i.test(e));

  return {
    sourceId: source.id,
    sourceName: source.name,
    status: onlyTransportErrors ? "ERROR" : "EMPTY",
    fetchedItems: 0,
    parsedEntries: 0,
    items: [],
    error: errors.join(" | "),
    diagnostic: "No valid items were parsed from the attempted feed URLs."
  };
}

async function collectNews() {
  const results = await Promise.all(SOURCES.map(fetchSource));

  const rawFeedEntries = results.reduce((n, r) => n + r.parsedEntries, 0);
  const fetchedItems = results.reduce((n, r) => n + r.fetchedItems, 0);

  const parsed = results.flatMap(r => r.items).map(scoreItem);
  const recent = parsed.filter(isRecent);

  const unique = dedupe(recent).sort((a, b) =>
    b.relevanceScore - a.relevanceScore ||
    String(b.publishedAt || "").localeCompare(String(a.publishedAt || ""))
  );

  const primary = unique.filter(x => x.relevanceCategory !== "GENERAL_NOISE");
  const news = primary.slice(0, MAX_OUTPUT);

  const categoryCounts = unique.reduce((o, x) => {
    o[x.relevanceCategory] = (o[x.relevanceCategory] || 0) + 1;
    return o;
  }, {});

  const sourceStatus = results.map(({ items, ...rest }) => rest);

  return {
    app: APP,
    version: VERSION,
    generatedAt: new Date().toISOString(),
    sourcesConfigured: SOURCES.length,
    connectedSources: results.filter(x => x.status === "CONNECTED").length,
    emptySources: results.filter(x => x.status === "EMPTY").length,
    failedSources: results.filter(x => x.status === "ERROR").length,
    rawFeedEntries,
    fetchedItems,
    parsedItems: parsed.length,
    invalidItems: Math.max(0, rawFeedEntries - fetchedItems),
    filteredOldOrInvalidItems: parsed.length - recent.length,
    duplicateItems: recent.length - unique.length,
    uniqueItems: unique.length,
    outputItems: news.length,
    niftyRelevantItems: unique.filter(x => x.niftyRelevant).length,
    primaryMarketItems: primary.length,
    generalNoiseItems: categoryCounts.GENERAL_NOISE || 0,
    categoryCounts,
    sourceStatus,
    news,
    methodology: {
      mode: "experimental-news-classification-market-context-v1.3.5",
      disclaimer: "Educational news context only. Not live trading signals, predictions, or investment advice.",
      reliability: "Rule-based keyword classification. GENERAL_NOISE is excluded from the primary news list but counted in diagnostics. Global market context is not automatically NIFTY-relevant. Sentiment and context priority are not verified facts, measured market impact, or market-direction probabilities."
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

function health() {
  return {
    ok: true,
    app: APP,
    version: VERSION,
    configuredSources: SOURCES.length,
    mode: "experimental-rss-atom-news-classification-v1.3.5",
    endpoints: [
      "/api/health",
      "/api/news-intelligence",
      "/api/news-intelligence?refresh=1"
    ],
    note: "Educational news context only; no trading signals, predictions, or advice."
  };
}

async function getCachedNews(cache, forceRefresh = false) {
  const key = new Request(`https://badal-severiya-cache.local/news-intelligence-${VERSION}`);

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

export {
  SOURCES,
  parseRss,
  parseGdelt,
  scoreItem,
  isRecent,
  dedupe,
  collectNews
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
    }

    if (path === "/api/health" || path === "/health") {
      return jsonResponse(health());
    }

    if (path === "/api/news-intelligence" || path === "/news-intelligence") {
      const force = url.searchParams.get("refresh") === "1";

      try {
        return await getCachedNews(caches.default, force);
      } catch (error) {
        return jsonResponse({
          ok: false,
          app: APP,
          version: VERSION,
          error: error?.message || "News collection failed"
        }, 502);
      }
    }

    return jsonResponse({ ok: false, error: "Not found" }, 404);
  }
};