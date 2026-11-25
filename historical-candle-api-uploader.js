
/**
 * BADAL SEVERIYA V12
 * Historical Candle API Uploader
 *
 * Sends prepared historical batches sequentially
 * to the existing D1 data-worker API.
 *
 * Historical data only.
 * No live trading or order execution.
 */

const MAX_BATCH_SIZE = 5000;

function validateOptions({
  apiBaseUrl,
  token,
  index,
  timeframe
}) {
  if (
    typeof apiBaseUrl !== "string" ||
    !apiBaseUrl.trim()
  ) {
    throw new Error("API base URL is required.");
  }

  if (
    typeof token !== "string" ||
    !token.trim()
  ) {
    throw new Error("Ingest token is required.");
  }

  if (
    typeof index !== "string" ||
    !index.trim()
  ) {
    throw new Error("Index is required.");
  }

  if (
    typeof timeframe !== "string" ||
    !timeframe.trim()
  ) {
    throw new Error("Timeframe is required.");
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(apiBaseUrl);
  } catch {
    throw new Error("Invalid API base URL.");
  }

  if (
    parsedUrl.protocol !== "https:" &&
    parsedUrl.hostname !== "localhost"
  ) {
    throw new Error("API must use HTTPS.");
  }

  return {
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ""),
    token,
    index: index.trim().toUpperCase(),
    timeframe: timeframe.trim()
  };
}

function validatePreparedImport(preparedImport) {
  if (
    !preparedImport ||
    !Array.isArray(preparedImport.batches)
  ) {
    throw new Error(
      "Prepared historical import is required."
    );
  }

  if (
    !Number.isInteger(preparedImport.batchCount) ||
    preparedImport.batchCount !==
      preparedImport.batches.length
  ) {
    throw new Error(
      "Prepared batch count does not match."
    );
  }

  for (
    let i = 0;
    i < preparedImport.batches.length;
    i++
  ) {
    const batch = preparedImport.batches[i];

    if (
      !batch ||
      !Array.isArray(batch.candles) ||
      batch.candles.length < 1 ||
      batch.candles.length > MAX_BATCH_SIZE
    ) {
      throw new Error(
        "Invalid batch size or batch data."
      );
    }

    if (
      !Number.isInteger(batch.batchNumber) ||
      batch.batchNumber !== i + 1
    ) {
      throw new Error(
        "Invalid batch numbering."
      );
    }

    if (
      !Number.isInteger(batch.candleCount) ||
      batch.candleCount !== batch.candles.length
    ) {
      throw new Error(
        "Batch candle count does not match."
      );
    }
  }
}

/**
 * Upload prepared historical batches sequentially.
 *
 * options:
 * {
 *   apiBaseUrl,
 *   token,
 *   index,
 *   timeframe,
 *   fetchImpl,
 *   onProgress
 * }
 *
 * Token is supplied at runtime.
 * It is not saved or persisted by this module.
 */
export async function runHistoricalCandleApiUpload(
  preparedImport,
  options = {}
) {
  validatePreparedImport(preparedImport);

  const validated = validateOptions(options);

  const fetchImpl =
    options.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch implementation unavailable.");
  }

  const onProgress =
    typeof options.onProgress === "function"
      ? options.onProgress
      : () => {};

  let uploadedBatchCount = 0;
  let uploadedCandleCount = 0;

  for (const batch of preparedImport.batches) {
    const payload = {
      index: validated.index,
      timeframe: validated.timeframe,
      candles: batch.candles
    };

    let response;
    let responseBody;

    try {
      response = await fetchImpl(
        `${validated.apiBaseUrl}/api/data/ingest`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-ingest-token": validated.token
          },
          body: JSON.stringify(payload)
        }
      );

      try {
        responseBody = await response.json();
      } catch {
        responseBody = null;
      }
    } catch (error) {
      return {
        status: "failed",
        uploadedBatchCount,
        uploadedCandleCount,
        failedBatchNumber: batch.batchNumber,
        remainingBatchCount:
          preparedImport.batchCount -
          uploadedBatchCount,
        error:
          error?.message ??
          "Network request failed."
      };
    }

    if (
      !response.ok ||
      !responseBody ||
      responseBody.status !== "OK"
    ) {
      return {
        status: "failed",
        uploadedBatchCount,
        uploadedCandleCount,
        failedBatchNumber: batch.batchNumber,
        remainingBatchCount:
          preparedImport.batchCount -
          uploadedBatchCount,
        httpStatus: response.status,
        error:
          responseBody?.error ??
          "Server rejected batch."
      };
    }

    uploadedBatchCount++;
    uploadedCandleCount += batch.candleCount;

    onProgress({
      status: "uploading",
      completedBatches: uploadedBatchCount,
      totalBatches: preparedImport.batchCount,
      uploadedCandles: uploadedCandleCount,
      currentBatch: batch.batchNumber
    });
  }

  return {
    status: "completed",
    uploadedBatchCount,
    uploadedCandleCount,
    failedBatchNumber: null,
    remainingBatchCount: 0,
    index: validated.index,
    timeframe: validated.timeframe,
    dataType: "HISTORICAL_ONLY"
  };
}
