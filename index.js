
import { analyzeMarket } from "./market-data.js";

// ==================================================
// BADAL SEVERIYA V11.0
// SMART NEWS + HISTORICAL MARKET DASHBOARD
// Educational prototype only
// ==================================================

const APP_NAME = "BADAL SEVERIYA V11.0";

const NEWS_DAYS = 30;
const OLD_FINANCIAL_PERIOD_DAYS = 180;

const MAX_ITEMS_PER_FEED = 15;
const MAX_TOTAL_NEWS = 75;
const MAX_CANDLES = 5000;

const SEBI_PRESS_RELEASES_URL =
  "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=6&ssid=23";

const FEEDS = [
  {
    id: "rbi",
    name: "RBI / India Economy",
    category: "RBI Official Press Release",
    description: "भारतीय रिजर्व बैंक के आधिकारिक अपडेट",
    url: "https://rbi.org.in/pressreleases_rss.xml"
  },
  {
    id: "sebi",
    name: "SEBI / Market Regulations",
    category: "Regulatory Update",
    description: "SEBI की आधिकारिक प्रेस रिलीज़ और नियामक घोषणाएँ",
    url: "https://www.sebi.gov.in/sebirss.xml"
  },
  {
    id: "nse-corporate",
    name: "NSE / Corporate Announcements",
    category: "Company Filing",
    description: "कंपनियों की आधिकारिक घोषणाएँ",
    url: "https://archives.nseindia.com/content/RSS/Online_announcements.xml"
  },
  {
    id: "nse-results",
    name: "NSE / Financial Results",
    category: "Financial Results",
    description: "कंपनियों के वित्तीय परिणाम",
    url: "https://nsearchives.nseindia.com/content/RSS/Financial_Results.xml"
  },
  {
    id: "fed",
    name: "Federal Reserve / Global Economy",
    category: "Global Monetary Policy",
    description: "अमेरिकी केंद्रीय बैंक के आर्थिक अपडेट",
    url: "https://www.federalreserve.gov/feeds/press_all.xml"
  }
];

// ==================================================
// XML / HTML HELPERS
// ==================================================

function decodeXml(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      try {
        return String.fromCodePoint(parseInt(code, 16));
      } catch {
        return "";
      }
    })
    .replace(/&#([0-9]+);/g, (_, code) => {
      try {
        return String.fromCodePoint(parseInt(code, 10));
      } catch {
        return "";
      }
    })
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getTag(xml, name) {
  const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const pattern = new RegExp(
    `<(?:[\\w.-]+:)?${safeName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${safeName}\\s*>`,
    "i"
  );

  const match = String(xml || "").match(pattern);

  return match ? decodeXml(match[1]) : "";
}

function getAttribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const match = String(tag || "").match(
    new RegExp("\\b" + escaped + "\\s*=\\s*[\"']([^\"']*)[\"']", "i")
  );

  return match ? decodeXml(match[1]) : "";
}

function getAtomLink(xml) {
  const tags = String(xml || "").match(
    /<(?:[\w.-]+:)?link\b[^>]*>/gi
  ) || [];

  for (const tag of tags) {
    const rel = getAttribute(tag, "rel");
    const href = getAttribute(tag, "href");

    if (href && (!rel || rel === "alternate")) {
      return href;
    }
  }

  return getTag(xml, "link");
}

function extractEntries(xml) {
  const source = String(xml || "");

  const rss = [
    ...source.matchAll(
      /<(?:[\w.-]+:)?item\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?item\s*>/gi
    )
  ].map(match => match[1]);

  if (rss.length) return rss;

  const atom = [
    ...source.matchAll(
      /<(?:[\w.-]+:)?entry\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?entry\s*>/gi
    )
  ].map(match => match[1]);

  if (atom.length) return atom;

  const rdf = [
    ...source.matchAll(
      /<(?:[\w.-]+:)?Description\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?Description\s*>/gi
    )
  ].map(match => match[0]);

  return rdf.filter(entry =>
    getTag(entry, "title") &&
    (getTag(entry, "link") || entry.includes("about="))
  );
}

// ==================================================
// SECURITY HELPERS
// ==================================================

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

// ==================================================
// DATE HELPERS
// ==================================================

const MONTHS = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11
};

function validUtcDate(year, month, day) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  if (year < 1900 || year > 2200) return null;

  const timestamp = Date.UTC(year, month, day);

  const date = new Date(timestamp);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp;
}

