
/*
 * BADAL SEVERIYA V12
 * HISTORICAL MASTER — NEWS CONTEXT BRIDGE TESTS
 *
 * Tests:
 * - Valid payload normalization
 * - Positive / negative / mixed / neutral classification
 * - Freshness filtering
 * - Stale fallback display-only handling
 * - Old/invalid article exclusion
 * - Global context separation
 * - Malformed input handling
 * - Safety configuration
 *
 * Educational context only.
 * No forecasts, trading signals or future probabilities.
 */

import assert from "node:assert/strict";

import {
  analyzeHistoricalMasterNewsContext,
  getHistoricalMasterNewsContextConfig
} from "./historical-master-news-context.js";

function createArticle(overrides = {}) {
  return {
    title: "Test headline",
    link: "https://example.com/test-article",
    description: "Sample news description",
    publishedAt: "2026-11-27T09:00:00.000Z",
    sourceId: "test-source",
    sourceName: "Test Source",
    relevanceCategory: "INDIA_INDEX_CONTEXT",
    sentiment: "POSITIVE",
    sentimentScore: 3,
    relevanceScore: 85,
    freshness: "FRESH",
    niftyRelevant: true,
    impact: "MEDIUM",
    ...overrides
  };
}

function createPayload(news, overrides = {}) {
  return {
    app: "BADAL SEVERIYA NEWS INTELLIGENCE",
    version: "1.4.1",
    generatedAt: "2026-11-27T10:00:00.000Z",
    news,
    sourceStatus: [],
    freshnessPolicy: {
      usedFallbackWindow: false
    },
    ...overrides
  };
}

function test(name, callback) {
  callback();
  console.log("PASS:", name);
}

// ------------------------------------------------------
// 1. Valid payload normalization
// ------------------------------------------------------

test("Valid news payload is normalized successfully", () => {
  const result = analyzeHistoricalMasterNewsContext(
    createPayload([createArticle()])
  );

  assert.equal(result.status, "OK");
  assert.equal(result.module, "HISTORICAL_MASTER_NEWS_CONTEXT");
  assert.equal(result.dataType, "NEWS_CONTEXT_ONLY");
  assert.equal(result.version, "1.0.0");

  assert.equal(result.context.label, "POSITIVE_NEWS_CONTEXT");
  assert.equal(result.context.relevantArticleCount, 1);
  assert.equal(result.context.positiveCount, 1);

  assert.equal(result.articles.relevant.length, 1);
  assert.equal(result.articles.relevant[0].title, "Test headline");
});

// ------------------------------------------------------
// 2. Positive classification
// ------------------------------------------------------

test("Positive NIFTY-relevant news is classified correctly", () => {
  const result = analyzeHistoricalMasterNewsContext(
    createPayload([
      createArticle({
        sentiment: "POSITIVE"
      })
    ])
  );

  assert.equal(result.context.label, "POSITIVE_NEWS_CONTEXT");
  assert.equal(result.context.positiveCount, 1);
  assert.equal(result.context.negativeCount, 0);
});

// ------------------------------------------------------
// 3. Negative classification
// ------------------------------------------------------

test("Negative NIFTY-relevant news is classified correctly", () => {
  const result = analyzeHistoricalMasterNewsContext(
    createPayload([
      createArticle({
        sentiment: "NEGATIVE"
      })
    ])
  );

  assert.equal(result.context.label, "NEGATIVE_NEWS_CONTEXT");
  assert.equal(result.context.negativeCount, 1);
  assert.equal(result.context.positiveCount, 0);
});

// ------------------------------------------------------
// 4. Mixed positive and negative classification
// ------------------------------------------------------

test("Positive and negative articles produce mixed context", () => {
  const result = analyzeHistoricalMasterNewsContext(
    createPayload([
      createArticle({
        sentiment: "POSITIVE",
        link: "https://example.com/positive"
      }),
      createArticle({
        sentiment: "NEGATIVE",
        link: "https://example.com/negative"
      })
    ])
  );

  assert.equal(result.context.label, "MIXED_NEWS_CONTEXT");
  assert.equal(result.context.relevantArticleCount, 2);
  assert.equal(result.context.positiveCount, 1);
  assert.equal(result.context.negativeCount, 1);
});

// ------------------------------------------------------
// 5. Mixed sentiment without positive/negative articles
// ------------------------------------------------------

test("Mixed-only sentiment is classified as mixed context", () => {
  const result = analyzeHistoricalMasterNewsContext(
    createPayload([
      createArticle({
        sentiment: "MIXED"
      })
    ])
  );

  assert.equal(result.context.label, "MIXED_NEWS_CONTEXT");
  assert.equal(result.context.mixedCount, 1);
});

