// BADAL SEVERIYA NEWS INTELLIGENCE — Phase 1.1 Tests
// Run: node news-intelligence-worker.test.js

import assert from "node:assert/strict";

import {
  analyzeNewsItem,
  isNiftyRelevant,
  parseRss,
  parseGdelt,
  prioritize,
  isFresh,
  termMatch,
  SOURCES
} from "./news-intelligence-worker.js";

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

// 1. RSS parser
test("RSS parser reads title, description, link and date", () => {
  const xml = `<rss><channel><item>
    <title>RBI announces policy update</title>
    <description>India monetary policy announcement</description>
    <link>https://example.com/rbi-news</link>
    <pubDate>Wed, 25 Nov 2026 10:00:00 GMT</pubDate>
  </item></channel></rss>`;

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

// 2. Atom parser
test("RSS parser handles Atom entry format", () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
    <entry>
      <title>India economic growth update</title>
      <summary>GDP and market information</summary>
      <link href="https://example.com/economy" />
      <updated>2026-11-25T09:00:00Z</updated>
    </entry>
  </feed>`;

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

// 3. Relevant India market news
test("RBI India inflation news is relevant", () => {
  const result = isNiftyRelevant({
    title: "RBI India inflation policy update",
    description: "Interest rate and Indian market outlook"
  });

  assert.equal(result.relevant, true);
  assert.ok(result.relevanceScore > 0);
  assert.ok(result.hits.length > 0);
});

// 4. Irrelevant news
test("Unrelated celebrity news is filtered out", () => {
  const result = isNiftyRelevant({
    title: "Celebrity announces new movie",
    description: "Entertainment event and film premiere"
  });

  assert.equal(result.relevant, false);
  assert.equal(result.relevanceScore, 0);
});

// 5. Whole-word matching
test("Whole-word matcher avoids accidental substring matches", () => {
  assert.equal(termMatch("US economy outlook", "us"), true);
  assert.equal(termMatch("focus on the future", "us"), false);
  assert.equal(termMatch("corporate earnings", "rate"), false);
  assert.equal(termMatch("oil prices rise", "oil"), true);
  assert.equal(termMatch("Federal Reserve policy", "federal reserve"), true);
});

// 6. Relevance false positive guard
test("Focus and corporate wording alone is not NIFTY relevant", () => {
  const result = isNiftyRelevant({
    title: "Company focus on corporate operations",
    description: "Corporate strategy and business operations update"
  });

  assert.equal(result.relevant, false);
  assert.equal(result.relevanceScore, 0);
});

// 7. Official source label and compatibility field
test("Official source label and compatibility score are retained", () => {
  const result = analyzeNewsItem({
    title: "RBI announces monetary policy",
    description: "India interest rate policy announcement",
    sourceId: "rbi",
    sourceName: "Reserve Bank of India",
    sourceKind: "official",
    published: new Date().toISOString()
  });

  assert.match(result.verification, /OFFICIAL_SOURCE/);
  assert.equal(result.sourceTypeScore, 65);
  assert.equal(result.verificationConfidence, 65);
  assert.match(result.verification, /fact-check not completed/i);
});

// 8. Non-official source label
test("Non-official source is marked unverified", () => {
  const result = analyzeNewsItem({
    title: "India stock market update",
    description: "Market news from a publisher",
    sourceKind: "publisher"
  });

  assert.match(result.verification, /UNVERIFIED/);
  assert.equal(result.sourceTypeScore, 45);
  assert.equal(result.verificationConfidence, 45);
});

// 9. Percentage sum and non-negative validation
test("Experimental percentages always total 100 and remain non-negative", () => {
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
    },
    {
      title: "Federal Reserve rate hike",
      description: "Inflation and interest rate concerns",
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
      ["BULLISH", "BEARISH", "NEUTRAL"].includes(result.directionBias)
    );
  }
});

// 10. Critical news
test("War crisis news receives critical priority", () => {
  const result = analyzeNewsItem({
    title: "War crisis causes crude oil surge",
    description: "India market and oil prices face disruption",
    sourceKind: "publisher",
    published: new Date().toISOString()
  });

  assert.equal(result.priority, "P1_CRITICAL");
  assert.equal(result.impactStrength, "HIGH");
});

// 11. Routine policy should not be Critical
test("Routine RBI policy news is not automatically Critical", () => {
  const result = analyzeNewsItem({
    title: "RBI announces routine monetary policy update",
    description: "India interest rate policy review",
    sourceKind: "official",
    published: new Date().toISOString()
  });

  assert.notEqual(result.priority, "P1_CRITICAL");
});

// 12. Duplicate headlines
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

// 13. Irrelevant stories excluded from prioritized output
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
      sourceKind: "official",
      published: new Date().toISOString()
    }
  ];

  const result = prioritize(items);

  assert.equal(result.length, 1);
  assert.match(result[0].title, /RBI/i);
});

// 14. GDELT compact timestamp
test("GDELT compact timestamp is converted to ISO", () => {
  const result = parseGdelt({
    articles: [{
      title: "India market timestamp test",
      url: "https://example.com/date-test",
      seendate: "20261125103000",
      source: "Example"
    }]
  }, {
    id: "gdelt-test",
    name: "GDELT Test",
    kind: "aggregator"
  });

  assert.equal(
    result[0].published,
    "2026-11-25T10:30:00.000Z"
  );
});

// 15. GDELT invalid date
test("GDELT invalid date is safely represented as null", () => {
  const result = parseGdelt({
    articles: [{
      title: "India market invalid timestamp test",
      url: "https://example.com/date-invalid",
      seendate: "invalid-date",
      source: "Example"
    }]
  }, {
    id: "gdelt-test",
    name: "GDELT Test",
    kind: "aggregator"
  });

  assert.equal(result[0].published, null);
});

// 16. GDELT parser article data
test("GDELT parser reads article data", () => {
  const source = {
    id: "gdelt",
    name: "GDELT",
    kind: "aggregator"
  };

  const json = {
    articles: [{
      title: "India stock market reacts to crude oil",
      url: "https://example.com/market-news",
      seendate: "20261125103000",
      source: "Example News"
    }]
  };

  const result = parseGdelt(json, source);

  assert.equal(result.length, 1);
  assert.match(result[0].title, /India stock market/i);
  assert.equal(result[0].link, "https://example.com/market-news");
  assert.equal(result[0].sourceKind, "aggregator");
  assert.equal(result[0].published, "2026-11-25T10:30:00.000Z");
});

// 17. Freshness: recent news accepted
test("Fresh news within 48 hours is accepted", () => {
  const now = Date.now();

  assert.equal(
    isFresh({
      published: new Date(now - 24 * 60 * 60 * 1000).toISOString()
    }, now),
    true
  );
});

// 18. Freshness: older than 48 hours rejected
test("News older than 48 hours is rejected", () => {
  const now = Date.now();

  assert.equal(
    isFresh({
      published: new Date(now - 49 * 60 * 60 * 1000).toISOString()
    }, now),
    false
  );
});

// 19. Freshness: missing date retained
test("News with missing date is retained", () => {
  assert.equal(isFresh({ published: null }), true);
});

// 20. Freshness: invalid date retained
test("News with invalid date is retained", () => {
  assert.equal(isFresh({ published: "not-a-date" }), true);
});

// 21. Freshness: future timestamp guard
test("News too far in future is rejected", () => {
  const now = Date.now();

  assert.equal(
    isFresh({
      published: new Date(now + 60 * 60 * 1000).toISOString()
    }, now),
    false
  );
});

// 22. Old headlines excluded from output
test("Old dated news is excluded from prioritized output", () => {
  const now = Date.now();

  const items = [
    {
      title: "RBI India inflation update old",
      description: "Monetary policy and market update",
      sourceKind: "official",
      published: new Date(now - 60 * 60 * 1000).toISOString()
    },
    {
      title: "RBI India inflation update stale",
      description: "Monetary policy and market update",
      sourceKind: "official",
      published: new Date(now - 60 * 60 * 49).toISOString()
    }
  ];

  const result = prioritize(items);

  assert.equal(result.length, 1);
  assert.match(result[0].title, /old$/i);
});

// 23. Source configuration
test("News engine has multiple configured sources", () => {
  assert.ok(SOURCES.length >= 8);
  assert.ok(SOURCES.some(source => source.kind === "official"));
  assert.ok(SOURCES.some(source => source.kind === "publisher"));
  assert.ok(SOURCES.some(source => source.kind === "aggregator"));

  assert.ok(SOURCES.some(source => source.id === "rbi"));
  assert.ok(SOURCES.some(source => source.id === "fed"));
  assert.ok(SOURCES.some(source => source.id === "nse"));
  assert.ok(SOURCES.some(source => source.id === "gdelt"));
});

// Final result
console.log("");
console.log("======================================");
console.log(`NEWS INTELLIGENCE TESTS PASSED: ${passed}`);
console.log("======================================");