function parseNewsDate(value) {
  if (!value) return null;

  const input = String(value).trim();

  if (!input) return null;

  const isoDate = input.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})/
  );

  if (isoDate) {
    const timestamp = validUtcDate(
      Number(isoDate[1]),
      Number(isoDate[2]) - 1,
      Number(isoDate[3])
    );

    if (timestamp !== null) {
      const parsed = Date.parse(input);

      return Number.isFinite(parsed)
        ? parsed
        : timestamp;
    }
  }

  const numericDate = input.match(
    /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/
  );

  if (numericDate) {
    const timestamp = validUtcDate(
      Number(numericDate[3]),
      Number(numericDate[2]) - 1,
      Number(numericDate[1])
    );

    if (timestamp !== null) return timestamp;
  }

  const monthNameDate = input.match(
    /^(\d{1,2})[-\s]+([A-Za-z]{3,9})[,]?[-\s]+(\d{4})/
  );

  if (monthNameDate) {
    const month = MONTHS[
      monthNameDate[2].toLowerCase()
    ];

    if (month !== undefined) {
      const timestamp = validUtcDate(
        Number(monthNameDate[3]),
        month,
        Number(monthNameDate[1])
      );

      if (timestamp !== null) {
        const parsed = Date.parse(input);

        return Number.isFinite(parsed)
          ? parsed
          : timestamp;
      }
    }
  }

  const americanDate = input.match(
    /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/
  );

  if (americanDate) {
    const month = MONTHS[
      americanDate[1].toLowerCase()
    ];

    if (month !== undefined) {
      const timestamp = validUtcDate(
        Number(americanDate[3]),
        month,
        Number(americanDate[2])
      );

      if (timestamp !== null) {
        const parsed = Date.parse(input);

        return Number.isFinite(parsed)
          ? parsed
          : timestamp;
      }
    }
  }

  const timestamp = Date.parse(input);

  return Number.isFinite(timestamp)
    ? timestamp
    : null;
}

function isRecent(timestamp) {
  if (!timestamp) return false;

  const now = Date.now();

  const cutoff =
    now - NEWS_DAYS * 24 * 60 * 60 * 1000;

  return timestamp >= cutoff &&
    timestamp <= now + 5 * 60 * 1000;
}

function formatNewsDate(timestamp) {
  if (!timestamp) return "Date unavailable";

  return new Date(timestamp).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata"
  }) + " IST";
}

function formatPeriodDate(timestamp) {
  if (!timestamp) return "Not available";

  return new Date(timestamp).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  });
}

// ==================================================
// FINANCIAL PERIOD HELPERS
// ==================================================

function extractFinancialPeriodDate(text) {
  const input = String(text || "");

  if (!input.trim()) return null;

  const datePattern =
    "(\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[/-]\\d{1,2}[/-]\\d{4}|\\d{1,2}[-\\s]+[A-Za-z]{3,9}[,\\s-]+\\d{4}|[A-Za-z]{3,9}\\s+\\d{1,2},?\\s+\\d{4})";

  const periodPattern = new RegExp(
    "(?:period|quarter|year|half[-\\s]?year|six months|nine months)\\s+ended(?:\\s+on)?\\s*:?\\s*" +
    datePattern,
    "i"
  );

  const match = input.match(periodPattern);

  if (!match || !match[1]) return null;

  return parseNewsDate(match[1]);
}

function getFinancialPeriodInfo(description, title) {
  const timestamp =
    extractFinancialPeriodDate(description) ||
    extractFinancialPeriodDate(title);

  if (!timestamp) {
    return {
      financialPeriodEnd: null,
      financialPeriodTimestamp: null,
      financialPeriodAgeDays: null,
      financialPeriodStatus: "NOT FOUND"
    };
  }

  const now = new Date();

  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );

  const periodUtc = Date.UTC(
    new Date(timestamp).getUTCFullYear(),
    new Date(timestamp).getUTCMonth(),
    new Date(timestamp).getUTCDate()
  );

  const ageDays = Math.floor(
    (todayUtc - periodUtc) / 86400000
  );

  if (ageDays < 0) {
    return {
      financialPeriodEnd: formatPeriodDate(timestamp),
      financialPeriodTimestamp: timestamp,
      financialPeriodAgeDays: ageDays,
      financialPeriodStatus: "VERIFY FUTURE DATE"
    };
  }

  return {
    financialPeriodEnd: formatPeriodDate(timestamp),
    financialPeriodTimestamp: timestamp,
    financialPeriodAgeDays: ageDays,
    financialPeriodStatus:
      ageDays > OLD_FINANCIAL_PERIOD_DAYS
        ? "OLD FINANCIAL PERIOD"
        : "WITHIN 180 DAYS"
  };
}

