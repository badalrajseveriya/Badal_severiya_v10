
// BADAL SEVERIYA NEWS INTELLIGENCE — Phase 1.2 Tests
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

// 3. Direct Indian market relevance
test("NIFTY and Indian market news is directly relevant", () => {
  const result = isNiftyRelevant({
    title: "NIFTY 50 and Indian stock market update",
    description: "Equity market trading outlook"
  });

  assert.equal(result.relevant, true);
  assert.ok(result.relevanceScore >= 65);
  assert.equal(result.relevanceType, "DIRECT_INDIA_MARKET");
});

// 4. RBI macro news relevance
test("RBI India inflation and interest rate news is relevant", () => {
  const result = isNiftyRelevant({
    title: "RBI India inflation policy update",
    description: "Interest rate and Indian market outlook"
  });

  assert.equal(result.relevant, true);
  assert.ok(result.relevanceScore > 0);
});

// 5. Irrelevant celebrity news
test("Unrelated celebrity news is filtered out", () => {
  const result = isNiftyRelevant({
    title: "Celebrity announces new movie",
    description: "Entertainment event and film premiere"
  });

  assert.equal(result.relevant, false);
  assert.equal(result.relevanceScore, 0);
  assert.equal(result.relevanceType, "NOT_RELEVANT");
});

// 6. Whole-word matching
test("Whole-word matcher avoids accidental substring matches", () => {
  assert.equal(termMatch("US economy outlook", "us"), true);
  assert.equal(termMatch("focus on the future", "us"), false);
  assert.equal(termMatch("corporate earnings", "rate"), false);
  assert.equal(termMatch("oil prices rise", "oil"), true);
  assert.equal(termMatch("Federal Reserve policy", "federal reserve"), true);
});

// 7. Relevance false-positive guard
test("Focus and corporate wording alone is not NIFTY relevant", () => {
  const result = isNiftyRelevant({
    title: "Company focus on corporate operations",
    description: "Corporate strategy and business operations update"
  });

  assert.equal(result.relevant, false);
  assert.equal(result.relevanceScore, 0);
});

// 8. Official source label and compatibility field
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

// 9. Non-official source label
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

// 10. Percentage sum and non-negative validation
test("Experimental percentages total 100 and remain non-negative", () => {
  const samples = [
    {
      title: "Crude oil prices surge",
      description: "Indian markets face oil supply disruption",
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
      description: "Inflation and interest rate concerns affect global markets",
      sourceKind: "publisher"
    },
    {
      title: "Celebrity announces movie",
      description: "Entertainment story unrelated to markets",
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

// 11. Critical financial disruption
test("Oil supply disruption with market impact receives critical priority", () => {
  const result = analyzeNewsItem({
    title: "Crude oil supply disruption hits global markets",
    description: "Oil supply disruption threatens financial markets",
    sourceKind: "publisher",
    published: new Date().toISOString()
  });

  assert.equal(result.priority, "P1_CRITICAL");
  assert.equal(result.impactStrength, "HIGH");
});

// 12. War alone is not critical
test("General war news without financial context is not critical", () => {
  const result = analyzeNewsItem({
    title: "War crisis reported in a remote region",
    description: "Military conflict and political developments",
    sourceKind: "publisher",
    published: new Date().toISOString()
  });

  assert.equal(result.niftyRelevance, 0);
  assert.notEqual(result.priority, "P1_CRITICAL");
  assert.equal(result.directionBias, "NEUTRAL");
});

// 13. Routine RBI policy is not critical
test("Routine RBI policy news is not automatically Critical", () => {
  const result = analyzeNewsItem({
    title: "RBI announces routine monetary policy update",
    description: "India interest rate policy review",
    sourceKind: "official"
  });

  assert.notEqual(result.priority, "P1_CRITICAL");
});

// 14. Global macro requires financial context
test("Federal Reserve rate news with market context is relevant", () => {
  const result = isNiftyRelevant({
    title: "Federal Reserve rate decision",
    description: "Interest rates may affect global financial markets"
  });

  assert.equal(result.relevant, true);
  assert.equal(result.relevanceType, "GLOBAL_MACRO_TRANSMISSION");
});

// 15. Global politics alone is not relevant
test("General global political story without financial transmission is excluded", () => {
  const result = isNiftyRelevant({
    title: "Political leaders meet after regional conflict",
    description: "Diplomatic discussions and political statements"
  });

  assert.equal(result.relevant, false);
  assert.equal(result.relevanceScore, 0);
});

// 16. Broad US term alone is not relevant
test("US mention alone does not qualify as market news", () => {
  const result = isNiftyRelevant({
    title: "US storm damages homes",
    description: "Weather emergency and rescue operations"
  });

  assert.equal(result.relevant, false);
  assert.equal(result.relevanceScore, 0);
});

// 17. India financial context
test("India economy news with explicit financial context is relevant", () => {
  const result = isNiftyRelevant({
    title: "India GDP growth and inflation outlook",
    description: "Economic growth, bond yields and financial markets"
  });

  assert.equal(result.relevant, true);
  assert.equal(result.relevanceType, "DIRECT_INDIA_MARKET");
});

// 18. Generic bank wording is insufficient
test("Generic bank mention without India or market context is excluded", () => {
  const result = isNiftyRelevant({
    title: "Local bank opens new community branch",
    description: "Bank customer service and branch expansion"
  });

  assert.equal(result.relevant, false);
});

// 19. Tariff with market context
test("Global tariff story with trade and financial context is relevant", () => {
  const result = isNiftyRelevant({
    title: "New trade tariffs announced",
    description: "Tariffs may affect exports, inflation and financial markets"
  });

  assert.equal(result.relevant, true);
  assert.equal(result.relevanceType, "GLOBAL_MACRO_TRANSMISSION");
});

// 20. Duplicate headlines
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

// 21. Irrelevant stories excluded from prioritized output
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

// 22. GDELT compact timestamp
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

// 23. GDELT invalid date
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

// 24. GDELT parser article data
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

// 25. Freshness: recent news accepted
test("Fresh news within 48 hours is accepted", () => {
  const now = Date.now();

  assert.equal(
    isFresh({
      published: new Date(now - 24 * 60 * 60 * 1000).toISOString()
    }, now),
    true
  );
});

// 26. Freshness: older than 48 hours rejected
test("News older than 48 hours is rejected", () => {
  const now = Date.now();

  assert.equal(
    isFresh({
      published: new Date(now - 49 * 60 * 60 * 1000).toISOString()
    }, now),
    false
  );
});

// 27. Freshness: missing date retained
test("News with missing date is retained", () => {
  assert.equal(isFresh({ published: null }), true);
});

// 28. Freshness: invalid date retained
test("News with invalid date is retained", () => {
  assert.equal(isFresh({ published: "not-a-date" }), true);
});

// 29. Freshness: future timestamp guard
test("News too far in future is rejected", () => {
  const now = Date.now();

  assert.equal(
    isFresh({
      published: new Date(now + 60 * 60 * 1000).toISOString()
    }, now),
    false
  );
});

// 30. Old headlines excluded from output
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

// 31. Source configuration
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
