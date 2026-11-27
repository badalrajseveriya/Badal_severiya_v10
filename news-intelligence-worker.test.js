
// BADAL SEVERIYA NEWS INTELLIGENCE — Phase 1.3.9 tests
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
  dedupe,
  classifySourceFailure
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

const source = { id: "test", name: "Test source" };

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
  assert.equal(result.items[0].publishedAt, "2026-11-25T10:00:00.000Z");
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

test("GDELT compact timestamp is UTC", () => {
  const result = parseGdelt({
    articles: [{
      title: "NIFTY update",
      url: "https://example.com/c",
      seendate: "20261125103000"
    }]
  }, source, "feed");

  assert.equal(result.items[0].publishedAt, "2026-11-25T10:30:00.000Z");
});

test("Invalid date is rejected", () => {
  assert.equal(parseDate("not-a-real-date"), null);
});

test("India RSS naive ISO timestamp is interpreted as IST", () => {
  const xml = `<rss><channel><item>
    <title>RBI update</title>
    <link>https://example.com/rbi</link>
    <pubDate>2026-11-27T10:25:00</pubDate>
  </item></channel></rss>`;

  const result = parseRss(
    xml,
    { id: "rbi-press", name: "RBI" },
    "feed"
  );

  assert.equal(result.items[0].publishedAt, "2026-11-27T04:55:00.000Z");
});

test("India RSS RFC timestamp without timezone is interpreted as IST", () => {
  const xml = `<rss><channel><item>
    <title>NSE update</title>
    <link>https://example.com/nse</link>
    <pubDate>Fri, 27 Nov 2026 13:43:58</pubDate>
  </item></channel></rss>`;

  const result = parseRss(
    xml,
    { id: "nse-announcements", name: "NSE" },
    "feed"
  );

  assert.equal(result.items[0].publishedAt, "2026-11-27T08:13:58.000Z");
});

test("Explicit timezone on India RSS is preserved", () => {
  const xml = `<rss><channel><item>
    <title>RBI update</title>
    <link>https://example.com/rbi-explicit</link>
    <pubDate>Fri, 27 Nov 2026 10:25:00 +0530</pubDate>
  </item></channel></rss>`;

  const result = parseRss(
    xml,
    { id: "rbi-press", name: "RBI" },
    "feed"
  );

  assert.equal(result.items[0].publishedAt, "2026-11-27T04:55:00.000Z");
});

test("Non-India RSS without timezone is not forced to IST", () => {
  const xml = `<rss><channel><item>
    <title>BBC update</title>
    <link>https://example.com/bbc</link>
    <pubDate>2026-11-27T10:25:00Z</pubDate>
  </item></channel></rss>`;

  const result = parseRss(
    xml,
    { id: "bbc-business", name: "BBC" },
    "feed"
  );

  assert.equal(result.items[0].publishedAt, "2026-11-27T10:25:00.000Z");
});

test("Direct NIFTY headline is index context", () => {
  const result = scoreItem({
    title: "NIFTY 50 rises after strong market breadth",
    description: "Indian benchmark index advances",
    sourceId: "livemint-markets"
  });

  assert.equal(result.relevanceCategory, "INDIA_INDEX_CONTEXT");
  assert.equal(result.niftyRelevant, true);
});

test("Nifty Bank movement is index context", () => {
  const result = scoreItem({
    title: "Nifty Bank rises 1.2% as banking shares advance",
    description: "Banking benchmark gains during the session",
    sourceId: "livemint-markets"
  });

  assert.equal(result.relevanceCategory, "INDIA_INDEX_CONTEXT");
  assert.equal(result.niftyRelevant, true);
});

test("Company stock movement is stock-specific despite NIFTY mention", () => {
  const result = scoreItem({
    title: "Park Medi World shares rise as Nifty falls",
    description: "Healthcare stock gains during the Indian market session",
    sourceId: "livemint-markets"
  });

  assert.equal(result.relevanceCategory, "INDIA_STOCK_SPECIFIC");
  assert.equal(result.niftyRelevant, false);
});

test("Nifty mention in a single-stock headline is not index context", () => {
  const result = scoreItem({
    title: "ABC Ltd shares rise while Nifty 50 falls",
    description: "Company-specific quarterly results drive the move",
    sourceId: "livemint-markets"
  });

  assert.equal(result.relevanceCategory, "INDIA_STOCK_SPECIFIC");
  assert.equal(result.niftyRelevant, false);
});

test("Nifty Bank constituent compliance notice is not index movement", () => {
  const result = scoreItem({
    title: "Nifty Bank constituent receives compliance notice",
    description: "The company disclosed a regulatory filing",
    sourceId: "livemint-markets"
  });

  assert.notEqual(result.relevanceCategory, "INDIA_INDEX_CONTEXT");
  assert.equal(result.niftyRelevant, false);
});

