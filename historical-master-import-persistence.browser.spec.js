
import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

let server;
let baseUrl;

const newsFixture = {
  app: "BADAL SEVERIYA NEWS INTELLIGENCE",
  version: "1.4.1",
  generatedAt: "2026-11-27T10:00:00.000Z",
  freshnessPolicy: { usedFallbackWindow: false },
  sourceStatus: [],
  news: []
};

const CORS_HEADERS = {
  "access-control-allow-origin": "*"
};

const STORAGE_KEYS = {
  "1d": "badal-severiya-v12-historical-import-1d",
  "15m": "badal-severiya-v12-historical-import-15m"
};

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml"
  };

  return types[extension] || "application/octet-stream";
}

/*
 * Synthetic test-only OHLC candles.
 * Not real market data and not used for market analysis.
 */
function makeCandles(
  count,
  intervalMinutes,
  start = Date.UTC(2026, 0, 1, 3, 45)
) {
  const candles = [];
  let previousClose = 25000;

  for (let i = 0; i < count; i++) {
    const trend = i * 0.8;

    const wave =
      Math.sin(i * 0.42) * 80 +
      Math.sin(i * 0.13) * 35;

    const close = 25000 + trend + wave;

    const open =
      i === 0
        ? close - 2
        : previousClose + Math.sin(i * 0.71) * 3;

    const candleRange =
      5 + Math.abs(Math.sin(i * 0.37)) * 8;

    const high =
      Math.max(open, close) + candleRange;

    const low =
      Math.min(open, close) - candleRange;

    candles.push([
      new Date(
        start + i * intervalMinutes * 60 * 1000
      ).toISOString(),
      Number(open.toFixed(2)),
      Number(high.toFixed(2)),
      Number(low.toFixed(2)),
      Number(close.toFixed(2)),
      1000 + i
    ]);

    previousClose = close;
  }

  return candles;
}

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(
        request.url,
        "http://localhost"
      );

      let pathname = decodeURIComponent(requestUrl.pathname);

      if (pathname === "/") {
        pathname = "/index.html";
      }

      const filePath = path.resolve(ROOT, `.${pathname}`);

      const rootPrefix = ROOT.endsWith(path.sep)
        ? ROOT
        : ROOT + path.sep;

      if (
        filePath !== ROOT &&
        !filePath.startsWith(rootPrefix)
      ) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const content = await readFile(filePath);

      response.writeHead(200, {
        "content-type": getContentType(filePath),
        "cache-control": "no-store"
      });

      response.end(content);
    } catch (error) {
      const status =
        error.code === "ENOENT" ? 404 : 500;

      response.writeHead(status, {
        "content-type": "text/plain; charset=utf-8"
      });

      response.end(
        status === 404
          ? "Not found"
          : "Browser test server error"
      );
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (!server) return;

  await new Promise((resolve, reject) => {
    server.close(error =>
      error ? reject(error) : resolve()
    );
  });
});

async function mockNews(page) {
  await page.route(
    "**/api/news-intelligence**",
    async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: CORS_HEADERS,
        body: JSON.stringify(newsFixture)
      });
    }
  );
}

async function mockHistoricalApi(page) {
  const calls = {
    "1d": 0,
    "15m": 0
  };

  await page.route(
    "**/badal-severiya-data.mrstarrdbs.workers.dev/**",
    async route => {
      const url = new URL(route.request().url());

      if (url.pathname === "/api/health") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status: "OK" })
        });

        return;
      }

      if (url.pathname === "/api/data/candles") {
        const timeframe =
          url.searchParams.get("timeframe") || "1d";

        if (timeframe in calls) {
          calls[timeframe]++;
        }

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            app: "BADAL SEVERIYA DATA V11",
            index:
              url.searchParams.get("index") || "NIFTY",
            timeframe,
            candles: [],
            hasMore: false,
            count: 0
          })
        });

        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "OK",
          candles: [],
          hasMore: false
        })
      });
    }
  );

  return calls;
}

