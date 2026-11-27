// BADAL SEVERIYA NEWS INTELLIGENCE — Phase 1 Tests
// Run: node news-intelligence-worker.test.js

import assert from "node:assert/strict";

import {
  analyzeNewsItem,
  isNiftyRelevant,
  parseRss,
  parseGdelt,
  prioritize,
  SOURCES
} from "./news-intelligence-worker.js";

function test(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

// --------------------------------------------------
// 1. RSS PARSING
// --------------------------------------------------

test("RSS parser reads title, description and date", () => {
  const xml = `
    <rss>
      <channel>
        <item>
          <title>RBI announces policy update</title>
          <description>India monetary policy announcement</description>
          <link>https://example.com/rbi-news</link>
          <pubDate>Wed, 25 Nov 2026 10:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>
  `;

  const source = {
    id: "test-rss",
    name: "Test RSS",
    kind: "publisher"
  };

  const result = parseRss(xml, source);

  assert.equal(result.length, 1);
  assert.match(result[0].title, /RBI announces policy update/i);
  assert.match(result[0].description, /monetary policy/i);
  assert.equal(result[0].link, "https://example.com/rbi-news");
  assert.equal(result[0].sourceId, "test-rss");
  assert.ok(result[0].published);
});

// --------------------------------------------------
// 2. ATOM PARSING
// --------------------------------------------------

test("RSS parser handles Atom entry format", () => {
  const xml = `
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>India economic growth update</title>
        <summary>GDP and market information</summary>
        <link href="https://example.com/economy" />
        <updated>2026-11-25T09:00:00Z</updated>
      </entry>
    </feed>
  `;

  const source = {
    id: "test-atom",
    name: "Test Atom",
    kind: "publisher"
  };

  const result = parseRss(xml, source);

  assert.equal(result.length, 1);
  assert.equal(result[0].title, "India economic growth update");
  assert.equal(result[0].link, "https://example.com/economy");
  assert.ok(result[0].published);
});

// --------------------------------------------------
// 3. NIFTY RELEVANCE FILTER
// --------------------------------------------------

test("RBI India inflation news is relevant", () => {
  const news = {
    title: "RBI India inflation policy update",
    description: "Interest rate and Indian market outlook"
  };

  const result = isNiftyRelevant(news);

  assert.equal(result.relevant, true);
  assert.ok(result.relevanceScore > 0);
  assert.ok(result.hits.length > 0);
});

test("Unrelated celebrity news is filtered out", () => {
  const news = {
    title: "Celebrity announces new movie",
    description: "Entertainment event and film premiere"
  };

  const result = isNiftyRelevant(news);

  assert.equal(result.relevant, false);
  assert.equal(result.relevanceScore, 0);
});

// --------------------------------------------------
// 4. OFFICIAL SOURCE LABELING
// --------------------------------------------------

test("Official source receives official-source label", () => {
  const news = {
    title: "RBI announces monetary policy",
    description: "India interest rate policy announcement",
    sourceId: "rbi",
    sourceName: "Reserve Bank of India",
    sourceKind: "official",
    published: new Date().toISOString()
  };

  const result = analyzeNewsItem(news);

  assert.match(result.verification, /OFFICIAL_SOURCE/);
  assert.equal(result.verificationConfidence, 65);
});

// --------------------------------------------------
// 5. PROBABILITY SCORE VALIDATION
// --------------------------------------------------

test("Experimental percentages always total 100", () => {
  const samples = [
    {
      title: "Oil prices surge after war escalation",
      description: "Crude oil rises and markets face uncertainty",
      sourceKind: "publisher"
    },
    {
      title: "Inflation falls and RBI may cut interest rates",
      description: "India growth improves after inflation cools",
      sourceKind: "aggregator"
    },
    {
      title: "Indian stock market trades sideways",
      description: "NIFTY remains range bound",
      sourceKind: "publisher"
    }
  ];

  for (const sample of samples) {
    const result = analyzeNewsItem(sample);
    const scores = result.impactProbabilities;

    assert.equal(
      scores.bullish + scores.bearish + scores.neutral,
      100
    );

    assert.ok(scores.bullish >= 0);
    assert.ok(scores.bearish >= 0);
    assert.ok(scores.neutral >= 0);

    assert.ok(
      ["BULLISH", "BEARISH", "NEUTRAL"].includes(
        result.directionBias
      )
    );
  }
});

// --------------------------------------------------
// 6. NEWS PRIORITY
// --------------------------------------------------

test("High impact relevant news receives critical priority", () => {
  const news = {
    title: "War crisis causes crude oil surge",
    description: "India market and oil prices face disruption",
    sourceKind: "publisher",
    published: new Date().toISOString()
  };

  const result = analyzeNewsItem(news);

  assert.equal(result.priority, "P1_CRITICAL");
  assert.equal(result.impactStrength, "HIGH");
});

// --------------------------------------------------
// 7. DUPLICATE REMOVAL
// --------------------------------------------------

test("Duplicate headlines are removed", () => {
  const items = [
    {
      title: "RBI India inflation policy update",
      description: "Indian market monetary policy",
      sourceKind: "publisher",
      published: new Date().toISOString()
    },
    {
      title: "RBI India inflation policy update",
      description: "Duplicate story",
      sourceKind: "aggregator",
      published: new Date().toISOString()
    }
  ];

  const result = prioritize(items);

  assert.equal(result.length, 1);
});

// --------------------------------------------------
// 8. IRRELEVANT NEWS FILTER
// --------------------------------------------------

test("Irrelevant stories do not appear in prioritized output", () => {
  const items = [
    {
      title: "Celebrity movie premiere announced",
      description: "Entertainment and film news",
      sourceKind: "publisher"
    },
    {
      title: "RBI announces India inflation update",
      description: "Monetary policy and market update",
      sourceKind: "official"
    }
  ];

  const result = prioritize(items);

  assert.equal(result.length, 1);
  assert.match(result[0].title, /RBI/i);
});

// --------------------------------------------------
// 9. GDELT DATE CONVERSION
// --------------------------------------------------

test("GDELT compact timestamp is converted to ISO", () => {
  const result = parseGdeltDate("20261125103000");

  assert.equal(
    result,
    "2026-11-25T10:30:00.000Z"
  );
});

test("GDELT invalid date returns null", () => {
  const result = parseGdeltDate("invalid-date");

  assert.equal(result, null);
});

// --------------------------------------------------
// 10. GDELT ARTICLE PARSING
// --------------------------------------------------

test("GDELT parser reads article data", () => {
  const source = {
    id: "gdelt",
    name: "GDELT",
    kind: "aggregator"
  };

  const json = {
    articles: [
      {
        title: "India stock market reacts to crude oil",
        url: "https://example.com/market-news",
        seendate: "20261125103000",
        source: "Example News"
      }
    ]
  };

  const result = parseGdelt(json, source);

  assert.equal(result.length, 1);
  assert.match(result[0].title, /India stock market/i);
  assert.equal(
    result[0].link,
    "https://example.com/market-news"
  );
  assert.equal(result[0].sourceKind, "aggregator");
  assert.equal(
    result[0].published,
    "2026-11-25T10:30:00.000Z"
  );
});

// --------------------------------------------------
// 11. SOURCE CONFIGURATION
// --------------------------------------------------

test("News engine has multiple configured sources", () => {
  assert.ok(SOURCES.length >= 8);

  assert.ok(
    SOURCES.some(source => source.kind === "official")
  );

  assert.ok(
    SOURCES.some(source => source.kind === "publisher")
  );

  assert.ok(
    SOURCES.some(source => source.kind === "aggregator")
  );
});

// --------------------------------------------------
// FINAL
// --------------------------------------------------

console.log("");
console.log("======================================");
console.log("NEWS INTELLIGENCE PHASE 1 TESTS PASSED");
console.log("======================================");