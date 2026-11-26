import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchExistingHistoricalCandles,
  runAngelOneHistoricalImportPipeline
} from "./angelone-historical-import-pipeline.js";

const API_BASE_URL =
  "https://badal-severiya-data.mrstarrdbs.workers.dev";

const TEST_TOKEN = "pipeline-test-token";

function mockResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    }
  };
}

function existingCandle(timestamp, price) {
  return {
    timestamp,
    open: price,
    high: price + 10,
    low: price - 10,
    close: price + 5,
    volume: 1000
  };
}

function angelResponse(rows) {
  return {
    status: true,
    message: "SUCCESS",
    errorcode: "",
    data: rows
  };
}

function angelRow(timestamp, price, volume = 500) {
  return [
    timestamp,
    price,
    price + 10,
    price - 10,
    price + 5,
    volume
  ];
}

test(
  "fetches every D1 page and combines candles",
  async () => {
    const firstPage = [
      existingCandle(
        "2026-11-23T03:30:00.000Z",
        25000
      ),
      existingCandle(
        "2026-11-23T03:45:00.000Z",
        25010
      )
    ];

    const secondPage = [
      existingCandle(
        "2026-11-23T04:00:00.000Z",
        25020
      )
    ];

    const requests = [];

    const fetchImpl = async url => {
      const parsed = new URL(url);
      const offset = Number(
        parsed.searchParams.get("offset")
      );

      requests.push(offset);

      if (offset === 0) {
        return mockResponse(200, {
          index: "NIFTY",
          timeframe: "15m",
          count: firstPage.length,
          hasMore: true,
          candles: firstPage
        });
      }

      if (offset === 2) {
        return mockResponse(200, {
          index: "NIFTY",
          timeframe: "15m",
          count: secondPage.length,
          hasMore: false,
          candles: secondPage
        });
      }

      throw new Error("Unexpected pagination offset.");
    };

    const result =
      await fetchExistingHistoricalCandles({
        apiBaseUrl: API_BASE_URL,
        index: "NIFTY",
        timeframe: "15m",
        fetchImpl,
        pageSize: 2
      });

    assert.equal(result.status, "completed");
    assert.equal(result.pageCount, 2);
    assert.equal(result.candleCount, 3);
    assert.deepEqual(requests, [0, 2]);
  }
);

test(
  "fetches old data, merges duplicates and uploads sequentially",
  async () => {
    const oldCandle = existingCandle(
      "2026-11-23T03:30:00.000Z",
      25000
    );

    const requests = [];
    const uploadPayloads = [];

    const fetchImpl = async (url, options = {}) => {
      const parsed = new URL(url);
      const method = options.method || "GET";

      requests.push({
        method,
        url: parsed.href
      });

      if (
        method === "GET" &&
        parsed.pathname === "/api/data/candles"
      ) {
        return mockResponse(200, {
          index: "NIFTY",
          timeframe: "15m",
          count: 1,
          hasMore: false,
          candles: [oldCandle]
        });
      }

      if (
        method === "POST" &&
        parsed.pathname === "/api/data/ingest"
      ) {
        assert.equal(
          options.headers["x-ingest-token"],
          TEST_TOKEN
        );

        const payload = JSON.parse(options.body);

        uploadPayloads.push(payload);

        return mockResponse(200, {
          status: "OK",
          received: payload.candles.length
        });
      }

      throw new Error(`Unexpected request: ${parsed.href}`);
    };

    const progressEvents = [];

    const result =
      await runAngelOneHistoricalImportPipeline({
        response: angelResponse([
          angelRow(
            "2026-11-23T09:00:00+05:30",
            25100
          ),
          angelRow(
            "2026-11-23T09:15:00+05:30",
            25110
          )
        ]),

        apiBaseUrl: API_BASE_URL,
        token: TEST_TOKEN,
        index: "NIFTY",
        timeframe: "15m",
        batchSize: 1,
        fetchImpl,

        onProgress: event => {
          progressEvents.push(event);
        }
      });

    assert.equal(result.status, "completed");
    assert.equal(result.dataType, "HISTORICAL_ONLY");

    assert.equal(
      result.existingFetch.candleCount,
      1
    );

    assert.equal(
      result.preparation.incomingCandleCount,
      2
    );

    assert.equal(
      result.preparation.duplicateAgainstExisting,
      1
    );

    assert.equal(
      result.preparation.finalUniqueCandleCount,
      2
    );

    assert.equal(
      result.upload.uploadedBatchCount,
      2
    );

    assert.equal(
      result.upload.uploadedCandleCount,
      2
    );

    assert.equal(uploadPayloads.length, 2);

    assert.equal(
      uploadPayloads[0].candles.length,
      1
    );

    assert.equal(
      uploadPayloads[1].candles.length,
      1
    );

    assert.equal(progressEvents.length, 2);

    assert.equal(
      progressEvents[1].completedBatches,
      2
    );

    assert.equal(requests[0].method, "GET");
    assert.equal(requests[1].method, "POST");
    assert.equal(requests[2].method, "POST");
  }
);