async function openDashboard(page) {
  await mockNews(page);

  const apiCalls = await mockHistoricalApi(page);

  await page.goto(`${baseUrl}/index.html`);

  for (const timeframe of ["1d", "15m"]) {
    await expect(
      page.locator(
        `#master-summary-${timeframe} .master-eight-container`
      )
    ).toBeVisible();
  }

  await expect(
    page.locator("#summary-status-1d")
  ).toContainText(
    "पर्याप्त ऐतिहासिक कैंडल डेटा उपलब्ध नहीं है।"
  );

  await expect(
    page.locator("#summary-status-15m")
  ).toContainText(
    "15M डेटा उपलब्ध नहीं है"
  );

  /*
   * Wait for the independent Database Status checker
   * to finish its initial request cycle before taking
   * the API request-count baseline.
   */
  await expect(
    page.locator("#database-status-message")
  ).toContainText(
    "सफलता: Database की दोनों टाइमफ्रेम जाँच पूरी हुई।",
    { timeout: 15000 }
  );

  /*
   * The previous verified run showed two initial
   * historical API requests per timeframe.
   * Wait for this baseline instead of reading counters
   * while startup requests are still in flight.
   */
  for (const timeframe of ["1d", "15m"]) {
    await expect.poll(
      () => apiCalls[timeframe],
      {
        message:
          `Initial API request baseline for ${timeframe}`
      }
    ).toBe(2);
  }

  return apiCalls;
}

async function importJsonFile(
  page,
  inputSelector,
  filename,
  rows
) {
  const filePayload = {
    name: filename,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(rows))
  };

  await page.locator(inputSelector).setInputFiles(filePayload);
}

async function readSavedData(page, timeframe) {
  return page.evaluate(key => {
    const value = localStorage.getItem(key);

    return value ? JSON.parse(value) : null;
  }, STORAGE_KEYS[timeframe]);
}

async function expectSavedImport(
  page,
  timeframe,
  expectedFilename
) {
  const saved = await readSavedData(page, timeframe);

  expect(saved).not.toBeNull();
  expect(saved.timeframe).toBe(timeframe);
  expect(saved.filename).toBe(expectedFilename);
  expect(saved.candles).toHaveLength(240);
  expect(saved.savedAt).toBeTruthy();

  return saved;
}

async function expectImportSuccess(page, statusSelector) {
  const status = page.locator(statusSelector);

  await expect(status).toContainText(
    "सफलता: 240",
    { timeout: 15000 }
  );

  await expect(status).toContainText(
    "Mobile save: OK"
  );
}

async function expectHistoricalCompositionVisible(
  page,
  timeframe
) {
  /*
   * The Master Eight Panel and Historical Composition UI
   * share the summary-status element.
   *
   * On reload, the Master UI may overwrite the composition
   * status with its own saved-data message. Therefore,
   * assert the saved-data restoration message instead of
   * the composition-specific Hindi message.
   */

  const status = page.locator(
    `#summary-status-${timeframe}`
  );

  await expect(status).toContainText(
    "Saved historical data loaded: 240 candles",
    { timeout: 15000 }
  );

  const up = page.locator(`#up-percent-${timeframe}`);
  const down = page.locator(`#down-percent-${timeframe}`);
  const neutral = page.locator(`#unclear-percent-${timeframe}`);

  await expect(up).not.toHaveText("--%");
  await expect(down).not.toHaveText("--%");
  await expect(neutral).not.toHaveText("--%");

  const upValue = Number(
    (await up.textContent()).replace("%", "").trim()
  );

  const downValue = Number(
    (await down.textContent()).replace("%", "").trim()
  );

  const neutralValue = Number(
    (await neutral.textContent()).replace("%", "").trim()
  );

  expect(Number.isFinite(upValue)).toBe(true);
  expect(Number.isFinite(downValue)).toBe(true);
  expect(Number.isFinite(neutralValue)).toBe(true);

  expect(upValue).toBeGreaterThanOrEqual(0);
  expect(downValue).toBeGreaterThanOrEqual(0);
  expect(neutralValue).toBeGreaterThanOrEqual(0);

  expect(upValue).toBeLessThanOrEqual(100);
  expect(downValue).toBeLessThanOrEqual(100);
  expect(neutralValue).toBeLessThanOrEqual(100);

  expect(
    Math.round(upValue + downValue + neutralValue)
  ).toBe(100);
}