// ==================================================
// PARSE RSS ENTRY
// ==================================================

function parseEntry(entry, feed) {
  const title = getTag(entry, "title");

  const description =
    getTag(entry, "description") ||
    getTag(entry, "summary") ||
    getTag(entry, "encoded") ||
    getTag(entry, "content");

  const pubDate =
    getTag(entry, "pubDate") ||
    getTag(entry, "published") ||
    getTag(entry, "updated") ||
    getTag(entry, "date") ||
    getTag(entry, "issued") ||
    getTag(entry, "created");

  let link = getAtomLink(entry);

  if (!link) {
    const openingTag = entry.match(/^<[^>]+>/);

    if (openingTag) {
      link =
        getAttribute(openingTag[0], "rdf:about") ||
        getAttribute(openingTag[0], "about");
    }
  }

  const timestamp = parseNewsDate(pubDate);

  const item = {
    id: feed.id,
    source: feed.name,
    category: feed.category,
    title,
    description,
    link: safeUrl(link),
    pubDate,
    timestamp,
    dateAvailable: Boolean(timestamp),
    label: feed.category
  };

  if (feed.id === "nse-results") {
    Object.assign(
      item,
      getFinancialPeriodInfo(description, title)
    );
  }

  return item;
}

// ==================================================
// SEBI OFFICIAL WEBSITE FALLBACK
// ==================================================

function extractSebiPressReleases(html, feed) {
  const rows = [
    ...String(html).matchAll(
      /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
    )
  ];

  const items = [];

  for (const match of rows) {
    const row = match[1];

    const dateMatch = row.match(
      /\b([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})\b/
    );

    if (!dateMatch) continue;

    const pubDate = dateMatch[1];
    const timestamp = parseNewsDate(pubDate);

    if (!timestamp || !isRecent(timestamp)) continue;

    const anchors = [
      ...row.matchAll(
        /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
      )
    ];

    let selected = null;

    for (const anchor of anchors) {
      const attributes = anchor[1];
      const inner = anchor[2];

      const href = getAttribute(
        `<a ${attributes}>`,
        "href"
      );

      const title = decodeXml(inner);

      if (!href || !title) continue;

      if (
        /javascript:|^#|HomeAction\.do\?/i.test(href)
      ) {
        continue;
      }

      selected = { href, title };
      break;
    }

    if (!selected) continue;

    let link = "";

    try {
      link = safeUrl(
        new URL(
          selected.href,
          "https://www.sebi.gov.in"
        ).href
      );
    } catch {
      link = "";
    }

    if (!link) continue;

    items.push({
      id: feed.id,
      source: feed.name,
      category: feed.category,
      title: selected.title,
      description: "SEBI official press release",
      link,
      pubDate,
      timestamp,
      dateAvailable: true,
      label: feed.category,
      feedMode: "OFFICIAL WEBSITE FALLBACK"
    });
  }

  const unique = [
    ...new Map(
      items.map(item => [item.link, item])
    ).values()
  ];

  unique.sort(
    (a, b) => b.timestamp - a.timestamp
  );

  return unique.slice(0, MAX_ITEMS_PER_FEED);
}

async function fetchSebiWebsiteFallback(feed) {
  const response = await fetch(SEBI_PRESS_RELEASES_URL, {
    method: "GET",
    redirect: "follow",
    headers: {
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-IN,en;q=0.9",
      "User-Agent": "Mozilla/5.0 (compatible; BadalSeveriyaNews/11.0)"
    },
    cf: {
      cacheTtl: 0,
      cacheEverything: false
    }
  });

  if (!response.ok) {
    throw new Error(
      "SEBI website HTTP " + response.status
    );
  }

  const contentType =
    response.headers.get("content-type") || "";

  const html = await response.text();

  if (!html || !html.trim()) {
    throw new Error("SEBI website returned empty response");
  }

  if (
    html.trim().toLowerCase().startsWith("<!doctype html") === false &&
    !html.toLowerCase().includes("<html")
  ) {
    throw new Error(
      "SEBI website did not return HTML. Content-Type: " +
      contentType
    );
  }

  const items = extractSebiPressReleases(html, feed);

  if (!items.length) {
    throw new Error(
      "SEBI page opened, but its press release rows could not be extracted"
    );
  }

  return {
    id: feed.id,
    name: feed.name,
    category: feed.category,
    description: feed.description,
    status: "CONNECTED",
    count: items.length,
    datedCount: items.length,
    undatedCount: 0,
    error: null,
    feedMode: "OFFICIAL WEBSITE FALLBACK",
    items
  };
}