// ------------------------------------------------------
// 6. Neutral classification
// ------------------------------------------------------

test("Neutral NIFTY-relevant news produces neutral context", () => {
  const result = analyzeHistoricalMasterNewsContext(
    createPayload([
      createArticle({
        sentiment: "NEUTRAL"
      })
    ])
  );

  assert.equal(result.context.label, "NEUTRAL_NEWS_CONTEXT");
  assert.equal(result.context.neutralCount, 1);
});

// ------------------------------------------------------
// 7. Stale fallback articles
// ------------------------------------------------------

test("Stale fallback news is display-only and excluded from active counts", () => {
  const result = analyzeHistoricalMasterNewsContext(
    createPayload([
      createArticle({
        sentiment: "NEGATIVE",
        freshness: "STALE_FALLBACK"
      })
    ])
  );

  assert.equal(result.status, "OK");

  assert.equal(result.context.label, "NO_CLEAR_NEWS_CONTEXT");
  assert.equal(result.context.relevantArticleCount, 0);
  assert.equal(result.context.negativeCount, 0);

  assert.equal(result.context.freshness.activeArticleCount, 0);
  assert.equal(result.context.freshness.staleArticleCount, 1);

  assert.equal(result.articles.stale.length, 1);
});

// ------------------------------------------------------
// 8. Old articles are excluded
// ------------------------------------------------------

test("Old articles are excluded from active and stale context", () => {
  const result = analyzeHistoricalMasterNewsContext(
    createPayload([
      createArticle({
        freshness: "STALE_OLD"
      })
    ])
  );

  assert.equal(result.status, "OK");
  assert.equal(result.context.relevantArticleCount, 0);

  assert.equal(result.context.freshness.activeArticleCount, 0);
  assert.equal(result.context.freshness.staleArticleCount, 0);

  assert.equal(
    result.context.freshness.excludedOldOrInvalidCount,
    1
  );

  assert.equal(result.articles.relevant.length, 0);
  assert.equal(result.articles.stale.length, 0);
});

// ------------------------------------------------------
// 9. Missing date freshness
// ------------------------------------------------------

test("MISSING_DATE articles remain active as defined by module policy", () => {
  const result = analyzeHistoricalMasterNewsContext(
    createPayload([
      createArticle({
        freshness: "MISSING_DATE"
      })
    ])
  );

  assert.equal(result.status, "OK");
  assert.equal(result.context.activeArticleCount, undefined);

  assert.equal(
    result.context.freshness.activeArticleCount,
    1
  );

  assert.equal(result.context.positiveCount, 1);
});

// ------------------------------------------------------
// 10. Global news context separation
// ------------------------------------------------------

test("Global context is retained separately from NIFTY-relevant news", () => {
  const globalArticle = createArticle({
    relevanceCategory: "GLOBAL_MARKET_CONTEXT",
    niftyRelevant: false,
    link: "https://example.com/global-context"
  });

  const result = analyzeHistoricalMasterNewsContext(
    createPayload([globalArticle])
  );

  assert.equal(result.status, "OK");

  assert.equal(result.context.relevantArticleCount, 0);

  assert.equal(result.articles.relevant.length, 0);
  assert.equal(result.articles.otherContext.length, 1);

  assert.equal(
    result.articles.otherContext[0].category,
    "GLOBAL_MARKET_CONTEXT"
  );
});

// ------------------------------------------------------
// 11. General noise is not NIFTY-relevant context
// ------------------------------------------------------

test("General noise is excluded from NIFTY-relevant article list", () => {
  const noiseArticle = createArticle({
    relevanceCategory: "GENERAL_NOISE",
    niftyRelevant: true
  });

  const result = analyzeHistoricalMasterNewsContext(
    createPayload([noiseArticle])
  );

  assert.equal(result.status, "OK");
  assert.equal(result.context.relevantArticleCount, 0);
  assert.equal(result.articles.relevant.length, 0);
});

// ------------------------------------------------------
// 12. Invalid payload
// ------------------------------------------------------

test("Null payload returns WAITING_FOR_DATA safely", () => {
  const result = analyzeHistoricalMasterNewsContext(null);

  assert.equal(result.status, "WAITING_FOR_DATA");
  assert.equal(result.dataType, "NEWS_CONTEXT_ONLY");
  assert.ok(result.error);
});

// ------------------------------------------------------
// 13. Missing news array
// ------------------------------------------------------

test("Payload without news array returns WAITING_FOR_DATA", () => {
  const result = analyzeHistoricalMasterNewsContext({
    app: "BADAL SEVERIYA NEWS INTELLIGENCE"
  });

  assert.equal(result.status, "WAITING_FOR_DATA");
  assert.match(result.error, /news array/i);
});