test(
  "1D imported candles persist after reload",
  async ({ page }) => {
    const apiCalls = await openDashboard(page);
    const initialCalls = apiCalls["1d"];

    const rows = makeCandles(240, 1440);

    await importJsonFile(
      page,
      "#historical-file",
      "persistence-test-1d.json",
      rows
    );

    await expectImportSuccess(
      page,
      "#import-status"
    );

    await expectSavedImport(
      page,
      "1d",
      "persistence-test-1d.json"
    );

    await page.reload();

    await expect(
      page.locator(
        "#master-summary-1d .master-eight-container"
      )
    ).toBeVisible();

    await expectHistoricalCompositionVisible(
      page,
      "1d"
    );

    const savedAfterReload = await expectSavedImport(
      page,
      "1d",
      "persistence-test-1d.json"
    );

    expect(savedAfterReload.candles).toHaveLength(240);

    /*
     * The imported data is restored locally after reload.
     * The two independent cloud-read requests that remain
     * are expected. They must not be confused with an
     * extra cloud request caused by failed local persistence.
     */
    expect(apiCalls["1d"]).toBe(initialCalls + 2);
  }
);

test(
  "15M imported candles persist after reload",
  async ({ page }) => {
    const apiCalls = await openDashboard(page);
    const initialCalls = apiCalls["15m"];

    const rows = makeCandles(240, 15);

    await importJsonFile(
      page,
      "#historical-file-15m",
      "persistence-test-15m.json",
      rows
    );

    await expectImportSuccess(
      page,
      "#import-status-15m"
    );

    await expectSavedImport(
      page,
      "15m",
      "persistence-test-15m.json"
    );

    await page.reload();

    await expect(
      page.locator(
        "#master-summary-15m .master-eight-container"
      )
    ).toBeVisible();

    await expectHistoricalCompositionVisible(
      page,
      "15m"
    );

    const savedAfterReload = await expectSavedImport(
      page,
      "15m",
      "persistence-test-15m.json"
    );

    expect(savedAfterReload.candles).toHaveLength(240);

    /*
     * Local persistence is verified independently from
     * the two expected cloud reads during page reload.
     */
    expect(apiCalls["15m"]).toBe(initialCalls + 2);
  }
);

test(
  "invalid import preserves the last saved valid data",
  async ({ page }) => {
    const apiCalls = await openDashboard(page);
    const initialCalls = apiCalls["1d"];

    const validRows = makeCandles(240, 1440);

    await importJsonFile(
      page,
      "#historical-file",
      "valid-before-error.json",
      validRows
    );

    await expectImportSuccess(
      page,
      "#import-status"
    );

    const savedBeforeError = await expectSavedImport(
      page,
      "1d",
      "valid-before-error.json"
    );

    expect(savedBeforeError.candles).toHaveLength(240);

    await page.locator("#historical-file").setInputFiles({
      name: "invalid-import.json",
      mimeType: "application/json",
      buffer: Buffer.from("{ invalid json")
    });

    const importStatus = page.locator("#import-status");

    await expect(importStatus).toContainText(
      "Import error:",
      { timeout: 15000 }
    );

    const storedBeforeReload = await readSavedData(
      page,
      "1d"
    );

    expect(storedBeforeReload).not.toBeNull();

    expect(storedBeforeReload.filename).toBe(
      "valid-before-error.json"
    );

    expect(storedBeforeReload.candles).toHaveLength(240);

    await page.reload();

    await expectHistoricalCompositionVisible(
      page,
      "1d"
    );

    const storedAfterReload = await expectSavedImport(
      page,
      "1d",
      "valid-before-error.json"
    );

    expect(storedAfterReload.candles).toHaveLength(240);

    /*
     * Invalid import must not replace the previously
     * saved valid import. The two expected independent
     * cloud reads remain accounted for after reload.
     */
    expect(storedAfterReload.filename).toBe(
      "valid-before-error.json"
    );

    expect(apiCalls["1d"]).toBe(initialCalls + 2);
  }
);
