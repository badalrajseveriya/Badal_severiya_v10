
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
 * Synthetic test-only historical OHLC data.
 * The wave pattern deliberately produces confirmed swing highs/lows.
 * This is not real market data.
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

  // Wait until both initial Cloudflare requests have completed
  // and the empty-data fallback status has been rendered.
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
  expect(saved.version).toBe(1);
  expect(saved.timeframe).toBe(timeframe);
  expect(saved.filename).toBe(expectedFilename);
  expect(saved.candles).toHaveLength(240);
  expect(saved.savedAt).toBeTruthy();

  return saved;
}

async function expectHistoricalCompositionVisible(
  page,
  timeframe
) {
  const status = page.locator(
    `#summary-status-${timeframe}`
  );

  await expect(status).toContainText(
    "पिछली 240 कैंडल्स",
    { timeout: 15000 }
  );

  await expect(status).toContainText(
    "यह भविष्य का अनुमान नहीं है।"
  );

  await expect(
    page.locator(`#up-percent-${timeframe}`)
  ).not.toHaveText("--%");

  await expect(
    page.locator(`#down-percent-${timeframe}`)
  ).not.toHaveText("--%");

  await expect(
    page.locator(`#unclear-percent-${timeframe}`)
  ).not.toHaveText("--%");
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

    const importStatus = page.locator("#import-status");

    await expect(importStatus).toContainText(
      "Import successful",
      { timeout: 15000 }
    );

    await expect(importStatus).toContainText(
      "Saved locally"
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

    // Composition UI must restore the same saved local candles.
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

    // Both Master and Composition UI restore from localStorage.
    // No additional Cloudflare candle request should occur on reload.
    expect(apiCalls["1d"]).toBe(initialCalls);
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

    const importStatus = page.locator(
      "#import-status-15m"
    );

    await expect(importStatus).toContainText(
      "Import successful",
      { timeout: 15000 }
    );

    await expect(importStatus).toContainText(
      "Saved locally"
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

    // Both Master and Composition UI restore from localStorage.
    // No additional Cloudflare candle request should occur on reload.
    expect(apiCalls["15m"]).toBe(initialCalls);
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

    const importStatus = page.locator("#import-status");

    await expect(importStatus).toContainText(
      "Import successful",
      { timeout: 15000 }
    );

    await expect(importStatus).toContainText(
      "Saved locally"
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

    await expect(importStatus).toContainText(
      "Import failed",
      { timeout: 15000 }
    );

    await expect(importStatus).toContainText(
      "Previous valid dashboard data preserved."
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

    // The valid import must remain unchanged after a failed import.
    expect(
      storedAfterReload.filename
    ).toBe("valid-before-error.json");

    // Both UIs restore the preserved local data on reload.
    // No additional Cloudflare candle request should occur.
    expect(apiCalls["1d"]).toBe(initialCalls);
  }
);