// ==================================================
// FETCH ONE FEED
// ==================================================

async function fetchFeed(feed) {
  try {
    const response = await fetch(feed.url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BadalSeveriyaNews/11.0)",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        "Accept-Language": "en-IN,en;q=0.9",
        "Referer": "https://www.sebi.gov.in/"
      },
      cf: {
        cacheTtl: 0,
        cacheEverything: false
      }
    });

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    const contentType =
      response.headers.get("content-type") || "";

    const xml = await response.text();

    if (!xml || !xml.trim()) {
      throw new Error("Empty feed response");
    }

    const beginning = xml.trim().slice(0, 500).toLowerCase();

    if (
      beginning.startsWith("<!doctype html") ||
      beginning.startsWith("<html") ||
      beginning.includes("<title>access denied") ||
      beginning.includes("captcha")
    ) {
      throw new Error(
        "Source returned HTML instead of RSS/XML. Content-Type: " +
        contentType
      );
    }

    const entries = extractEntries(xml);

    if (!entries.length) {
      throw new Error(
        "XML received, but no RSS item, Atom entry or RDF description found."
      );
    }

    const parsedItems = entries
      .map(entry => parseEntry(entry, feed))
      .filter(item => {
        if (!item.title) return false;

        if (!item.timestamp) return true;

        return isRecent(item.timestamp);
      });

    parsedItems.sort(
      (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
    );

    const limited = parsedItems.slice(0, MAX_ITEMS_PER_FEED);

    if (feed.id === "sebi" && !limited.length) {
      return await fetchSebiWebsiteFallback(feed);
    }

    const datedCount = limited.filter(
      item => item.dateAvailable
    ).length;

    const undatedCount = limited.length - datedCount;

    let status = "CONNECTED";

    if (!limited.length) {
      status = "NO RECENT NEWS";
    } else if (!datedCount && undatedCount) {
      status = "DATE CHECK";
    }

    const oldFinancialPeriodCount = limited.filter(
      item =>
        item.financialPeriodStatus === "OLD FINANCIAL PERIOD"
    ).length;

    const periodUnavailableCount = limited.filter(
      item =>
        item.financialPeriodStatus === "NOT FOUND"
    ).length;

    return {
      id: feed.id,
      name: feed.name,
      category: feed.category,
      description: feed.description,
      status,
      count: limited.length,
      datedCount,
      undatedCount,
      oldFinancialPeriodCount,
      periodUnavailableCount,
      error: null,
      feedMode: "RSS",
      items: limited
    };

  } catch (error) {

    if (feed.id === "sebi") {
      try {
        return await fetchSebiWebsiteFallback(feed);
      } catch (fallbackError) {
        return {
          id: feed.id,
          name: feed.name,
          category: feed.category,
          description: feed.description,
          status: "ERROR",
          count: 0,
          datedCount: 0,
          undatedCount: 0,
          error:
            "RSS: " +
            String(error?.message || "RSS failed") +
            " | Website fallback: " +
            String(fallbackError?.message || "Fallback failed"),
          items: []
        };
      }
    }

    return {
      id: feed.id,
      name: feed.name,
      category: feed.category,
      description: feed.description,
      status: "ERROR",
      count: 0,
      datedCount: 0,
      undatedCount: 0,
      error: String(error?.message || "Feed request failed"),
      items: []
    };
  }
}

// ==================================================
// NEWS DEDUPLICATION
// ==================================================

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function normalizeLink(value) {
  try {
    const url = new URL(value);

    url.hash = "";

    return (
      url.origin.toLowerCase() +
      url.pathname.replace(/\/+$/, "").toLowerCase() +
      url.search
    );
  } catch {
    return "";
  }
}