test("APL Apollo company news is not India macro", () => {
  const result = scoreItem({
    title: "APL Apollo Tubes shares jump after Tata Steel deal",
    description: "The company's share price rises in morning trade",
    sourceId: "livemint-markets"
  });

  assert.equal(result.relevanceCategory, "INDIA_STOCK_SPECIFIC");
  assert.equal(result.niftyRelevant, false);
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

test("Global gold and Fed story is not NIFTY relevant", () => {
  const result = scoreItem({
    title: "Gold rates after US Fed FOMC meeting",
    description: "Investors watch interest rates and dollar impact on gold markets",
    sourceId: "livemint-markets"
  });

  assert.equal(result.relevanceCategory, "GLOBAL_MARKET_CONTEXT");
  assert.equal(result.niftyRelevant, false);
});

test("Global inflation without India context is not India macro", () => {
  const result = scoreItem({
    title: "US inflation rises as bond yields climb",
    description: "Federal Reserve officials assess the latest economic data",
    sourceId: "bbc-business"
  });

  assert.notEqual(result.relevanceCategory, "INDIA_MACRO");
  assert.equal(result.niftyRelevant, false);
});

test("Global climate finance story is not India macro", () => {
  const result = scoreItem({
    title: "Global climate finance deal expands funding",
    description: "International lenders announce a new programme",
    sourceId: "dw-business"
  });

  assert.notEqual(result.relevanceCategory, "INDIA_MACRO");
  assert.equal(result.niftyRelevant, false);
});

test("Indian company dividend announcement is stock-specific", () => {
  const result = scoreItem({
    title: "Indian company announces dividend and buyback",
    description: "Quarterly results and board meeting",
    sourceId: "livemint-markets"
  });

  assert.equal(result.relevanceCategory, "INDIA_STOCK_SPECIFIC");
  assert.equal(result.niftyRelevant, false);
});

test("Generic NSE announcement is not stock-specific only due to source", () => {
  const result = scoreItem({
    title: "Exchange announces revised operational schedule",
    description: "A general notice for market participants",
    sourceId: "nse-announcements"
  });

  assert.equal(result.relevanceCategory, "GENERAL_NOISE");
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

test("Sentiment does not create NIFTY relevance", () => {
  const result = scoreItem({
    title: "Company shares surge",
    description: "Indian company order win",
    sourceId: "livemint-markets"
  });

  assert.equal(result.sentiment, "POSITIVE");
  assert.equal(result.niftyRelevant, false);
});

// Phase 1.3.9 regression tests

test("Park Medi healthcare stock headline is not index context", () => {
  const result = scoreItem({
    title: "Park Medi World shares show resilience against the Indian stock market crash; should you buy? Target, stop-loss",
    description: "Healthcare stock shows resilience",
    sourceId: "livemint-markets"
  });

  assert.equal(result.relevanceCategory, "INDIA_STOCK_SPECIFIC");
  assert.equal(result.niftyRelevant, false);
});

test("Nifty Bank index movement is not classified as single-stock news", () => {
  const result = scoreItem({
    title: "Banking stocks hit the accelerator! Nifty Bank index up 18% in 1 month; HDFC Bank, SBI, ICICI Bank - 9 best stocks to buy",
    description: "Nifty Bank index advances strongly",
    sourceId: "livemint-markets"
  });

  assert.equal(result.relevanceCategory, "INDIA_INDEX_CONTEXT");
  assert.equal(result.niftyRelevant, true);
});

test("Generic stock recommendations are not India macro", () => {
  const result = scoreItem({
    title: "Stock recommendations for 27 November from MarketSmith India",
    description: "Today's stock recommendations and market picks",
    sourceId: "livemint-markets"
  });

  assert.notEqual(result.relevanceCategory, "INDIA_MACRO");
  assert.equal(result.niftyRelevant, false);
});

test("Global climate loss and damage fund is not India stock-specific", () => {
  const result = scoreItem({
    title: "Climate loss and damage fund exists, but the money doesn't",
    description: "International climate finance and funding",
    sourceId: "dw-business"
  });

  assert.notEqual(result.relevanceCategory, "INDIA_STOCK_SPECIFIC");
  assert.equal(result.niftyRelevant, false);
});

test("Japan bank funding cost and unwind headline is not positive sentiment", () => {
  const result = scoreItem({
    title: "Japan Bank Shares Risk Further Unwind as Funding Cost Bites",
    description: "Funding costs create pressure for banking shares",
    sourceId: "bbc-business"
  });

  assert.notEqual(result.sentiment, "POSITIVE");
  assert.ok(
    result.sentiment === "NEGATIVE" || result.sentiment === "MIXED"
  );
});

test("NIFTY 50 falling headline remains index context", () => {
  const result = scoreItem({
    title: "Nifty 50 falls as selling pressure increases",
    description: "Indian benchmark index declines",
    sourceId: "livemint-markets"
  });

  assert.equal(result.relevanceCategory, "INDIA_INDEX_CONTEXT");
  assert.equal(result.niftyRelevant, true);
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

test("Older than 7 days is stale old", () => {
  const now = Date.parse("2026-11-27T12:00:00.000Z");

  assert.equal(classifyFreshness({
    publishedAt: "2026-11-19T10:00:00.000Z"
  }, now), "STALE_OLD");
});

test("Future-dated item is rejected", () => {
  const now = Date.parse("2026-11-27T12:00:00.000Z");
  const item = { publishedAt: "2026-11-27T13:00:00.000Z" };

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

test("HTTP 429 is distinguished from other source failures", () => {
  assert.equal(
    classifySourceFailure(["https://feed.test: HTTP 429"]),
    "RATE_LIMITED"
  );

  assert.equal(
    classifySourceFailure(["https://feed.test: HTTP 503"]),
    "ERROR"
  );

  assert.equal(
    classifySourceFailure(["https://feed.test: Timeout after 12000ms"]),
    "ERROR"
  );

  assert.equal(
    classifySourceFailure(["https://feed.test: parser returned 0 valid items"]),
    "EMPTY"
  );
});

test("Ten source definitions remain configured", () => {
  assert.equal(SOURCES.length, 10);
  assert.ok(SOURCES.some(item => item.id === "rbi-press"));
  assert.ok(SOURCES.some(item => item.id === "nse-announcements"));
  assert.ok(SOURCES.some(item => item.id === "gdelt"));
});

console.log(`\nNEWS INTELLIGENCE TESTS PASSED: ${passed}`);
