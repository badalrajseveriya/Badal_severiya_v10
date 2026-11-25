
import {
  runHistoricalCandleApiUpload
} from "./historical-candle-api-uploader.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertRejects(fn, message) {
  let rejected = false;

  try {
    await fn();
  } catch {
    rejected = true;
  }

  assert(rejected, message);
}

function candle(index) {
  const timestamp = new Date(
    Date.UTC(2026, 0, 1, 0, index * 15)
  ).toISOString();

  const price = 25000 + index;

  return {
    timestamp,
    open: price,
    high: price + 10,
    low: price - 5,
    close: price + 5,
    volume: 1000 + index
  };
}

function makePreparedImport(batchSizes) {
  const batches = batchSizes.map(
    (size, batchIndex) => {
      const candles = Array.from(
        { length: size },
        (_, index) =>
          candle(batchIndex * 100 + index)
      );

      return {
        batchNumber: batchIndex + 1,
        totalBatches: batchSizes.length,
        candleCount: candles.length,
        candles
      };
    }
  );

  return {
    status: "prepared",
    batchCount: batches.length,
    batches
  };
}

function mockResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    }
  };
}

const validOptions = {
  apiBaseUrl: "https://example-worker.example.com",
  token: "test-token-not-real",
  index: "NIFTY",
  timeframe: "15m"
};

// 1. Successful sequential upload
{
  const prepared = makePreparedImport([3, 2]);
  const requests = [];
  const progress = [];

  const result =
    await runHistoricalCandleApiUpload(
      prepared,
      {
        ...validOptions,

        fetchImpl: async (url, options) => {
          requests.push({ url, options });

          return mockResponse(200, {
            status: "OK"
          });
        },

        onProgress: event => {
          progress.push(event);
        }
      }
    );

  assert(
    result.status === "completed",
    "Successful upload status error"
  );

  assert(
    result.uploadedBatchCount === 2,
    "Successful batch count error"
  );

  assert(
    result.uploadedCandleCount === 5,
    "Successful candle count error"
  );

  assert(
    result.index === "NIFTY",
    "Index result error"
  );

  assert(
    result.timeframe === "15m",
    "Timeframe result error"
  );

  assert(
    result.dataType === "HISTORICAL_ONLY",
    "Historical-only marker error"
  );

  assert(
    requests.length === 2,
    "Expected exactly 2 requests"
  );

  assert(
    requests[0].url ===
      "https://example-worker.example.com/api/data/ingest",
    "Upload URL error"
  );

  assert(
    requests[0].options.method === "POST",
    "HTTP method error"
  );

  assert(
    requests[0].options.headers[
      "x-ingest-token"
    ] === "test-token-not-real",
    "Token header error"
  );

  const firstPayload = JSON.parse(
    requests[0].options.body
  );

  assert(
    firstPayload.index === "NIFTY",
    "Payload index error"
  );

  assert(
    firstPayload.timeframe === "15m",
    "Payload timeframe error"
  );

  assert(
    firstPayload.candles.length === 3,
    "First batch candle count error"
  );

  assert(
    progress.length === 2,
    "Progress callback count error"
  );

  assert(
    progress[0].completedBatches === 1 &&
    progress[1].completedBatches === 2,
    "Progress sequence error"
  );

  assert(
    progress[1].uploadedCandles === 5,
    "Progress candle total error"
  );
}

// 2. Stop on server rejection
{
  const prepared = makePreparedImport([2, 2, 1]);
  let requestCount = 0;

  const result =
    await runHistoricalCandleApiUpload(
      prepared,
      {
        ...validOptions,

        fetchImpl: async () => {
          requestCount++;

          if (requestCount === 2) {
            return mockResponse(401, {
              status: "ERROR",
              error: "Unauthorized"
            });
          }

          return mockResponse(200, {
            status: "OK"
          });
        }
      }
    );

  assert(
    result.status === "failed",
    "Server rejection should fail"
  );

  assert(
    result.uploadedBatchCount === 1,
    "Failed upload completed batch count error"
  );

  assert(
    result.uploadedCandleCount === 2,
    "Failed upload candle count error"
  );

  assert(
    result.failedBatchNumber === 2,
    "Failed batch number error"
  );

  assert(
    result.remainingBatchCount === 2,
    "Remaining batch count error"
  );

  assert(
    result.httpStatus === 401,
    "HTTP error status not captured"
  );

  assert(
    requestCount === 2,
    "Uploader should stop after rejection"
  );
}