test(
  "rejects a malformed D1 page",
  async () => {
    await assert.rejects(
      () =>
        fetchExistingHistoricalCandles({
          apiBaseUrl: API_BASE_URL,
          index: "NIFTY",
          timeframe: "15m",

          fetchImpl: async () =>
            mockResponse(200, {
              index: "NIFTY",
              timeframe: "15m",
              count: 1,
              hasMore: false,
              candles: []
            })
        }),
      /Invalid D1 candle page/
    );
  }
);

test(
  "rejects D1 fetch HTTP errors",
  async () => {
    await assert.rejects(
      () =>
        fetchExistingHistoricalCandles({
          apiBaseUrl: API_BASE_URL,
          index: "NIFTY",
          timeframe: "15m",

          fetchImpl: async () =>
            mockResponse(503, {
              error: "Unavailable"
            })
        }),
      /HTTP 503/
    );
  }
);

test(
  "rejects invalid API URL",
  async () => {
    await assert.rejects(
      () =>
        fetchExistingHistoricalCandles({
          apiBaseUrl: "not-a-url",
          index: "NIFTY",
          timeframe: "15m",
          fetchImpl: async () =>
            mockResponse(200, {})
        }),
      /Invalid API base URL/
    );
  }
);

test(
  "rejects insecure non-local API URL",
  async () => {
    await assert.rejects(
      () =>
        fetchExistingHistoricalCandles({
          apiBaseUrl: "http://example.com",
          index: "NIFTY",
          timeframe: "15m",
          fetchImpl: async () =>
            mockResponse(200, {})
        }),
      /must use HTTPS/
    );
  }
);

test(
  "rejects missing ingest token",
  async () => {
    await assert.rejects(
      () =>
        runAngelOneHistoricalImportPipeline({
          response: angelResponse([
            angelRow(
              "2026-11-23T09:00:00+05:30",
              25000
            )
          ]),
          apiBaseUrl: API_BASE_URL,
          token: "",
          fetchImpl: async () =>
            mockResponse(200, {
              index: "NIFTY",
              timeframe: "15m",
              count: 0,
              hasMore: false,
              candles: []
            })
        }),
      /Ingest token is required/
    );
  }
);

test(
  "stops upload when D1 rejects a batch",
  async () => {
    let postCount = 0;

    const fetchImpl = async (url, options = {}) => {
      const parsed = new URL(url);

      if (
        options.method === "GET" &&
        parsed.pathname === "/api/data/candles"
      ) {
        return mockResponse(200, {
          index: "NIFTY",
          timeframe: "15m",
          count: 0,
          hasMore: false,
          candles: []
        });
      }

      if (
        options.method === "POST" &&
        parsed.pathname === "/api/data/ingest"
      ) {
        postCount++;

        return mockResponse(401, {
          status: "ERROR",
          error: "Unauthorized"
        });
      }

      throw new Error("Unexpected request.");
    };

    const result =
      await runAngelOneHistoricalImportPipeline({
        response: angelResponse([
          angelRow(
            "2026-11-23T09:00:00+05:30",
            25000
          ),
          angelRow(
            "2026-11-23T09:15:00+05:30",
            25010
          )
        ]),

        apiBaseUrl: API_BASE_URL,
        token: TEST_TOKEN,
        index: "NIFTY",
        timeframe: "15m",
        batchSize: 1,
        fetchImpl
      });

    assert.equal(result.status, "failed");
    assert.equal(result.upload.status, "failed");
    assert.equal(postCount, 1);
    assert.equal(result.upload.httpStatus, 401);
  }
);

console.log(
  "ANGEL ONE HISTORICAL IMPORT PIPELINE TESTS PASSED"
);