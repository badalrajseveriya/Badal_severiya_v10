
import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

let server;
let baseUrl;

const fixture = {
  app: "BADAL SEVERIYA NEWS INTELLIGENCE",
  version: "1.4.1",
  generatedAt: "2026-11-27T10:00:00.000Z",
  freshnessPolicy: {
    usedFallbackWindow: false
  },
  sourceStatus: [],
  news: [
    {
      title: "Test NIFTY positive news",
      link: "https://example.com/active-news",
      description: "Active test article",
      publishedAt: "2026-11-27T09:00:00.000Z",
      sourceId: "test-source",
      sourceName: "Test Source",
      relevanceCategory: "INDIA_INDEX_CONTEXT",
      sentiment: "POSITIVE",
      sentimentScore: 3,
      relevanceScore: 90,
      freshness: "FRESH",
      niftyRelevant: true,
      impact: "MEDIUM"
    },
    {
      title: "Test stale fallback news",
      link: "https://example.com/stale-news",
      description: "Stale display-only test article",
      publishedAt: "2026-11-26T09:00:00.000Z",
      sourceId: "test-source",
      sourceName: "Test Source",
      relevanceCategory: "INDIA_INDEX_CONTEXT",
      sentiment: "NEGATIVE",
      sentimentScore: -2,
      relevanceScore: 80,
      freshness: "STALE_FALLBACK",
      niftyRelevant: true,
      impact: "LOW"
    }
  ]
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
      const requestUrl = new URL(
        request.url,
        "http://localhost"
      );

      let pathname = decodeURIComponent(requestUrl.pathname);

      if (pathname === "/") {
        pathname = "/index.html";
      }

      const filePath = path.resolve(
        ROOT,
        `.${pathname}`
      );

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
      const status = error.code === "ENOENT" ? 404 : 500;

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
    server.close(error => {
      if (error) reject(error);
      else resolve();
    });
  });
});

async function mockNewsApi(page, payload = fixture) {
  await page.route(
    "**/api/news-intelligence**",
    async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: CORS_HEADERS,
        body: JSON.stringify(payload)
      });
    }
  );
}

async function mockHistoricalApi(page) {
  await page.route(
    "**/badal-severiya-data.mrstarrdbs.workers.dev/**",
    async route => {
      const url = new URL(route.request().url());

      if (url.pathname === "/api/health") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "OK"
          })
        });

        return;
      }

      if (url.pathname === "/api/data/candles") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            app: "BADAL SEVERIYA DATA V11",
            index: url.searchParams.get("index") || "NIFTY",
            timeframe: url.searchParams.get("timeframe") || "1d",
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
}

async function openNewsTestPage(page) {
  await mockNewsApi(page);

  await page.goto(baseUrl);

  await expect(
    page.locator(
      "#master-summary-1d .historical-master-news-context-panel"
    )
  ).toBeVisible();

  await expect(
    page.locator(
      "#master-summary-15m .historical-master-news-context-panel"
    )
  ).toBeVisible();
}

async function openRealDashboard(page) {
  await mockNewsApi(page);
  await mockHistoricalApi(page);

  await page.goto(`${baseUrl}/index.html`);

  await expect(
    page.locator("#master-summary-1d .master-eight-container")
  ).toBeVisible();

  await expect(
    page.locator("#master-summary-15m .master-eight-container")
  ).toBeVisible();

  await expect(
    page.locator(
      "#master-summary-1d .historical-master-news-context-panel"
    )
  ).toBeVisible();

  await expect(
    page.locator(
      "#master-summary-15m .historical-master-news-context-panel"
    )
  ).toBeVisible();
}

test(
  "creates separate 1D and 15M news context panels",
  async ({ page }) => {
    await openNewsTestPage(page);

    await expect(
      page.locator(".historical-master-news-context-panel")
    ).toHaveCount(2);

    await expect(
      page.locator(
        "#master-summary-1d .master-eight-container + .historical-master-news-context-panel"
      )
    ).toBeVisible();

    await expect(
      page.locator(
        "#master-summary-15m .master-eight-container + .historical-master-news-context-panel"
      )
    ).toBeVisible();
  }
);

