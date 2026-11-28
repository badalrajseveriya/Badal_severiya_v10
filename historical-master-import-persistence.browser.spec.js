
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

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, "http://localhost");
      let pathname = decodeURIComponent(requestUrl.pathname);

      if (pathname === "/") pathname = "/index.html";

      const filePath = path.resolve(ROOT, `.${pathname}`);
      const rootPrefix = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;

      if (filePath !== ROOT && !filePath.startsWith(rootPrefix)) {
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
      const status = error.code === "ENOENT" ? 404 : 500;
      response.writeHead(status, {
        "content-type": "text/plain; charset=utf-8"
      });
      response.end(
        status === 404 ? "Not found" : "Browser test server error"
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
    server.close(error => error ? reject(error) : resolve());
  });
});

function makeCandles(
  count,
  intervalMinutes,
  start = Date.UTC(2026, 0, 1, 3, 45)
) {
  return Array.from({ length: count }, (_, i) => {
    const close = 25000 + i;

    return [
      new Date(
        start + i * intervalMinutes * 60 * 1000
      ).toISOString(),
      close - 2,
      close + 5,
      close - 5,
      close,
      1000 + i
    ];
  });
}

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
            index: url.searchParams.get("index") || "NIFTY",
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

test(
  "1D imported candles persist after reload and skip Cloudflare",
  async ({ page }) => {
    const apiCalls = await openDashboard(page);

    const rows = makeCandles(20, 1440);

    await importJsonFile(
      page,
      "#historical-file",
      "persistence-test-1d.json",
      rows
    );

    const status = page.locator("#summary-status-1d");

    await expect(status).toContainText(
      "Import successful",
      { timeout: 15000 }
    );

    await expect(status).toContainText("Saved locally");

    await page.reload();

    await expect(
      page.locator(
        "#master-summary-1d .master-eight-container"
      )
    ).toBeVisible();

    await expect(
      page.locator("#summary-status-1d")
    ).toContainText(
      "Saved historical data loaded",
      { timeout: 15000 }
    );

    await expect(
      page.locator("#summary-status-1d")
    ).toContainText("20 candles");

    await expect(
      page.locator("#summary-status-1d")
    ).toContainText("persistence-test-1d.json");

    // Reload should restore the local import without
    // requesting Cloudflare for the saved timeframe.
    expect(apiCalls["1d"]).toBe(1);
  }
);

test(
  "15M imported candles persist after reload and skip Cloudflare",
  async ({ page }) => {
    const apiCalls = await openDashboard(page);

    const rows = makeCandles(220, 15);

    await importJsonFile(
      page,
      "#historical-file-15m",
      "persistence-test-15m.json",
      rows
    );

    const status = page.locator("#summary-status-15m");

    await expect(status).toContainText(
      "Import successful",
      { timeout: 15000 }
    );

    await expect(status).toContainText("Saved locally");

    await page.reload();

    await expect(
      page.locator(
        "#master-summary-15m .master-eight-container"
      )
    ).toBeVisible();

    await expect(
      page.locator("#summary-status-15m")
    ).toContainText(
      "Saved historical data loaded",
      { timeout: 15000 }
    );

    await expect(
      page.locator("#summary-status-15m")
    ).toContainText("220 candles");

    await expect(
      page.locator("#summary-status-15m")
    ).toContainText("persistence-test-15m.json");

    // Locally saved 15M import takes priority over Cloudflare.
    expect(apiCalls["15m"]).toBe(1);
  }
);

test(
  "invalid import preserves the last saved valid data",
  async ({ page }) => {
    const apiCalls = await openDashboard(page);

    const validRows = makeCandles(20, 1440);

    await importJsonFile(
      page,
      "#historical-file",
      "valid-before-error.json",
      validRows
    );

    const status = page.locator("#summary-status-1d");

    await expect(status).toContainText(
      "Import successful",
      { timeout: 15000 }
    );

    await expect(status).toContainText("Saved locally");

    await page.locator("#historical-file").setInputFiles({
      name: "invalid-import.json",
      mimeType: "application/json",
      buffer: Buffer.from("{ invalid json")
    });

    await expect(status).toContainText(
      "Import failed",
      { timeout: 15000 }
    );

    await expect(status).toContainText(
      "Previous valid dashboard data preserved."
    );

    const storedBeforeReload = await page.evaluate(() => {
      const value = localStorage.getItem(
        "badal-severiya-v12-historical-import-1d"
      );

      return value ? JSON.parse(value) : null;
    });

    expect(storedBeforeReload).not.toBeNull();

    expect(storedBeforeReload.filename).toBe(
      "valid-before-error.json"
    );

    expect(storedBeforeReload.candles).toHaveLength(20);

    await page.reload();

    await expect(status).toContainText(
      "Saved historical data loaded",
      { timeout: 15000 }
    );

    await expect(status).toContainText(
      "valid-before-error.json"
    );

    const storedAfterReload = await page.evaluate(() => {
      const value = localStorage.getItem(
        "badal-severiya-v12-historical-import-1d"
      );

      return value ? JSON.parse(value) : null;
    });

    expect(storedAfterReload).not.toBeNull();

    expect(storedAfterReload.filename).toBe(
      "valid-before-error.json"
    );

    expect(storedAfterReload.candles).toHaveLength(20);

    // Valid saved data must survive the failed import and reload.
    expect(apiCalls["1d"]).toBe(1);
  }
);
