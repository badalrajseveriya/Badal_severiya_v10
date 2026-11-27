
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
  freshnessPolicy: {
    usedFallbackWindow: false
  }
};

// ------------------------------------------------------
// 1. SUCCESS RESPONSE
// ------------------------------------------------------

const fakeFetch = async (url, init) => {
  assert.equal(init.method, "GET");
  assert.ok(String(url).includes("/api/news-intelligence"));

  return new Response(JSON.stringify(upstreamPayload), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
};

const response = await handleNewsContextRequest(
  new Request("https://bridge.test/api/news-context"),
  fakeFetch
);

assert.equal(response.status, 200);
assert.equal(
  response.headers.get("Access-Control-Allow-Origin"),
  "*"
);

const body = await response.json();

assert.equal(body.ok, true);
assert.equal(body.upstreamVersion, "1.4.1");
assert.equal(body.context.context.label, "POSITIVE_NEWS_CONTEXT");
assert.equal(body.context.context.positiveCount, 1);

console.log("PASS: bridge returns context and CORS headers");

// ------------------------------------------------------
// 2. OPTIONS PREFLIGHT
// ------------------------------------------------------

const options = await handleNewsContextRequest(
  new Request("https://bridge.test/api/news-context", {
    method: "OPTIONS"
  }),
  fakeFetch
);

assert.equal(options.status, 204);
assert.equal(
  options.headers.get("Access-Control-Allow-Origin"),
  "*"
);

console.log("PASS: OPTIONS CORS preflight");

// ------------------------------------------------------
// 3. METHOD VALIDATION
// ------------------------------------------------------

const wrongMethod = await handleNewsContextRequest(
  new Request("https://bridge.test/api/news-context", {
    method: "POST"
  }),
  fakeFetch
);

assert.equal(wrongMethod.status, 405);

console.log("PASS: unsupported method rejected");

// ------------------------------------------------------
// 4. PATH VALIDATION
// ------------------------------------------------------

const wrongPath = await handleNewsContextRequest(
  new Request("https://bridge.test/unknown"),
  fakeFetch
);

assert.equal(wrongPath.status, 404);

console.log("PASS: unsupported path rejected");

// ------------------------------------------------------
// 5. UPSTREAM HTTP ERROR
// ------------------------------------------------------

const upstreamFail = await handleNewsContextRequest(
  new Request("https://bridge.test/api/news-context"),
  async () => new Response("upstream unavailable", {
    status: 503
  })
);

assert.equal(upstreamFail.status, 502);

const upstreamFailBody = await upstreamFail.json();

assert.equal(upstreamFailBody.status, "UPSTREAM_ERROR");
assert.equal(upstreamFailBody.upstreamStatus, 503);

console.log("PASS: upstream HTTP errors handled");

// ------------------------------------------------------
// 6. INVALID UPSTREAM JSON
// ------------------------------------------------------

const invalidJson = await handleNewsContextRequest(
  new Request("https://bridge.test/api/news-context"),
  async () => new Response("not json", {
    status: 200
  })
);

assert.equal(invalidJson.status, 502);

const invalidJsonBody = await invalidJson.json();

assert.equal(invalidJsonBody.status, "UPSTREAM_INVALID_JSON");

console.log("PASS: invalid upstream JSON handled");

// ------------------------------------------------------
// 7. NETWORK FAILURE
// ------------------------------------------------------

const networkFail = await handleNewsContextRequest(
  new Request("https://bridge.test/api/news-context"),
  async () => {
    throw new Error("Simulated network failure");
  }
);

assert.equal(networkFail.status, 502);

const networkFailBody = await networkFail.json();

assert.equal(networkFailBody.status, "FETCH_ERROR");
assert.equal(networkFailBody.module, "BADAL_SEVERIYA_MASTER_NEWS_CONTEXT_PROXY");

console.log("PASS: network failure handled");

// ------------------------------------------------------
// 8. UPSTREAM TIMEOUT
// ------------------------------------------------------

let timeoutSignal = null;

const timeoutResponse = await handleNewsContextRequest(
  new Request("https://bridge.test/api/news-context"),
  async (_url, init) => {
    timeoutSignal = init.signal;

    // Simulate an upstream that never responds.
    return new Promise(() => {});
  }
);

assert.equal(timeoutResponse.status, 504);

const timeoutBody = await timeoutResponse.json();

assert.equal(timeoutBody.ok, false);
assert.equal(timeoutBody.status, "UPSTREAM_TIMEOUT");
assert.equal(timeoutBody.timeoutMs, 8000);
assert.equal(timeoutSignal.aborted, true);

console.log("PASS: upstream timeout returns 504 and aborts request");

// ------------------------------------------------------
// FINAL
// ------------------------------------------------------

console.log("");
console.log("==============================================");
console.log("ALL 8 MASTER NEWS CONTEXT WORKER TESTS PASSED");
console.log("==============================================");