function deduplicateNews(items) {
  const seenLinks = new Set();
  const seenFallbackKeys = new Set();

  return items.filter(item => {
    const titleKey = normalizeTitle(item.title);

    if (!titleKey) return false;

    const linkKey = normalizeLink(item.link);

    if (linkKey) {
      if (seenLinks.has(linkKey)) return false;

      seenLinks.add(linkKey);

      return true;
    }

    const fallbackKey = [
      item.id || item.source || "",
      titleKey,
      item.timestamp || "NO_DATE"
    ].join("|");

    if (seenFallbackKeys.has(fallbackKey)) return false;

    seenFallbackKeys.add(fallbackKey);

    return true;
  });
}

// ==================================================
// FETCH ALL NEWS
// ==================================================

async function getNews() {
  const feeds = await Promise.all(
    FEEDS.map(feed => fetchFeed(feed))
  );

  const allItems = feeds.flatMap(feed => feed.items);

  const uniqueItems = deduplicateNews(allItems);

  uniqueItems.sort(
    (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
  );

  const resultsFeed = feeds.find(
    feed => feed.id === "nse-results"
  );

  const oldFinancialPeriodCount =
    resultsFeed?.oldFinancialPeriodCount || 0;

  const periodUnavailableCount =
    resultsFeed?.periodUnavailableCount || 0;

  return {
    app: APP_NAME,
    version: "11.0",
    updatedAt: new Date().toISOString(),
    feedCount: feeds.length,
    connectedFeeds: feeds.filter(
      feed =>
        feed.status === "CONNECTED" ||
        feed.status === "DATE CHECK"
    ).length,
    errorFeeds: feeds.filter(
      feed => feed.status === "ERROR"
    ).length,
    totalNews: uniqueItems.length,
    newsDays: NEWS_DAYS,
    financialPeriodReviewDays: OLD_FINANCIAL_PERIOD_DAYS,
    oldFinancialPeriodCount,
    periodUnavailableCount,
    feeds,
    items: uniqueItems.slice(0, MAX_TOTAL_NEWS)
  };
}

// ==================================================
// HTML RENDER HELPERS
// ==================================================

function statusClass(status) {
  if (status === "CONNECTED") return "status-ok";
  if (status === "DATE CHECK") return "status-warn";
  if (status === "NO RECENT NEWS") return "status-warn";

  return "status-error";
}

function periodClass(status) {
  if (status === "OLD FINANCIAL PERIOD") {
    return "period-old";
  }

  if (status === "WITHIN 180 DAYS") {
    return "period-ok";
  }

  return "period-warn";
}

function renderFeedStatus(feed) {
  return `
    <article class="feed-card">
      <div class="feed-top">
        <div>
          <h3>${escapeHtml(feed.name)}</h3>
          <p>${escapeHtml(feed.description)}</p>
        </div>

        <span class="status ${statusClass(feed.status)}">
          ${escapeHtml(feed.status)}
        </span>
      </div>

      <div class="feed-numbers">
        <span>News: <b>${feed.count}</b></span>
        <span>Dated: <b>${feed.datedCount}</b></span>
        <span>Undated: <b>${feed.undatedCount}</b></span>
      </div>

      ${
        feed.id === "nse-results"
          ? `
            <div class="period-summary">
              <span>Old periods: <b>${feed.oldFinancialPeriodCount || 0}</b></span>
              <span>Period unavailable: <b>${feed.periodUnavailableCount || 0}</b></span>
            </div>
          `
          : ""
      }

      ${
        feed.feedMode
          ? `<p class="muted">Source mode: ${escapeHtml(feed.feedMode)}</p>`
          : ""
      }

      ${
        feed.error
          ? `<p class="error-text">${escapeHtml(feed.error)}</p>`
          : ""
      }
    </article>
  `;
}

function renderFinancialPeriod(item) {
  if (item.id !== "nse-results") return "";

  const status = item.financialPeriodStatus || "NOT FOUND";
  const className = periodClass(status);

  let periodText = "Financial period end: Not found";

  if (item.financialPeriodEnd) {
    periodText =
      "Financial period end: " +
      escapeHtml(item.financialPeriodEnd);
  }

  let ageText = "";

  if (
    Number.isInteger(item.financialPeriodAgeDays) &&
    item.financialPeriodAgeDays >= 0
  ) {
    ageText =
      " · Age: " +
      item.financialPeriodAgeDays +
      " days";
  }

  return `
    <div class="financial-period ${className}">
      <b>${escapeHtml(status)}</b>
      <span>${periodText}${escapeHtml(ageText)}</span>
    </div>
  `;
}

function renderNewsItem(item) {
  const link = safeUrl(item.link);

  const titleHtml = link
    ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>`
    : `<span>${escapeHtml(item.title)}</span>`;

  const dateText = item.timestamp
    ? formatNewsDate(item.timestamp)
    : "Date unavailable — please verify original source";

  const description = item.description
    ? `<p class="description">${escapeHtml(item.description)}</p>`
    : "";

  return `
    <article class="news-card">
      <div class="news-meta">
        ${escapeHtml(item.source)}
        ·
        Published: ${escapeHtml(dateText)}
      </div>

      <span class="category">
        ${escapeHtml(item.category)}
      </span>

      <h3>${titleHtml}</h3>

      ${description}

      ${renderFinancialPeriod(item)}

      ${
        link
          ? `<a class="read-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Read original source ↗</a>`
          : `<span class="muted">Original link unavailable</span>`
      }
    </article>
  `;
}

function renderFeedSections(feeds) {
  return feeds.map(feed => {
    const news = feed.items.length
      ? feed.items.map(renderNewsItem).join("")
      : `<p class="empty">इस स्रोत से अभी कोई हालिया खबर उपलब्ध नहीं है।</p>`;

    return `
      <section class="source-section" id="source-${escapeHtml(feed.id)}">
        <div class="source-heading">
          <div>
            <h2>${escapeHtml(feed.name)}</h2>
            <p>${escapeHtml(feed.description)}</p>
          </div>

          <span class="status ${statusClass(feed.status)}">
            ${escapeHtml(feed.status)}
          </span>
        </div>

        ${news}
      </section>
    `;
  }).join("");
}

// ==================================================
// MAIN PAGE
// ==================================================

function page(newsData) {
  const feeds = newsData.feeds || [];

  const updatedAt = new Date(
    newsData.updatedAt || Date.now()
  ).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata"
  });

  const feedSections = renderFeedSections(feeds);

  const total = newsData.totalNews || 0;
  const connected = newsData.connectedFeeds || 0;
  const errors = newsData.errorFeeds || 0;

  return `<!doctype html>
<html lang="hi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0b1220">

<title>${escapeHtml(APP_NAME)}</title>

<style>
* { box-sizing: border-box; }

body {
  margin: 0;
  background: #0b1220;
  color: #e8eefc;
  font: 15px system-ui, Arial, sans-serif;
}

header {
  padding: 22px 16px;
  background: linear-gradient(120deg,#111c30,#172b49);
  border-bottom: 1px solid #26344d;
}

.header-inner,.wrap {
  max-width: 1000px;
  margin: auto;
}

h1 { margin: 0; font-size: 24px; }

header p {
  margin: 7px 0 0;
  color: #aab8d0;
}

.wrap { padding: 16px; }

.panel {
  background: #121e32;
  border: 1px solid #263650;
  border-radius: 14px;
  padding: 16px;
  margin: 16px 0;
}

h2 { font-size: 19px; margin: 0 0 12px; }
h3 { font-size: 15px; margin: 0; }

.muted,.feed-top p,.source-heading p {
  color: #9aaac4;
  font-size: 13px;
  line-height: 1.5;
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

.btn {
  display: inline-block;
  background: #2563eb;
  color: white;
  border: 0;
  border-radius: 9px;
  padding: 11px 15px;
  font-weight: 700;
  font-size: 14px;
  margin: 5px 5px 5px 0;
  cursor: pointer;
  text-decoration: none;
}

.btn.secondary { background: #344056; }
.btn:disabled { opacity: .5; }

.stats {
  display: grid;
  grid-template-columns: repeat(3,minmax(0,1fr));
  gap: 10px;
  margin-top: 14px;
}

.stat {
  background: #080f1c;
  border: 1px solid #263650;
  border-radius: 10px;
  padding: 12px;
}

.stat b {
  display: block;
  font-size: 23px;
  margin-top: 4px;
}

.stat span {
  color: #9aaac4;
  font-size: 12px;
}

.feed-grid {
  display: grid;
  grid-template-columns: repeat(2,minmax(0,1fr));
  gap: 10px;
}

.feed-card {
  background: #080f1c;
  border: 1px solid #263650;
  border-radius: 11px;
  padding: 13px;
  min-width: 0;
}

.feed-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}

.feed-top h3 { line-height: 1.4; }
.feed-top p { margin: 5px 0; }

.feed-numbers {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
  color: #9aaac4;
  font-size: 12px;
}

.feed-numbers b { color: #e8eefc; }

.period-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 10px;
  color: #aab8d0;
  font-size: 12px;
}

.period-summary b { color: #f6df9b; }

.status {
  display: inline-block;
  font-size: 10px;
  font-weight: 800;
  padding: 6px 8px;
  border-radius: 20px;
  white-space: nowrap;
}

.status-ok { background: #123b2e; color: #8df0c1; }
.status-warn { background: #493a1c; color: #f6df9b; }
.status-error { background: #4a2028; color: #ffabb4; }

.error-text {
  color: #ffabb4;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.source-section {
  border-top: 1px solid #263650;
  padding-top: 18px;
  margin-top: 20px;
}

.source-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
}

.source-heading p { margin: 5px 0 0; }

.news-card {
  background: #080f1c;
  border: 1px solid #263650;
  border-radius: 11px;
  padding: 14px;
  margin: 10px 0;
  overflow-wrap: anywhere;
}

.news-meta {
  color: #9eafca;
  font-size: 12px;
  line-height: 1.5;
}

.category {
  display: inline-block;
  padding: 4px 9px;
  border-radius: 20px;
  font-size: 11px;
  margin-top: 8px;
  background: #344056;
  color: #d0daeb;
}

.news-card h3 { margin-top: 9px; line-height: 1.5; }
.news-card h3 a { color: #e8eefc; text-decoration: none; }
.news-card h3 a:hover { text-decoration: underline; }

.description {
  color: #aab8d0;
  font-size: 13px;
  line-height: 1.6;
  margin: 8px 0;
}

.financial-period {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  margin-top: 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.period-old {
  background: #452329;
  border: 1px solid #8b3c48;
  color: #ffb6bd;
}

.period-ok {
  background: #123b2e;
  border: 1px solid #28684f;
  color: #a4f0cb;
}

.period-warn {
  background: #493a1c;
  border: 1px solid #79602b;
  color: #f6df9b;
}

.read-link {
  display: inline-block;
  color: #8db7ff;
  font-size: 12px;
  margin-top: 10px;
  text-decoration: none;
}

.empty {
  color: #9aaac4;
  padding: 12px;
  background: #080f1c;
  border-radius: 9px;
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

.result {
  background: #080f1c;
  border: 1px solid #40516d;
  border-radius: 10px;
  padding: 14px;
  margin-top: 14px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font-size: 13px;
}

footer {
  color: #8998b2;
  font-size: 12px;
  padding: 22px 0;
  line-height: 1.6;
}

@media(max-width:650px) {
  .feed-grid { grid-template-columns: 1fr; }
  .stats { grid-template-columns: repeat(3,minmax(0,1fr)); }
  .stat { padding: 9px; }
  .stat b { font-size: 19px; }
  h1 { font-size: 21px; }
}
</style>
</head>

<body>

<header>
  <div class="header-inner">
    <h1>${escapeHtml(APP_NAME)}</h1>
    <p>Smart News & Historical Market Analysis</p>
  </div>
</header>

<main class="wrap">

<section class="panel">
  <h2>News Engine Dashboard</h2>

  <p class="muted">
    Last checked: ${escapeHtml(updatedAt)} IST
  </p>

  <div class="stats">
    <div class="stat">
      <span>Connected Feeds</span>
      <b>${connected}/${feeds.length}</b>
    </div>

    <div class="stat">
      <span>Feed Errors</span>
      <b>${errors}</b>
    </div>

    <div class="stat">
      <span>News Headlines</span>
      <b>${total}</b>
    </div>
  </div>

  <p class="notice">
    समाचार आधिकारिक स्रोतों से लिए जाते हैं।
    समाचार का होना किसी बाजार प्रभाव, दिशा या भविष्य के मूल्य की पुष्टि नहीं करता।
    खबरों को मूल स्रोत से सत्यापित करें।
  </p>

  <a class="btn" href="/?refresh=1">Refresh All News</a>
  <a class="btn secondary" href="/api/news">View News API</a>
</section>

<section class="panel">
  <h2>Financial Period Data Check</h2>

  <p class="muted">
    खबर की प्रकाशित तारीख और कंपनी के वित्तीय परिणाम की अवधि अलग-अलग जाँची जाती है।
  </p>

  <p class="notice">
    OLD FINANCIAL PERIOD का अर्थ है कि वित्तीय अवधि 180 दिन से अधिक पुरानी है।
    यह केवल डेटा की समीक्षा चेतावनी है, निवेश या बाजार संकेत नहीं।
    यदि अवधि नहीं मिली तो उसे अनुमान से नहीं भरा जाएगा।
  </p>
</section>

<section class="panel">
  <h2>All News Feed Status</h2>
  <p class="muted">हर स्रोत की स्थिति अलग से दिखाई गई है।</p>

  <div class="feed-grid">
    ${feeds.map(renderFeedStatus).join("")}
  </div>
</section>

<section class="panel">
  <h2>News By Source</h2>
  <p class="muted">RBI, SEBI, NSE और Global Economy की खबरें अलग-अलग।</p>
  ${feedSections || '<p class="empty">Feed data unavailable.</p>'}
</section>

<section class="panel">
  <h2>Historical Market Analysis</h2>

  <p class="muted">
    Historical OHLCV data से तकनीकी गणना।
  </p>

  <div class="notice">
    Demo candles वास्तविक NIFTY डेटा नहीं हैं।
    यह सुविधा केवल ऐतिहासिक और शैक्षिक विश्लेषण के लिए है।
    यह भविष्यवाणी या ट्रेडिंग सलाह नहीं देती।
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
    JSON file में candles array या direct OHLCV array होना चाहिए।
    Maximum file size: 2 MB.
  </p>

  <input type="file" id="jsonFile" accept=".json,application/json">

  <button class="btn secondary" id="clearButton">
    Clear Data
  </button>

  <p class="muted" id="fileStatus">No file selected.</p>

  <textarea id="candleInput"
    placeholder="Paste historical JSON candle data here."></textarea>

  <div id="result" class="result">
    Analysis result will appear here.
  </div>
</section>

<footer>
  ${escapeHtml(APP_NAME)} — Educational prototype only.
  No live market connection, future prediction,
  or trading recommendation is provided.
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
      "JSON must contain a candles array or direct array."
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

  // DEMO CANDLES

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

  // JSON FILE IMPORT

  jsonFile.addEventListener("change", async function() {
    const file = jsonFile.files[0];

    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showMessage(
        "File too large. Maximum allowed size is 2 MB."
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
      const candles = checkCandles(extractCandles(parsed));

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

  // CLEAR DATA

  clearButton.addEventListener("click", function() {
    input.value = "";
    jsonFile.value = "";

    fileStatus.textContent = "Data cleared.";

    showMessage(
      "Data cleared. Upload JSON or generate demo candles."
    );
  });

  // HISTORICAL ANALYSIS

  analyzeButton.addEventListener("click", async function() {
    analyzeButton.disabled = true;

    showMessage("Checking and analyzing candle data...");

    try {
      const parsed = JSON.parse(input.value);
      const candles = checkCandles(extractCandles(parsed));

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
      result.textContent = "TEST ERROR: " + error.message;

    } finally {
      analyzeButton.disabled = false;
    }
  });

})();
</script>

</body>
</html>`;
}

// ==================================================
// CLOUDFLARE WORKER
// ==================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // HEALTH CHECK

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        app: APP_NAME,
        version: "11.0",
        mode: "educational-prototype",
        marketEngine: "connected",
        jsonImport: "client-side-enabled",
        newsEngine: "official-sources-with-sebi-fallback",
        newsDays: NEWS_DAYS,
        financialPeriodReviewDays: OLD_FINANCIAL_PERIOD_DAYS,
        financialPeriodCheck: "enabled",
        duplicateCheck: "enabled",
        feedsConfigured: FEEDS.length,
        dashboard: "v11.0"
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

      const newsData = await getNews();

      return Response.json(newsData, {
        headers: {
          "Cache-Control": "no-store"
        }
      });
    }

    // HISTORICAL ANALYSIS API

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

        if (body.candles.length > MAX_CANDLES) {
          return Response.json({
            status: "DATA_LIMIT_EXCEEDED",
            error: "Maximum 5000 candles allowed"
          }, { status: 400 });
        }

        const result = analyzeMarket(body.candles);

        return Response.json({
          app: APP_NAME,
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

    // MAIN PAGE

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
