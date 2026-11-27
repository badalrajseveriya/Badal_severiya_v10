
import assert from "node:assert/strict";

import {
  handleNewsContextRequest
} from "./historical-master-news-context-worker.js";

const upstreamPayload = {
  app: "BADAL SEVERIYA NEWS INTELLIGENCE",
  version: "1.4.1",
  generatedAt: "2026-11-27T10:00:00.000Z",
  news: [
    {
      title: "NIFTY market context",
      link: "https://example.com/article",
      description: "Test item",
      publishedAt: "2026-11-27T09:30:00.000Z",
      sourceId: "test",
      sourceName: "Test Source",
      relevanceCategory: "INDIA_INDEX_CONTEXT",
      sentiment: "POSITIVE",
      sentimentScore: 3,
      relevanceScore: 90,
      freshness: "FRESH",
      niftyRelevant: true,
      impact: "MEDIUM"
    }
  ],
  sourceStatus: [],
  freshnessPolicy: { usedFallbackWindow: false }
};

const fakeFetch = async (url, init) => {
  assert.equal(init.method, "GET");
  assert.ok(String(url).includes("/api/news-intelligence"));

  return new Response(JSON.stringify(upstreamPayload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

const response = await handleNewsContextRequest(
  new Request("https://bridge.test/api/news-context"),
  fakeFetch
);

assert.equal(response.status, 200);
assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");

const body = await response.json();

assert.equal(body.ok, true);
assert.equal(body.upstreamVersion, "1.4.1");
assert.equal(body.context.context.label, "POSITIVE_NEWS_CONTEXT");
assert.equal(body.context.context.positiveCount, 1);

console.log("PASS: bridge returns context and CORS headers");

const options = await handleNewsContextRequest(
  new Request("https://bridge.test/api/news-context", {
    method: "OPTIONS"
  }),
  fakeFetch
);

assert.equal(options.status, 204);
assert.equal(options.headers.get("Access-Control-Allow-Origin"), "*");

console.log("PASS: OPTIONS CORS preflight");

const wrongMethod = await handleNewsContextRequest(
  new Request("https://bridge.test/api/news-context", {
    method: "POST"
  }),
  fakeFetch
);

assert.equal(wrongMethod.status, 405);
console.log("PASS: unsupported method rejected");

const upstreamFail = await handleNewsContextRequest(
  new Request("https://bridge.test/api/news-context"),
  async () => new Response("upstream unavailable", { status: 503 })
);

assert.equal(upstreamFail.status, 502);
console.log("PASS: upstream HTTP errors handled");

const invalidJson = await handleNewsContextRequest(
  new Request("https://bridge.test/api/news-context"),
  async () => new Response("not json", { status: 200 })
);

assert.equal(invalidJson.status, 502);
console.log("PASS: invalid upstream JSON handled");

console.log("ALL MASTER NEWS CONTEXT WORKER TESTS PASSED");