// ------------------------------------------------------
// 14. Invalid article data
// ------------------------------------------------------

test("Invalid articles are safely ignored", () => {
  const result = analyzeHistoricalMasterNewsContext(
    createPayload([
      null,
      {},
      createArticle({
        title: "",
        link: "https://example.com/invalid"
      }),
      createArticle({
        title: "Missing link",
        link: ""
      })
    ])
  );

  assert.equal(result.status, "WAITING_FOR_DATA");
  assert.match(result.error, /valid news articles/i);
});

// ------------------------------------------------------
// 15. Invalid category fallback
// ------------------------------------------------------

test("Unknown category falls back to GENERAL_NOISE", () => {
  const result = analyzeHistoricalMasterNewsContext(
    createPayload([
      createArticle({
        relevanceCategory: "UNKNOWN_CATEGORY"
      })
    ])
  );

  assert.equal(result.status, "OK");

  assert.equal(
    result.articles.relevant[0].category,
    "GENERAL_NOISE"
  );

  assert.equal(result.context.relevantArticleCount, 0);
});

// ------------------------------------------------------
// 16. Invalid sentiment fallback
// ------------------------------------------------------

test("Unknown sentiment falls back to NEUTRAL", () => {
  const result = analyzeHistoricalMasterNewsContext(
    createPayload([
      createArticle({
        sentiment: "INVALID_SENTIMENT"
      })
    ])
  );

  assert.equal(result.status, "OK");
  assert.equal(result.articles.relevant[0].sentiment, "NEUTRAL");
  assert.equal(result.context.neutralCount, 1);
});

// ------------------------------------------------------
// 17. Article limit
// ------------------------------------------------------

test("maxArticles limits processed news articles", () => {
  const articles = Array.from(
    { length: 5 },
    (_, index) =>
      createArticle({
        title: "Headline " + index,
        link: "https://example.com/article-" + index
      })
  );

  const result = analyzeHistoricalMasterNewsContext(
    createPayload(articles),
    {
      maxArticles: 2
    }
  );

  assert.equal(result.status, "OK");
  assert.equal(result.context.relevantArticleCount, 2);
  assert.equal(result.articles.relevant.length, 2);
});

// ------------------------------------------------------
// 18. Source diagnostics
// ------------------------------------------------------

test("Source diagnostics are normalized safely", () => {
  const result = analyzeHistoricalMasterNewsContext(
    createPayload(
      [createArticle()],
      {
        sourceStatus: [
          {
            sourceId: "source-a",
            sourceName: "Source A",
            status: "CONNECTED",
            fetchedItems: 12,
            errors: []
          },
          {
            sourceId: "source-b",
            sourceName: "Source B",
            status: "FAILED",
            fetchedItems: 0,
            errors: ["Fetch failed"]
          }
        ]
      }
    )
  );

  assert.equal(result.status, "OK");
  assert.equal(result.sourceDiagnostics.length, 2);

  assert.equal(
    result.sourceDiagnostics[0].fetchedItems,
    12
  );

  assert.equal(
    result.sourceDiagnostics[1].errorCount,
    1
  );
});

// ------------------------------------------------------
// 19. Fallback freshness policy
// ------------------------------------------------------

test("Fallback freshness policy is preserved", () => {
  const result = analyzeHistoricalMasterNewsContext(
    createPayload(
      [createArticle()],
      {
        freshnessPolicy: {
          usedFallbackWindow: true
        }
      }
    )
  );

  assert.equal(
    result.context.freshness.usedFallbackWindow,
    true
  );
});

// ------------------------------------------------------
// 20. Safety configuration
// ------------------------------------------------------

test("Forecasts and trading signal features remain disabled", () => {
  const config = getHistoricalMasterNewsContextConfig();

  assert.equal(config.forecastsEnabled, false);
  assert.equal(config.tradingSignalsEnabled, false);
  assert.equal(config.futureProbabilitiesEnabled, false);

  assert.equal(config.output, "NEWS_CONTEXT_ONLY");

  assert.deepEqual(
    config.acceptedFreshness,
    [
      "FRESH",
      "MISSING_DATE"
    ]
  );

  assert.equal(
    config.staleHandling,
    "DISPLAY_ONLY_NOT_ACTIVE_CONTEXT"
  );
});

// ------------------------------------------------------
// FINAL
// ------------------------------------------------------

console.log("");
console.log("==============================================");
console.log("ALL 20 NEWS CONTEXT BRIDGE TESTS PASSED");
console.log("==============================================");