test(
  "renders active news and keeps stale news display-only",
  async ({ page }) => {
    await openNewsTestPage(page);

    const panel = page.locator(
      "#master-summary-1d .historical-master-news-context-panel"
    );

    await expect(
      panel.locator(".news-context-status")
    ).toContainText("News Context तैयार");

    await expect(
      panel.locator(".news-context-summary")
    ).toContainText("POSITIVE NEWS CONTEXT");

    await expect(
      panel.locator(".news-context-summary")
    ).toContainText("Stale Display Only");

    await expect(
      panel.locator(".news-context-articles")
    ).toContainText("Test NIFTY positive news");

    await expect(
      panel.locator(".news-context-articles")
    ).toContainText("Test stale fallback news");

    await expect(
      panel.locator(".news-context-articles")
    ).toContainText(
      "DISPLAY ONLY — ACTIVE CONTEXT में शामिल नहीं"
    );
  }
);

test(
  "renders safe HTTPS links and never makes unsafe links clickable",
  async ({ page }) => {
    const payload = {
      ...fixture,
      news: [
        ...fixture.news,
        {
          ...fixture.news[0],
          title: "Unsafe JavaScript URL",
          link: "javascript:alert(1)"
        },
        {
          ...fixture.news[0],
          title: "Credential URL",
          link: "https://user:password@example.com/article"
        }
      ]
    };

    await mockNewsApi(page, payload);
    await page.goto(baseUrl);

    const panel = page.locator(
      "#master-summary-1d .historical-master-news-context-panel"
    );

    await expect(
      panel.locator(".news-context-status")
    ).toContainText("News Context तैयार");

    const safeLink = panel.locator(
      'a[href="https://example.com/active-news"]'
    ).first();

    await expect(safeLink).toBeVisible();

    await expect(safeLink).toHaveAttribute(
      "rel",
      "noopener noreferrer"
    );

    await expect(
      panel.locator('a[href^="javascript:"]')
    ).toHaveCount(0);

    await expect(
      panel.locator('a[href*="user:password"]')
    ).toHaveCount(0);

    await expect(
      panel.locator(".news-context-articles")
    ).not.toContainText("Unsafe JavaScript URL");
  }
);

test(
  "refresh button calls refresh API and restores its state",
  async ({ page }) => {
    let refreshRequests = 0;

    await page.route(
      "**/api/news-intelligence**",
      async route => {
        if (route.request().url().includes("refresh=1")) {
          refreshRequests++;
        }

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: CORS_HEADERS,
          body: JSON.stringify(fixture)
        });
      }
    );

    await page.goto(baseUrl);

    const panel = page.locator(
      "#master-summary-1d .historical-master-news-context-panel"
    );

    const button = panel.locator(
      ".news-context-refresh"
    );

    await expect(button).toBeEnabled();

    await button.click();

    await expect.poll(
      () => refreshRequests
    ).toBe(1);

    await expect(button).toBeEnabled();

    await expect(button).toHaveText(
      "REFRESH NEWS CONTEXT"
    );
  }
);

test(
  "real index.html initializes both eight-panels and both news panels",
  async ({ page }) => {
    const pageErrors = [];

    page.on("pageerror", error => {
      pageErrors.push(error.message);
    });

    await openRealDashboard(page);

    for (const timeframe of ["1d", "15m"]) {
      const summary = page.locator(
        `#master-summary-${timeframe}`
      );

      const eightPanel = summary.locator(
        ".master-eight-container"
      );

      const newsPanel = summary.locator(
        ".historical-master-news-context-panel"
      );

      await expect(eightPanel).toBeVisible();
      await expect(newsPanel).toBeVisible();

      const order = await summary.evaluate(element => {
        const percentage = element.querySelector(".percentage-grid");
        const eight = element.querySelector(".master-eight-container");
        const news = element.querySelector(
          ".historical-master-news-context-panel"
        );

        return {
          percentageBeforeEight: Boolean(
            percentage &&
            eight &&
            percentage.compareDocumentPosition(eight) &
              Node.DOCUMENT_POSITION_FOLLOWING
          ),
          eightBeforeNews: Boolean(
            eight &&
            news &&
            eight.compareDocumentPosition(news) &
              Node.DOCUMENT_POSITION_FOLLOWING
          )
        };
      });

      expect(order.percentageBeforeEight).toBe(true);
      expect(order.eightBeforeNews).toBe(true);

      await expect(
        newsPanel.locator(".news-context-status")
      ).toContainText("News Context तैयार");
    }

    expect(pageErrors).toEqual([]);
  }
);
