
/*
 * BADAL SEVERIYA V12
 * HISTORICAL MASTER — NEWS CONTEXT BRIDGE v1.0
 *
 * News API -> safe normalization -> freshness filtering
 * -> NIFTY context classification.
 *
 * Educational context only.
 * No forecasts, trading signals or future probabilities.
 */

const MODULE = "HISTORICAL_MASTER_NEWS_CONTEXT";
const VERSION = "1.0.0";

const ALLOWED_CATEGORIES = new Set([
  "INDIA_INDEX_CONTEXT",
  "INDIA_MACRO",
  "INDIA_REGULATORY",
  "INDIA_STOCK_SPECIFIC",
  "GLOBAL_MARKET_CONTEXT",
  "GENERAL_NOISE"
]);

const ALLOWED_SENTIMENTS = new Set([
  "POSITIVE",
  "NEGATIVE",
  "MIXED",
  "NEUTRAL"
]);

const NOTE =
  "Experimental rule-based news context. Not verified market impact, " +
  "a forecast, or a trading signal.";

function isObject(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function safeText(value, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function safeScore(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function normalizeArticle(item) {
  if (!isObject(item)) return null;

  const title = safeText(item.title, 300);
  const link = safeText(item.link, 1000);

  if (!title || !link) return null;

  const category = ALLOWED_CATEGORIES.has(item.relevanceCategory)
    ? item.relevanceCategory
    : "GENERAL_NOISE";

  const sentiment = ALLOWED_SENTIMENTS.has(item.sentiment)
    ? item.sentiment
    : "NEUTRAL";

  return {
    title,
    description: safeText(item.description, 700),
    link,
    publishedAt: safeText(item.publishedAt, 50) || null,
    sourceId: safeText(item.sourceId, 100),
    sourceName: safeText(item.sourceName, 150),
    category,
    sentiment,
    sentimentScore: Number.isFinite(item.sentimentScore)
      ? Math.max(-20, Math.min(20, item.sentimentScore))
      : 0,
    relevanceScore: safeScore(item.relevanceScore),
    freshness: safeText(item.freshness, 30).toUpperCase(),
    niftyRelevant: item.niftyRelevant === true,
    impact: ["HIGH", "MEDIUM", "LOW"].includes(item.impact)
      ? item.impact
      : "LOW"
  };
}

function createEmptyCounts() {
  return {
    positive: 0,
    negative: 0,
    mixed: 0,
    neutral: 0,
    indiaIndex: 0,
    indiaMacro: 0,
    regulatory: 0,
    stockSpecific: 0,
    global: 0
  };
}

function countArticle(counts, article) {
  if (article.sentiment === "POSITIVE") counts.positive++;
  else if (article.sentiment === "NEGATIVE") counts.negative++;
  else if (article.sentiment === "MIXED") counts.mixed++;
  else counts.neutral++;

  switch (article.category) {
    case "INDIA_INDEX_CONTEXT":
      counts.indiaIndex++;
      break;
    case "INDIA_MACRO":
      counts.indiaMacro++;
      break;
    case "INDIA_REGULATORY":
      counts.regulatory++;
      break;
    case "INDIA_STOCK_SPECIFIC":
      counts.stockSpecific++;
      break;
    case "GLOBAL_MARKET_CONTEXT":
      counts.global++;
      break;
  }
}

function buildContext({
  activeArticles,
  staleArticles,
  allArticles,
  sourceDiagnostics,
  generatedAt,
  usedFallbackWindow
}) {
  const counts = createEmptyCounts();

  for (const article of activeArticles) {
    countArticle(counts, article);
  }

  const relevant = activeArticles.filter(article =>
    article.niftyRelevant &&
    article.category !== "GENERAL_NOISE"
  );

  const positive = relevant.filter(article =>
    article.sentiment === "POSITIVE"
  );

  const negative = relevant.filter(article =>
    article.sentiment === "NEGATIVE"
  );

  const mixed = relevant.filter(article =>
    article.sentiment === "MIXED"
  );

  const neutral = relevant.filter(article =>
    article.sentiment === "NEUTRAL"
  );

  let contextLabel = "NO_CLEAR_NEWS_CONTEXT";

  if (positive.length && negative.length) {
    contextLabel = "MIXED_NEWS_CONTEXT";
  } else if (positive.length) {
    contextLabel = "POSITIVE_NEWS_CONTEXT";
  } else if (negative.length) {
    contextLabel = "NEGATIVE_NEWS_CONTEXT";
  } else if (mixed.length) {
    contextLabel = "MIXED_NEWS_CONTEXT";
  } else if (neutral.length) {
    contextLabel = "NEUTRAL_NEWS_CONTEXT";
  }

  return {
    status: "OK",
    version: VERSION,
    module: MODULE,
    dataType: "NEWS_CONTEXT_ONLY",
    generatedAt,

    context: {
      label: contextLabel,
      relevantArticleCount: relevant.length,
      positiveCount: positive.length,
      negativeCount: negative.length,
      mixedCount: mixed.length,
      neutralCount: neutral.length,

      // Counts are not probabilities.
      sentimentCounts: counts,

      freshness: {
        activeArticleCount: activeArticles.length,
        staleArticleCount: staleArticles.length,
        excludedOldOrInvalidCount:
          allArticles.length -
          activeArticles.length -
          staleArticles.length,
        usedFallbackWindow: usedFallbackWindow === true
      }
    },

    articles: {
      relevant: relevant.slice(0, 20),
      otherContext: activeArticles
        .filter(article => !article.niftyRelevant)
        .slice(0, 15),
      stale: staleArticles.slice(0, 10)
    },

    sourceDiagnostics: Array.isArray(sourceDiagnostics)
      ? sourceDiagnostics.slice(0, 30)
      : [],

    note: NOTE
  };
}

export function analyzeHistoricalMasterNewsContext(
  payload,
  { maxArticles = 100 } = {}
) {
  if (!isObject(payload)) {
    return {
      status: "WAITING_FOR_DATA",
      version: VERSION,
      module: MODULE,
      dataType: "NEWS_CONTEXT_ONLY",
      error: "News API response is missing or invalid.",
      note: NOTE
    };
  }

  if (!Array.isArray(payload.news)) {
    return {
      status: "WAITING_FOR_DATA",
      version: VERSION,
      module: MODULE,
      dataType: "NEWS_CONTEXT_ONLY",
      error: "News API response does not contain a news array.",
      note: NOTE
    };
  }

  const limit = Number.isFinite(maxArticles)
    ? Math.max(1, Math.min(500, Math.floor(maxArticles)))
    : 100;

  const articles = payload.news
    .slice(0, limit)
    .map(normalizeArticle)
    .filter(Boolean);

  if (!articles.length) {
    return {
      status: "WAITING_FOR_DATA",
      version: VERSION,
      module: MODULE,
      dataType: "NEWS_CONTEXT_ONLY",
      generatedAt: safeText(payload.generatedAt, 50) || null,
      error: "No valid news articles available.",
      note: NOTE
    };
  }

  const activeArticles = articles.filter(article =>
    article.freshness === "FRESH" ||
    article.freshness === "MISSING_DATE"
  );

  const staleArticles = articles.filter(article =>
    article.freshness === "STALE_FALLBACK"
  );

  const sourceDiagnostics = Array.isArray(payload.sourceStatus)
    ? payload.sourceStatus.map(source => ({
        sourceId: safeText(source?.sourceId, 100),
        sourceName: safeText(source?.sourceName, 150),
        status: safeText(source?.status, 40),
        fetchedItems: Number.isFinite(source?.fetchedItems)
          ? Math.max(0, source.fetchedItems)
          : 0,
        errorCount: Array.isArray(source?.errors)
          ? source.errors.length
          : 0
      }))
    : [];

  return buildContext({
    activeArticles,
    staleArticles,
    allArticles: articles,
    sourceDiagnostics,
    generatedAt: safeText(payload.generatedAt, 50) || null,
    usedFallbackWindow:
      payload.freshnessPolicy?.usedFallbackWindow === true
  });
}

export function getHistoricalMasterNewsContextConfig() {
  return {
    module: MODULE,
    version: VERSION,
    input: "BADAL_SEVERIYA_NEWS_INTELLIGENCE_API",
    acceptedFreshness: [
      "FRESH",
      "MISSING_DATE"
    ],
    staleHandling: "DISPLAY_ONLY_NOT_ACTIVE_CONTEXT",
    invalidOldFutureHandling: "EXCLUDED",
    output: "NEWS_CONTEXT_ONLY",
    forecastsEnabled: false,
    tradingSignalsEnabled: false,
    futureProbabilitiesEnabled: false,
    note: NOTE
  };
}
