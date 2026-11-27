
// BADAL SEVERIYA NEWS INTELLIGENCE — Phase 1.3.6 tests
// Run: node news-intelligence-worker.test.js

import assert from "node:assert/strict";

import {
  SOURCES,
  parseDate,
  parseRss,
  parseGdelt,
  scoreItem,
  classifyFreshness,
  isRecent,
  dedupe
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

const source = {
  id: "test",
  name: "Test source"
};

test("RSS item fields and date parse", () => {
  const xml = `<rss><channel><item>
    <title>India market update</title>
    <description><![CDATA[NIFTY market gains]]></description>
    <link>https://example.com/a</link>
    <pubDate>Wed, 25 Nov 2026 10:00:00 GMT</pubDate>
  </item></channel></rss>`;

  const result = parseRss(xml, source, "https://example.com/feed");

  assert.equal(result.entryCount, 1);
  assert.equal(result.items.length, 1);
  assert.match(result.items[0].description, /NIFTY/);
  assert.ok(result.items[0].publishedAt);
});

test("Atom entry and href link parse", () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
    <entry>
      <title>India economy update</title>
      <summary>GDP and finance</summary>
      <link href="https://example.com/b"/>
      <updated>2026-11-25T09:00:00Z</updated>
    </entry>
  </feed>`;

  const result = parseRss(xml, source, "feed");

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].link, "https://example.com/b");
});

test("GDELT compact timestamp parses", () => {
  const result = parseGdelt({
    articles: [{
      title: "NIFTY update",
      url: "https://example.com/c",
      seendate: "20261125103000"
    }]
  }, source, "feed");

  assert.equal(
    result.items[0].publishedAt,
    "2026-11-25T10:30:00.000Z"
  );
});

test("Invalid date is not silently accepted", () => {
  assert.equal(parseDate("not-a-real-date"), null);
});

test("Direct NIFTY article is index context", () => {
  const result = scoreItem({
    title: "NIFTY 50 rises",
    description: "Indian stock market gains",
    sourceId: "livemint-markets"
  });

  assert.equal(result.relevanceCategory, "INDIA_INDEX_CONTEXT");
  assert.equal(result.niftyRelevant, true);
});

test("RBI VRR liquidity auction is India macro", () => {
  const result = scoreItem({
    title: "RBI to conduct 3-day Variable Rate Repo auction",
    description: "Liquidity adjustment facility auction",
    sourceId: "rbi-press"
  });

  assert.equal(result.relevanceCategory, "INDIA_MACRO");
  assert.equal(result.niftyRelevant, true);
});

test("RBI sanctions circular is regulatory", () => {
  const result = scoreItem({
    title: "Implementation of UAPA sanctions list update",
    description: "RBI notification to regulated entities for compliance",
    sourceId: "rbi-notifications"
  });

  assert.equal(result.relevanceCategory, "INDIA_REGULATORY");
  assert.equal(result.niftyRelevant, false);
});

test("Global gold and Fed article is global context", () => {
  const result = scoreItem({
    title: "Gold rates after US Fed FOMC meeting",
    description: "Investors watch interest rates and dollar impact on gold markets",
    sourceId: "livemint-markets"
  });

  assert.equal(result.relevanceCategory, "GLOBAL_MARKET_CONTEXT");
  assert.equal(result.niftyRelevant, false);
});

test("Single Indian company event is stock-specific", () => {
  const result = scoreItem({
    title: "Indian company announces dividend and buyback",
    description: "Quarterly results and board meeting",
    sourceId: "livemint-markets"
  });

  assert.equal(result.relevanceCategory, "INDIA_STOCK_SPECIFIC");
  assert.equal(result.niftyRelevant, false);
});

test("Unrelated sports story is general noise", () => {
  const result = scoreItem({
    title: "Football star misses World Cup",
    description: "Sports news and tournament",
    sourceId: "dw-business"
  });

  assert.equal(result.relevanceCategory, "GENERAL_NOISE");
  assert.equal(result.niftyRelevant, false);
});

test("Sentiment does not overwrite relevance", () => {
  const result = scoreItem({
    title: "Company shares surge",
    description: "Indian company order win",
    sourceId: "livemint-markets"
  });

  assert.equal(result.sentiment, "POSITIVE");
  assert.equal(result.niftyRelevant, false);
});

test("Fresh item is classified correctly", () => {
  const now = Date.parse("2026-11-27T12:00:00.000Z");

  assert.equal(classifyFreshness({
    publishedAt: "2026-11-27T10:00:00.000Z"
  }, now), "FRESH");
});

test("48-hour to 7-day item gets fallback label", () => {
  const now = Date.parse("2026-11-27T12:00:00.000Z");

  assert.equal(classifyFreshness({
    publishedAt: "2026-11-25T10:00:00.000Z"
  }, now), "STALE_FALLBACK");
});

test("Older than 7 days is classified stale old", () => {
  const now = Date.parse("2026-11-27T12:00:00.000Z");

  assert.equal(classifyFreshness({
    publishedAt: "2026-11-19T10:00:00.000Z"
  }, now), "STALE_OLD");
});

test("Future-dated item is rejected", () => {
  const now = Date.parse("2026-11-27T12:00:00.000Z");
  const item = {
    publishedAt: "2026-11-27T13:00:00.000Z"
  };

  assert.equal(classifyFreshness(item, now), "FUTURE_DATE");
  assert.equal(isRecent(item, now), false);
});

test("Missing publication date is separately classified", () => {
  assert.equal(
    classifyFreshness({ publishedAt: null }, Date.now()),
    "MISSING_DATE"
  );
  assert.equal(isRecent({ publishedAt: null }), true);
});

test("Invalid publication date is separately classified", () => {
  assert.equal(
    classifyFreshness({
      publishedAt: null,
      dateFieldPresent: true
    }),
    "INVALID_DATE"
  );
});

test("Duplicate headlines are removed", () => {
  const result = dedupe([
    { title: "RBI policy update", link: "https://a.test/1" },
    { title: "RBI policy update", link: "https://b.test/2" }
  ]);

  assert.equal(result.length, 1);
});

test("Ten source definitions remain configured", () => {
  assert.equal(SOURCES.length, 10);
  assert.ok(SOURCES.some(item => item.id === "rbi-press"));
  assert.ok(SOURCES.some(item => item.id === "nse-announcements"));
  assert.ok(SOURCES.some(item => item.id === "gdelt"));
});

console.log(`\nNEWS INTELLIGENCE TESTS PASSED: ${passed}`);