// 3. Network failure
{
  const prepared = makePreparedImport([1, 1]);
  let requestCount = 0;

  const result =
    await runHistoricalCandleApiUpload(
      prepared,
      {
        ...validOptions,

        fetchImpl: async () => {
          requestCount++;

          if (requestCount === 2) {
            throw new Error(
              "Simulated network failure"
            );
          }

          return mockResponse(200, {
            status: "OK"
          });
        }
      }
    );

  assert(
    result.status === "failed",
    "Network failure status error"
  );

  assert(
    result.uploadedBatchCount === 1,
    "Network failure completed batch count error"
  );

  assert(
    result.failedBatchNumber === 2,
    "Network failed batch number error"
  );

  assert(
    result.error === "Simulated network failure",
    "Network error message error"
  );

  assert(
    requestCount === 2,
    "Network failure should stop later batches"
  );
}

// 4. Invalid URL rejected
{
  const prepared = makePreparedImport([1]);

  await assertRejects(
    () =>
      runHistoricalCandleApiUpload(
        prepared,
        {
          ...validOptions,
          apiBaseUrl: "not-a-valid-url"
        }
      ),
    "Invalid URL should be rejected"
  );
}

// 5. Insecure HTTP rejected
{
  const prepared = makePreparedImport([1]);

  await assertRejects(
    () =>
      runHistoricalCandleApiUpload(
        prepared,
        {
          ...validOptions,
          apiBaseUrl: "http://example.com"
        }
      ),
    "Non-HTTPS URL should be rejected"
  );
}

// 6. Missing token rejected
{
  const prepared = makePreparedImport([1]);

  await assertRejects(
    () =>
      runHistoricalCandleApiUpload(
        prepared,
        {
          ...validOptions,
          token: ""
        }
      ),
    "Missing token should be rejected"
  );
}

// 7. Invalid batch count rejected
{
  const prepared = makePreparedImport([1]);
  prepared.batchCount = 99;

  await assertRejects(
    () =>
      runHistoricalCandleApiUpload(
        prepared,
        validOptions
      ),
    "Batch count mismatch should be rejected"
  );
}

// 8. Invalid batch numbering rejected
{
  const prepared = makePreparedImport([1, 1]);
  prepared.batches[1].batchNumber = 5;

  await assertRejects(
    () =>
      runHistoricalCandleApiUpload(
        prepared,
        validOptions
      ),
    "Incorrect batch numbering should be rejected"
  );
}

// 9. Invalid candle count rejected
{
  const prepared = makePreparedImport([2]);
  prepared.batches[0].candleCount = 99;

  await assertRejects(
    () =>
      runHistoricalCandleApiUpload(
        prepared,
        validOptions
      ),
    "Incorrect candle count should be rejected"
  );
}

// 10. Empty prepared import
{
  const prepared = makePreparedImport([]);

  const result =
    await runHistoricalCandleApiUpload(
      prepared,
      {
        ...validOptions,

        fetchImpl: async () => {
          throw new Error(
            "Empty import must not upload"
          );
        }
      }
    );

  assert(
    result.status === "completed",
    "Empty import should complete"
  );

  assert(
    result.uploadedBatchCount === 0,
    "Empty import batch count error"
  );

  assert(
    result.uploadedCandleCount === 0,
    "Empty import candle count error"
  );
}

console.log(
  "HISTORICAL CANDLE API UPLOADER TESTS PASSED"
);
