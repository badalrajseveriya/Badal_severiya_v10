// BADAL SEVERIYA NEWS INTELLIGENCE — Phase 1.3.5 tests
// Run: node news-intelligence-worker.test.js

import assert from "node:assert/strict";

import {
  SOURCES,
  parseRss,
  parseGdelt,
  scoreItem,
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
  const xml = `<rss><channel><item><title>India market update</title><description><![CDATA[NIFTY market gains]]></description><link>https://example.com/a</link><pubDate>Wed, 25 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>`;

  const r = parseRss(xml, source, "https://example.com/feed");

  assert.equal(r.entryCount, 1);
  assert.equal(r.items.length, 1);
  assert.match(r.items[0].description, /NIFTY/);
  assert.ok(r.items[0].publishedAt);
});

test("Atom entry and href link parse", () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>India economy update</title><summary>GDP and finance</summary><link href="https://example.com/b"/><updated>2026-11-25T09:00:00Z</updated></entry></feed>`;

  const r = parseRss(xml, source, "feed");

  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].link, "https://example.com/b");
});

test("GDELT compact timestamp parses", () => {
  const r = parseGdelt({
    articles: [
      {
        title: "NIFTY update",
        url: "https://example.com/c",
        seendate: "20261125103000"
      }
    ]
  }, source, "feed");

  assert.equal(
    r.items[0].publishedAt,
    "2026-11-25T10:30:00.000Z"
  );
});

test("Direct NIFTY article is index context", () => {
  const r = scoreItem({
    title: "NIFTY 50 rises",
    description: "Indian stock market gains",
    sourceId: "livemint-markets"
  });

  assert.equal(r.relevanceCategory, "INDIA_INDEX_CONTEXT");
  assert.equal(r.niftyRelevant, true);
});

test("RBI VRR liquidity auction is India macro and relevant context", () => {
  const r = scoreItem({
    title: "RBI to conduct 3-day Variable Rate Repo (VRR) auction",
    description: "Liquidity adjustment facility auction",
    sourceId: "rbi-press"
  });

  assert.equal(r.relevanceCategory, "INDIA_MACRO");
  assert.equal(r.niftyRelevant, true);
});

test("RBI sanctions circular is regulatory, not NIFTY direction", () => {
  const r = scoreItem({
    title: "Implementation of UAPA sanctions list update",
    description: "RBI notification to regulated entities for compliance",
    sourceId: "rbi-notifications"
  });

  assert.equal(r.relevanceCategory, "INDIA_REGULATORY");
  assert.equal(r.niftyRelevant, false);
});

test("Global gold and Fed market article is global context, not automatically NIFTY", () => {
  const r = scoreItem({
    title: "Gold rates after US Fed FOMC meeting",
    description: "Investors watch interest rates and dollar impact on gold markets",
    sourceId: "livemint-markets"
  });

  assert.equal(r.relevanceCategory, "GLOBAL_MARKET_CONTEXT");
  assert.equal(r.niftyRelevant, false);
});

test("Single Indian company event is stock-specific, not index relevant", () => {
  const r = scoreItem({
    title: "Indian company announces dividend and buyback",
    description: "Quarterly results and board meeting",
    sourceId: "livemint-markets"
  });

  assert.equal(r.relevanceCategory, "INDIA_STOCK_SPECIFIC");
  assert.equal(r.niftyRelevant, false);
});

test("Unrelated sport and entertainment is noise", () => {
  const r = scoreItem({
    title: "Football star misses World Cup",
    description: "Sports news and tournament",
    sourceId: "dw-business"
  });

  assert.equal(r.relevanceCategory, "GENERAL_NOISE");
  assert.equal(r.niftyRelevant, false);
});

test("Sentiment does not overwrite relevance", () => {
  const r = scoreItem({
    title: "Company shares surge",
    description: "Indian company order win",
    sourceId: "livemint-markets"
  });

  assert.equal(r.sentiment, "POSITIVE");
  assert.equal(r.niftyRelevant, false);
});

test("Freshness accepts recent and rejects stale items", () => {
  const now = Date.now();

  assert.equal(
    isRecent({
      publishedAt: new Date(now - 24 * 3600000).toISOString()
    }, now),
    true
  );

  assert.equal(
    isRecent({
      publishedAt: new Date(now - 49 * 3600000).toISOString()
    }, now),
    false
  );
});

test("Missing publication date is retained for review", () => {
  assert.equal(
    isRecent({ publishedAt: null }),
    true
  );
});

test("Duplicate headlines are removed", () => {
  const r = dedupe([
    {
      title: "RBI policy update",
      link: "https://a.test/1"
    },
    {
      title: "RBI policy update",
      link: "https://b.test/2"
    }
  ]);

  assert.equal(r.length, 1);
});

test("Ten source definitions remain configured", () => {
  assert.equal(SOURCES.length, 10);

  assert.ok(SOURCES.some(x => x.id === "rbi-press"));
  assert.ok(SOURCES.some(x => x.id === "nse-announcements"));
  assert.ok(SOURCES.some(x => x.id === "gdelt"));
});

console.log(`\nNEWS INTELLIGENCE TESTS PASSED: ${passed}`);